import { PermissionCode } from '../permissions';

/** Identidad del usuario autenticado y empresa activa, resuelta por JwtAuthGuard en cada request. */
export interface AuthContext {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  sessionFamilyId: string;
  /** Empresa activa (tenant). Ausente si el usuario aún no seleccionó empresa. */
  companyId?: string;
  roleId?: string;
  permissions: Set<PermissionCode>;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  cid?: string;
  sid: string;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}
