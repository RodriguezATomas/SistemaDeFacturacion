import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { AccessTokenPayload, RequestMeta } from '../../common/context/auth-context';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Emisión y rotación de tokens.
 * - Access token: JWT corto (JWT_ACCESS_TTL) con usuario, empresa activa y familia de sesión.
 * - Refresh token: opaco, guardado como hash SHA-256, rotado en cada uso. Si se presenta un
 *   refresh ya rotado (posible robo), se revoca toda la familia de sesión.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async issue(
    user: { id: string; email: string },
    companyId: string | null,
    meta: RequestMeta,
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(
      Date.now() + this.config.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        companyId,
        expiresAt: refreshExpiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
      },
    });
    const accessToken = await this.signAccess(user, companyId, familyId);
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  async signAccess(
    user: { id: string; email: string },
    companyId: string | null,
    familyId: string,
  ): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      sid: familyId,
      ...(companyId ? { cid: companyId } : {}),
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      expiresIn: this.config.env.JWT_ACCESS_TTL as unknown as number,
    });
  }

  /** Rota un refresh token. Devuelve los nuevos tokens y el usuario asociado. */
  async rotate(
    presented: string,
    meta: RequestMeta,
    overrideCompanyId?: string | null,
  ): Promise<IssuedTokens & { userId: string; companyId: string | null }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(presented) },
      include: { user: { select: { id: true, email: true, isActive: true, deletedAt: true } } },
    });
    if (!existing) throw new UnauthorizedException('Sesión inválida');

    if (existing.revokedAt) {
      // Reutilización de un token ya rotado: se revoca toda la sesión.
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sesión inválida');
    }
    if (existing.expiresAt <= new Date() || !existing.user.isActive || existing.user.deletedAt) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sesión vencida');
    }

    const companyId = overrideCompanyId === undefined ? existing.companyId : overrideCompanyId;
    // Revocación condicional: solo una petición concurrente puede rotar el mismo token.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sesión inválida');
    }
    const issued = await this.issue(existing.user, companyId, meta, existing.familyId);
    return { ...issued, userId: existing.userId, companyId };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
