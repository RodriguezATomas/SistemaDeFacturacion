import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { paginate, PaginationQueryDto, searchFilter, skipTake } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto, normalizeDocument, UpdateSupplierDto, validateDocument } from './party.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, q: PaginationQueryDto) {
    const where: Prisma.SupplierWhereInput = {
      companyId,
      deletedAt: null,
      ...searchFilter(q.search, ['name', 'documentNumber', 'email', 'contactName']),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(q) }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  async get(companyId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  async create(auth: AuthContext, companyId: string, dto: CreateSupplierDto, meta: RequestMeta) {
    const supplier = await this.prisma.supplier.create({
      data: { ...dto, documentNumber: normalizeDocument(dto.documentType, dto.documentNumber), companyId },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'supplier.create',
      entity: 'supplier',
      entityId: supplier.id,
      meta,
    });
    return supplier;
  }

  async update(auth: AuthContext, companyId: string, id: string, dto: UpdateSupplierDto, meta: RequestMeta) {
    const current = await this.get(companyId, id);
    const documentType = dto.documentType ?? current.documentType;
    const documentNumber = dto.documentNumber ?? current.documentNumber;
    const docError = validateDocument(documentType, documentNumber);
    if (docError) throw new BadRequestException(docError);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: { ...dto, documentNumber: normalizeDocument(documentType, documentNumber) },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'supplier.update',
      entity: 'supplier',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
      meta,
    });
    return supplier;
  }

  async remove(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    await this.get(companyId, id);
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'supplier.delete',
      entity: 'supplier',
      entityId: id,
      meta,
    });
  }
}
