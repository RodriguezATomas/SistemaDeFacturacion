import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { paginate, searchFilter, skipTake } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto, ProductsQueryDto, UpdateProductDto } from './catalog.dto';
import { effectivePrice } from './pricing';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, q: ProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      companyId,
      deletedAt: null,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.active !== undefined ? { isActive: q.active } : {}),
      ...searchFilter(q.search, ['name', 'sku', 'description']),
    };
    const list = q.priceListId
      ? await this.prisma.priceList.findFirst({ where: { id: q.priceListId, companyId, deletedAt: null } })
      : null;
    if (q.priceListId && !list) throw new BadRequestException('Lista de precios inexistente');

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        ...skipTake(q),
        include: {
          category: { select: { id: true, name: true } },
          ...(list ? { priceListItems: { where: { priceListId: list.id } } } : {}),
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const data = rows.map(({ priceListItems, ...p }) => ({
      ...p,
      effectivePrice: effectivePrice(
        p.price,
        list ? { adjustmentPercent: list.adjustmentPercent, itemPrice: priceListItems?.[0]?.price } : null,
      ).toFixed(4),
    }));
    return paginate(data, total, q);
  }

  async get(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async create(auth: AuthContext, companyId: string, dto: CreateProductDto, meta: RequestMeta) {
    await this.validate(companyId, dto);
    const product = await this.prisma.product.create({
      data: { ...this.normalize(dto), companyId } as Prisma.ProductUncheckedCreateInput,
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'product.create',
      entity: 'product',
      entityId: product.id,
      meta,
    });
    return product;
  }

  async update(auth: AuthContext, companyId: string, id: string, dto: UpdateProductDto, meta: RequestMeta) {
    const current = await this.get(companyId, id);
    await this.validate(companyId, dto, id);
    const merged = { vatTreatment: current.vatTreatment, ...dto };
    const product = await this.prisma.product.update({
      where: { id },
      data: this.normalize(merged),
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'product.update',
      entity: 'product',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
      meta,
    });
    return product;
  }

  async remove(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    await this.get(companyId, id);
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'product.delete',
      entity: 'product',
      entityId: id,
      meta,
    });
  }

  /** Para ítems exentos o no gravados la alícuota se fija en 0. */
  private normalize<T extends Partial<CreateProductDto>>(dto: T): T {
    if (dto.vatTreatment && dto.vatTreatment !== 'GRAVADO') return { ...dto, vatRate: 0 };
    return dto;
  }

  private async validate(companyId: string, dto: Partial<CreateProductDto>, excludeId?: string) {
    if (dto.categoryId) {
      const cat = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, companyId, deletedAt: null },
      });
      if (!cat) throw new BadRequestException('Categoría inexistente');
    }
    if (dto.sku) {
      const dup = await this.prisma.product.findFirst({
        where: {
          companyId,
          deletedAt: null,
          sku: { equals: dto.sku, mode: 'insensitive' },
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
      });
      if (dup) throw new ConflictException('Ya existe un producto con ese código (SKU)');
    }
  }
}
