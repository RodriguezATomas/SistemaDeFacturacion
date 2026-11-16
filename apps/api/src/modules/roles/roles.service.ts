import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { ALL_PERMISSION_CODES } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface RoleInput {
  name: string;
  description?: string | null;
  permissions: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  permissionsCatalog() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  }

  async list(companyId: string) {
    const roles = await this.prisma.role.findMany({
      where: { companyId },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
        _count: { select: { members: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      systemKey: r.systemKey,
      membersCount: r._count.members,
      permissions: r.permissions.map((p) => p.permission.code),
    }));
  }

  async create(auth: AuthContext, companyId: string, input: RoleInput, meta: RequestMeta) {
    const permissionIds = await this.resolvePermissions(input.permissions);
    await this.assertUniqueName(companyId, input.name);
    const role = await this.prisma.role.create({
      data: {
        companyId,
        name: input.name,
        description: input.description,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'role.create',
      entity: 'role',
      entityId: role.id,
      metadata: { name: input.name, permissions: input.permissions },
      meta,
    });
    return role;
  }

  async update(auth: AuthContext, companyId: string, id: string, input: RoleInput, meta: RequestMeta) {
    const role = await this.find(companyId, id);
    if (role.systemKey === 'owner') {
      throw new BadRequestException('El rol Propietario no puede modificarse');
    }
    if (input.name !== role.name) {
      if (role.isSystem) throw new BadRequestException('No se puede renombrar un rol de sistema');
      await this.assertUniqueName(companyId, input.name);
    }
    const permissionIds = await this.resolvePermissions(input.permissions);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      return tx.role.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
      });
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'role.update',
      entity: 'role',
      entityId: id,
      metadata: { name: input.name, permissions: input.permissions },
      meta,
    });
    return updated;
  }

  async remove(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    const role = await this.find(companyId, id);
    if (role.isSystem) throw new BadRequestException('Los roles de sistema no pueden eliminarse');
    const members = await this.prisma.companyUser.count({ where: { roleId: id } });
    if (members > 0) {
      throw new ConflictException('El rol tiene usuarios asignados. Reasígnelos antes de eliminarlo.');
    }
    await this.prisma.role.delete({ where: { id } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'role.delete',
      entity: 'role',
      entityId: id,
      metadata: { name: role.name },
      meta,
    });
  }

  private async find(companyId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, companyId } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return role;
  }

  private async assertUniqueName(companyId: string, name: string) {
    const dup = await this.prisma.role.findFirst({
      where: { companyId, name: { equals: name, mode: 'insensitive' } },
    });
    if (dup) throw new ConflictException('Ya existe un rol con ese nombre');
  }

  private async resolvePermissions(codes: string[]): Promise<string[]> {
    const unknown = codes.filter((c) => !(ALL_PERMISSION_CODES as string[]).includes(c));
    if (unknown.length) throw new BadRequestException(`Permisos inexistentes: ${unknown.join(', ')}`);
    const perms = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    return perms.map((p) => p.id);
  }
}
