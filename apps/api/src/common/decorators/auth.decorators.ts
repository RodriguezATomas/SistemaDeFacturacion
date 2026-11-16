import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { AuthContext, RequestMeta } from '../context/auth-context';
import { PermissionCode } from '../permissions';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'permissions';
export const PLATFORM_ADMIN_KEY = 'platformAdmin';
export const NO_COMPANY_KEY = 'noCompanyRequired';
export const ALLOW_INACTIVE_SUBSCRIPTION_KEY = 'allowInactiveSubscription';

/** Endpoint accesible sin autenticación. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requiere que el rol del usuario en la empresa activa tenga todos los permisos indicados. */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Solo administradores de la plataforma SaaS. */
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_KEY, true);

/** El endpoint no requiere empresa activa (p. ej. perfil, listado de empresas del usuario). */
export const NoCompanyRequired = () => SetMetadata(NO_COMPANY_KEY, true);

/** Permite operaciones de escritura aunque la suscripción no esté vigente. */
export const AllowInactiveSubscription = () => SetMetadata(ALLOW_INACTIVE_SUBSCRIPTION_KEY, true);

type AuthenticatedRequest = Request & { auth?: AuthContext };

export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.auth) throw new Error('CurrentAuth usado en un endpoint sin autenticación');
  return req.auth;
});

/** Id de la empresa activa. Solo en endpoints que requieren empresa (garantizado por el guard). */
export const CompanyId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  const companyId = req.auth?.companyId;
  if (!companyId) throw new Error('CompanyId usado en un endpoint sin empresa activa');
  return companyId;
});

export const ReqMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
});
