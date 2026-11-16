import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { paginate, PaginationQueryDto, searchFilter, skipTake } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto, normalizeDocument, UpdateCustomerDto, validateDocument } from './party.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, q: PaginationQueryDto) {
    const where: Prisma.CustomerWhereInput = {
      companyId,
      deletedAt: null,
      ...searchFilter(q.search, ['name', 'documentNumber', 'email']),
    };
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        ...skipTake(q),
        include: { priceList: { select: { id: true, name: true } } },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  async get(companyId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { priceList: { select: { id: true, name: true } } },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async create(auth: AuthContext, companyId: string, dto: CreateCustomerDto, meta: RequestMeta) {
    await this.assertPriceList(companyId, dto.priceListId);
    const customer = await this.prisma.customer.create({
      data: {
        ...dto,
        documentNumber: normalizeDocument(dto.documentType, dto.documentNumber),
        companyId,
      },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'customer.create',
      entity: 'customer',
      entityId: customer.id,
      meta,
    });
    return customer;
  }

  async update(auth: AuthContext, companyId: string, id: string, dto: UpdateCustomerDto, meta: RequestMeta) {
    const current = await this.get(companyId, id);
    const documentType = dto.documentType ?? current.documentType;
    const documentNumber = dto.documentNumber ?? current.documentNumber;
    const docError = validateDocument(documentType, documentNumber);
    if (docError) throw new BadRequestException(docError);
    await this.assertPriceList(companyId, dto.priceListId);

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { ...dto, documentNumber: normalizeDocument(documentType, documentNumber) },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'customer.update',
      entity: 'customer',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
      meta,
    });
    return customer;
  }

  /** Eliminación lógica: los comprobantes emitidos conservan el snapshot del receptor. */
  async remove(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    await this.get(companyId, id);
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'customer.delete',
      entity: 'customer',
      entityId: id,
      meta,
    });
  }

  private async assertPriceList(companyId: string, priceListId?: string | null) {
    if (!priceListId) return;
    const list = await this.prisma.priceList.findFirst({
      where: { id: priceListId, companyId, deletedAt: null },
    });
    if (!list) throw new BadRequestException('Lista de precios inexistente');
  }
}
