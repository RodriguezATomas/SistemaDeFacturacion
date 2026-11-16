import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PERMISSIONS, SYSTEM_ROLE_TEMPLATES } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Mantiene sincronizado el catálogo de permisos con la base al iniciar, y asigna los permisos
 * nuevos a los roles de sistema existentes (Propietario/Administrador reciben todos).
 */
@Injectable()
export class PermissionsSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sync();
  }

  async sync(): Promise<void> {
    for (const p of Object.values(PERMISSIONS)) {
      await this.prisma.permission.upsert({
        where: { code: p.code },
        update: { module: p.module, description: p.description },
        create: p,
      });
    }
    const permissions = await this.prisma.permission.findMany();
    const idByCode = new Map(permissions.map((p) => [p.code, p.id]));

    for (const tpl of SYSTEM_ROLE_TEMPLATES) {
      const roles = await this.prisma.role.findMany({
        where: { systemKey: tpl.key, isSystem: true },
        select: { id: true },
      });
      if (!roles.length) continue;
      const data = roles.flatMap((r) =>
        tpl.permissions
          .map((code) => idByCode.get(code))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: r.id, permissionId })),
      );
      if (tpl.key === 'owner' || tpl.key === 'admin') {
        await this.prisma.rolePermission.createMany({ data, skipDuplicates: true });
      }
    }
    this.logger.log(`Catálogo de permisos sincronizado (${permissions.length})`);
  }
}
