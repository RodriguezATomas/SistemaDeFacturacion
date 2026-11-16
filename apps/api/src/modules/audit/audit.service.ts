import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate, PaginationQueryDto, skipTake } from '../../common/dto/pagination.dto';
import { RequestMeta } from '../../common/context/auth-context';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  meta?: RequestMeta;
}

export interface AuditQuery extends PaginationQueryDto {
  entity?: string;
  action?: string;
  userId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una acción relevante. Un fallo al auditar se registra en el log pero no
   * interrumpe la operación de negocio que ya fue confirmada.
   */
  async log(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    try {
      await tx.auditLog.create({
        data: {
          companyId: entry.companyId ?? null,
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata,
          ip: entry.meta?.ip,
          userAgent: entry.meta?.userAgent?.slice(0, 500),
        },
      });
    } catch (err) {
      this.logger.error(`No se pudo registrar auditoría ${entry.action}`, err as Error);
    }
  }

  async list(companyId: string, q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, q);
  }
}
