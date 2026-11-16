import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordTokenPurpose } from '@prisma/client';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompanyProvisioningService } from '../companies/company-provisioning.service';
import { MailService } from '../mail/mail.service';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { PasswordService } from './password.service';
import { IssuedTokens, TokenService } from './token.service';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL_MIN = 60;
export const INVITE_TOKEN_TTL_HOURS = 72;

export interface SessionResult extends IssuedTokens {
  activeCompanyId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly provisioning: CompanyProvisioningService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /** Registro público de usuario + empresa (solo modalidad SaaS). */
  async register(dto: RegisterDto, meta: RequestMeta): Promise<SessionResult> {
    if (!this.config.isSaas) {
      throw new ForbiddenException(
        'El registro público está deshabilitado en instalaciones privadas. Solicite acceso al administrador.',
      );
    }
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Ya existe una cuenta con ese email');

    const passwordHash = await this.passwords.hash(dto.password);
    const { user, company } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName },
      });
      const company = await this.provisioning.provision(tx, dto.company, user.id);
      return { user, company };
    });

    await this.audit.log({
      companyId: company.id,
      userId: user.id,
      action: 'auth.register',
      entity: 'company',
      entityId: company.id,
      meta,
    });
    const issued = await this.tokens.issue(user, company.id, meta);
    return { ...issued, activeCompanyId: company.id };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const invalid = new UnauthorizedException('Email o contraseña incorrectos');

    if (!user || user.deletedAt || !user.isActive) {
      // Igualar tiempos de respuesta para no revelar existencia de cuentas.
      await this.passwords.verifyDummy(dto.password);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'La cuenta está bloqueada temporalmente por intentos fallidos. Intente más tarde.',
      );
    }

    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      });
      await this.audit.log({
        userId: user.id,
        action: lock ? 'auth.locked' : 'auth.login_failed',
        entity: 'user',
        entityId: user.id,
        meta,
      });
      throw invalid;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const memberships = await this.activeMemberships(user.id);
    const activeCompanyId = memberships.length === 1 ? memberships[0].companyId : null;
    await this.audit.log({
      companyId: activeCompanyId,
      userId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      meta,
    });
    const issued = await this.tokens.issue(user, activeCompanyId, meta);
    return { ...issued, activeCompanyId };
  }

  async refresh(refreshToken: string | undefined, meta: RequestMeta): Promise<SessionResult> {
    if (!refreshToken) throw new UnauthorizedException('Sesión no iniciada');
    const rotated = await this.tokens.rotate(refreshToken, meta);
    return { ...rotated, activeCompanyId: rotated.companyId };
  }

  async switchCompany(
    auth: AuthContext,
    companyId: string,
    refreshToken: string | undefined,
    meta: RequestMeta,
  ): Promise<SessionResult> {
    if (!refreshToken) throw new UnauthorizedException('Sesión no iniciada');
    const membership = await this.prisma.companyUser.findUnique({
      where: { companyId_userId: { companyId, userId: auth.userId } },
      include: { company: true },
    });
    if (
      !membership ||
      membership.status !== 'ACTIVE' ||
      membership.company.deletedAt ||
      membership.company.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException('No tiene acceso a esa empresa');
    }
    const rotated = await this.tokens.rotate(refreshToken, meta, companyId);
    if (rotated.userId !== auth.userId) throw new UnauthorizedException('Sesión inválida');
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'auth.switch_company',
      entity: 'company',
      entityId: companyId,
      meta,
    });
    return { ...rotated, activeCompanyId: companyId };
  }

  async logout(auth: AuthContext, meta: RequestMeta): Promise<void> {
    await this.tokens.revokeFamily(auth.sessionFamilyId);
    await this.audit.log({
      companyId: auth.companyId,
      userId: auth.userId,
      action: 'auth.logout',
      entity: 'user',
      entityId: auth.userId,
      meta,
    });
  }

  async me(auth: AuthContext) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { id: true, email: true, firstName: true, lastName: true, isPlatformAdmin: true },
    });
    const memberships = await this.activeMemberships(auth.userId);
    return {
      user,
      deploymentMode: this.config.env.DEPLOYMENT_MODE,
      companies: memberships.map((m) => ({
        id: m.company.id,
        legalName: m.company.legalName,
        tradeName: m.company.tradeName,
        cuit: m.company.cuit,
        role: m.role.name,
      })),
      activeCompanyId: auth.companyId ?? null,
      permissions: [...auth.permissions],
    };
  }

  async updateProfile(auth: AuthContext, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: auth.userId },
      data: dto,
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }

  async changePassword(auth: AuthContext, dto: ChangePasswordDto, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(dto.newPassword) },
    });
    // Cierra las demás sesiones abiertas.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null, NOT: { familyId: auth.sessionFamilyId } },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      companyId: auth.companyId,
      userId: user.id,
      action: 'auth.password_changed',
      entity: 'user',
      entityId: user.id,
      meta,
    });
  }

  /** Siempre responde igual, exista o no el email, para no permitir enumeración de cuentas. */
  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || !user.isActive) return;
    const token = await this.createPasswordToken(user.id, 'RESET', RESET_TOKEN_TTL_MIN * 60 * 1000);
    const link = this.mail.link(`/restablecer-clave?token=${encodeURIComponent(token)}`);
    await this.mail.send({
      to: user.email,
      subject: 'Recuperación de contraseña',
      text: `Hola ${user.firstName}:\n\nRecibimos una solicitud para restablecer tu contraseña. Ingresá al siguiente enlace (válido por ${RESET_TOKEN_TTL_MIN} minutos):\n\n${link}\n\nSi no fuiste vos, ignorá este mensaje.`,
    });
    await this.audit.log({
      userId: user.id,
      action: 'auth.password_reset_requested',
      entity: 'user',
      entityId: user.id,
      meta,
    });
  }

  /** Restablece contraseña (recuperación) o define la primera contraseña (invitación). */
  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta): Promise<void> {
    const record = await this.prisma.passwordToken.findUnique({
      where: { tokenHash: sha256(dto.token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('El enlace es inválido o venció. Solicite uno nuevo.');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.passwordToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count === 0) throw new BadRequestException('El enlace ya fue utilizado');
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      if (record.purpose === 'INVITE') {
        await tx.companyUser.updateMany({
          where: { userId: record.userId, status: 'INVITED' },
          data: { status: 'ACTIVE' },
        });
      }
    });
    await this.tokens.revokeAllForUser(record.userId);
    await this.audit.log({
      userId: record.userId,
      action: record.purpose === 'INVITE' ? 'auth.invitation_accepted' : 'auth.password_reset',
      entity: 'user',
      entityId: record.userId,
      meta,
    });
  }

  async createPasswordToken(
    userId: string,
    purpose: PasswordTokenPurpose,
    ttlMs: number,
  ): Promise<string> {
    const token = randomToken(32);
    await this.prisma.passwordToken.create({
      data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return token;
  }

  private activeMemberships(userId: string) {
    return this.prisma.companyUser.findMany({
      where: { userId, status: 'ACTIVE', company: { deletedAt: null, status: 'ACTIVE' } },
      include: { company: true, role: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
