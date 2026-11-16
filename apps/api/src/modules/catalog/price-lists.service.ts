import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePriceListDto, SetPriceListItemsDto, UpdatePriceListDto } from './catalog.dto';

@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string) {
    const lists = await this.prisma.priceList.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true, customers: true } } },
    });
    return lists.map(({ _count, ...l }) => ({ ...l, itemsCount: _count.items, customersCount: _count.customers }));
  }

  async get(companyId: string, id: string) {
    const list = await this.prisma.priceList.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, sku: true, price: true, unit: true } } },
          orderBy: { product: { name: 'asc' } },
        },
      },
    });
    if (!list) throw new NotFoundException('Lista de precios no encontrada');
    return list;
  }

  async create(auth: AuthContext, companyId: string, dto: CreatePriceListDto, meta: RequestMeta) {
    await this.assertUnique(companyId, dto.name);
    const list = await this.prisma.priceList.create({ data: { ...dto, companyId } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'price_list.create',
      entity: 'price_list',
      entityId: list.id,
      meta,
    });
    return list;
  }

  async update(auth: AuthContext, companyId: string, id: string, dto: UpdatePriceListDto, meta: RequestMeta) {
    const current = await this.get(companyId, id);
    if (dto.name && dto.name.toLowerCase() !== current.name.toLowerCase()) {
      await this.assertUnique(companyId, dto.name);
    }
    const list = await this.prisma.priceList.update({ where: { id }, data: dto });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'price_list.update',
      entity: 'price_list',
      entityId: id,
      metadata: { ...dto },
      meta,
    });
    return list;
  }

  async remove(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    await this.get(companyId, id);
    await this.prisma.$transaction([
      this.prisma.customer.updateMany({ where: { companyId, priceListId: id }, data: { priceListId: null } }),
      this.prisma.companySettings.updateMany({
        where: { companyId, defaultPriceListId: id },
        data: { defaultPriceListId: null },
      }),
      this.prisma.priceList.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }),
    ]);
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'price_list.delete',
      entity: 'price_list',
      entityId: id,
      meta,
    });
  }

  /** Crea o actualiza precios específicos de productos dentro de la lista. */
  async setItems(auth: AuthContext, companyId: string, id: string, dto: SetPriceListItemsDto, meta: RequestMeta) {
    await this.get(companyId, id);
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const found = await this.prisma.product.count({
      where: { id: { in: productIds }, companyId, deletedAt: null },
    });
    if (found !== productIds.length) throw new BadRequestException('Uno o más productos no existen');

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.priceListItem.upsert({
          where: { priceListId_productId: { priceListId: id, productId: item.productId } },
          update: { price: item.price },
          create: { priceListId: id, productId: item.productId, price: item.price },
        }),
      ),
    );
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'price_list.items_set',
      entity: 'price_list',
      entityId: id,
      metadata: { count: dto.items.length },
      meta,
    });
    return this.get(companyId, id);
  }

  async removeItem(auth: AuthContext, companyId: string, id: string, productId: string, meta: RequestMeta) {
    await this.get(companyId, id);
    await this.prisma.priceListItem.deleteMany({ where: { priceListId: id, productId } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'price_list.item_removed',
      entity: 'price_list',
      entityId: id,
      metadata: { productId },
      meta,
    });
  }

  private async assertUnique(companyId: string, name: string) {
    const dup = await this.prisma.priceList.findFirst({
      where: { companyId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
    });
    if (dup) throw new ConflictException('Ya existe una lista de precios con ese nombre');
  }
}
