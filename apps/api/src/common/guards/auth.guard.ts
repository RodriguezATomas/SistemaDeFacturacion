import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessTokenPayload, AuthContext } from '../context/auth-context';
import {
  ALLOW_INACTIVE_SUBSCRIPTION_KEY,
  IS_PUBLIC_KEY,
  NO_COMPANY_KEY,
  PERMISSIONS_KEY,
  PLATFORM_ADMIN_KEY,
} from '../decorators/auth.decorators';
import { PermissionCode } from '../permissions';
import { isSubscriptionWritable } from '../utils/subscription';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Guard global de autenticación, aislamiento de tenant y autorización.
 * 1. Verifica el JWT de acceso y que la sesión (familia de refresh) siga vigente.
 * 2. Resuelve la empresa activa validando la membresía en base de datos en cada request,
 *    de modo que un usuario removido o una empresa suspendida pierden acceso de inmediato.
 * 3. Verifica permisos del rol y, en SaaS, que la suscripción permita escribir.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const payload = await this.verifyToken(req);

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, isActive: true },
      select: { id: true, email: true, isPlatformAdmin: true },
    });
    if (!user) throw new UnauthorizedException('Sesión inválida');

    const activeSession = await this.prisma.refreshToken.count({
      where: { familyId: payload.sid, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (activeSession === 0) throw new UnauthorizedException('La sesión fue cerrada');

    const auth: AuthContext = {
      userId: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      sessionFamilyId: payload.sid,
      permissions: new Set(),
    };

    if (payload.cid) {
      const membership = await this.prisma.companyUser.findUnique({
        where: { companyId_userId: { companyId: payload.cid, userId: user.id } },
        include: {
          company: { select: { status: true, deletedAt: true, subscription: true } },
          role: { include: { permissions: { include: { permission: true } } } },
        },
      });
      if (
        !membership ||
        membership.status !== 'ACTIVE' ||
        membership.company.deletedAt ||
        membership.company.status !== 'ACTIVE'
      ) {
        throw new ForbiddenException('No tiene acceso a la empresa seleccionada');
      }
      auth.companyId = payload.cid;
      auth.roleId = membership.roleId;
      auth.permissions = new Set(
        membership.role.permissions.map((rp) => rp.permission.code as PermissionCode),
      );

      const allowInactive = this.reflector.getAllAndOverride<boolean>(
        ALLOW_INACTIVE_SUBSCRIPTION_KEY,
        targets,
      );
      if (
        this.config.isSaas &&
        !READ_METHODS.has(req.method) &&
        !allowInactive &&
        !isSubscriptionWritable(membership.company.subscription)
      ) {
        throw new ForbiddenException(
          'La suscripción de la empresa no está vigente. El sistema está en modo de solo lectura.',
        );
      }
    }

    req.auth = auth;

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_KEY, targets)) {
      if (!user.isPlatformAdmin) throw new ForbiddenException('Requiere administrador de plataforma');
      return true;
    }

    const noCompany = this.reflector.getAllAndOverride<boolean>(NO_COMPANY_KEY, targets);
    if (!noCompany && !auth.companyId) {
      throw new ForbiddenException('Debe seleccionar una empresa para continuar');
    }

    const required = this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, targets);
    if (required?.length) {
      const missing = required.filter((p) => !auth.permissions.has(p));
      if (missing.length) {
        throw new ForbiddenException(`Permisos insuficientes: ${missing.join(', ')}`);
      }
    }
    return true;
  }

  private async verifyToken(req: Request): Promise<AccessTokenPayload> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token de acceso requerido');
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7), {
        secret: this.config.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o vencido');
    }
  }
}
