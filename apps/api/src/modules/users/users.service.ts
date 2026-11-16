import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyUserStatus } from '@prisma/client';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService, INVITE_TOKEN_TTL_HOURS } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { PlanLimitsService } from '../companies/plan-limits.service';
import { MailService } from '../mail/mail.service';

export interface InviteUserInput {
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
}

export interface UpdateMemberInput {
  roleId?: string;
  status?: Extract<CompanyUserStatus, 'ACTIVE' | 'DISABLED'>;
}

const memberSelect = {
  id: true,
  status: true,
  createdAt: true,
  role: { select: { id: true, name: true, systemKey: true } },
  user: { select: { id: true, email: true, firstName: true, lastName: true, lastLoginAt: true } },
} as const;

/** Gestión de usuarios de la empresa activa (membresías). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
    private readonly limits: PlanLimitsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.companyUser.findMany({
      where: { companyId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(auth: AuthContext, companyId: string, input: InviteUserInput, meta: RequestMeta) {
    await this.assertRole(companyId, input.roleId);
    await this.limits.assertCanAddUser(companyId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    let user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user) {
      const existing = await this.prisma.companyUser.findUnique({
        where: { companyId_userId: { companyId, userId: user.id } },
      });
      if (existing) throw new ConflictException('El usuario ya pertenece a la empresa');
    }

    const isNewUser = !user || !user.passwordHash;
    const member = await this.prisma.$transaction(async (tx) => {
      if (!user) {
        user = await tx.user.create({
          data: { email: input.email, firstName: input.firstName, lastName: input.lastName },
        });
      }
      return tx.companyUser.create({
        data: {
          companyId,
          userId: user.id,
          roleId: input.roleId,
          status: isNewUser ? 'INVITED' : 'ACTIVE',
        },
        select: memberSelect,
      });
    });

    if (isNewUser) {
      await this.sendInvitation(user!.id, user!.email, user!.firstName, company.legalName);
    } else {
      await this.mail.send({
        to: user!.email,
        subject: `Fuiste agregado a ${company.legalName}`,
        text: `Hola ${user!.firstName}:\n\nTe agregaron a la empresa ${company.legalName}. Ingresá con tu cuenta habitual: ${this.mail.link('/login')}`,
      });
    }
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'user.invite',
      entity: 'company_user',
      entityId: member.id,
      metadata: { email: input.email, roleId: input.roleId },
      meta,
    });
    return member;
  }

  async resendInvite(auth: AuthContext, companyId: string, memberId: string, meta: RequestMeta) {
    const member = await this.findMember(companyId, memberId);
    if (member.status !== 'INVITED') throw new BadRequestException('El usuario ya aceptó la invitación');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    await this.sendInvitation(member.user.id, member.user.email, member.user.firstName, company.legalName);
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'user.invite_resent',
      entity: 'company_user',
      entityId: memberId,
      meta,
    });
  }

  async update(
    auth: AuthContext,
    companyId: string,
    memberId: string,
    input: UpdateMemberInput,
    meta: RequestMeta,
  ) {
    const member = await this.findMember(companyId, memberId);
    if (member.user.id === auth.userId) {
      throw new BadRequestException('No puede modificar su propio rol o estado');
    }
    if (input.roleId) await this.assertRole(companyId, input.roleId);

    const losesOwner =
      member.role.systemKey === 'owner' &&
      ((input.roleId && input.roleId !== member.role.id) || input.status === 'DISABLED');
    if (losesOwner) await this.assertAnotherOwner(companyId, memberId);
    if (input.status && member.status === 'INVITED') {
      throw new BadRequestException('El usuario aún no aceptó la invitación');
    }

    const updated = await this.prisma.companyUser.update({
      where: { id: memberId },
      data: input,
      select: memberSelect,
    });
    if (input.status === 'DISABLED') {
      // Sus sesiones abiertas en esta empresa dejan de ser válidas (el guard revalida la membresía).
      await this.prisma.refreshToken.updateMany({
        where: { userId: member.user.id, companyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'user.update',
      entity: 'company_user',
      entityId: memberId,
      metadata: { ...input },
      meta,
    });
    return updated;
  }

  async remove(auth: AuthContext, companyId: string, memberId: string, meta: RequestMeta) {
    const member = await this.findMember(companyId, memberId);
    if (member.user.id === auth.userId) throw new BadRequestException('No puede quitarse a sí mismo');
    if (member.role.systemKey === 'owner') await this.assertAnotherOwner(companyId, memberId);
    await this.prisma.companyUser.delete({ where: { id: memberId } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: member.user.id, companyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'user.remove',
      entity: 'company_user',
      entityId: memberId,
      metadata: { email: member.user.email },
      meta,
    });
  }

  private async sendInvitation(userId: string, email: string, firstName: string, companyName: string) {
    const token = await this.authService.createPasswordToken(
      userId,
      'INVITE',
      INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );
    const link = this.mail.link(`/restablecer-clave?token=${encodeURIComponent(token)}&invitacion=1`);
    await this.mail.send({
      to: email,
      subject: `Invitación a ${companyName}`,
      text: `Hola ${firstName}:\n\nFuiste invitado a usar el sistema de facturación de ${companyName}. Definí tu contraseña en el siguiente enlace (válido por ${INVITE_TOKEN_TTL_HOURS} horas):\n\n${link}`,
    });
  }

  private async findMember(companyId: string, memberId: string) {
    const member = await this.prisma.companyUser.findFirst({
      where: { id: memberId, companyId },
      select: memberSelect,
    });
    if (!member) throw new NotFoundException('Usuario no encontrado en la empresa');
    return member;
  }

  private async assertRole(companyId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) throw new BadRequestException('Rol inexistente');
  }

  private async assertAnotherOwner(companyId: string, excludingMemberId: string) {
    const owners = await this.prisma.companyUser.count({
      where: {
        companyId,
        status: 'ACTIVE',
        role: { systemKey: 'owner' },
        NOT: { id: excludingMemberId },
      },
    });
    if (owners === 0) {
      throw new BadRequestException('La empresa debe conservar al menos un propietario activo');
    }
  }
}
