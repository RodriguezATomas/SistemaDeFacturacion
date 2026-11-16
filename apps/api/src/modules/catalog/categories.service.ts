import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CategoryDto } from './catalog.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string) {
    const categories = await this.prisma.productCategory.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    return categories.map(({ _count, ...c }) => ({ ...c, productsCount: _count.products }));
  }

  async create(auth: AuthContext, companyId: string, dto: CategoryDto, meta: RequestMeta) {
    await this.assertUnique(companyId, dto.name);
    const category = await this.prisma.productCategory.create({ data: { ...dto, companyId } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'category.create',
      entity: 'product_category',
      entityId: category.id,
      meta,
    });
    return category;
  }

  async update(auth: AuthContext, companyId: string, id: string, dto: CategoryDto, meta: RequestMeta) {
    const current = await this.get(companyId, id);
    if (current.name.toLowerCase() !== dto.name.toLowerCase()) await this.assertUnique(companyId, dto.name);
    const category = await this.prisma.productCategory.update({ where: { id }, data: dto });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'category.update',
      entity: 'product_category',
      entityId: id,
      meta,
    });
    return category;
  }

  async remove(auth: AuthContext, companyId: string, id: string, meta: RequestMeta) {
    await this.get(companyId, id);
    await this.prisma.$transaction([
      this.prisma.product.updateMany({ where: { companyId, categoryId: id }, data: { categoryId: null } }),
      this.prisma.productCategory.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'category.delete',
      entity: 'product_category',
      entityId: id,
      meta,
    });
  }

  async get(companyId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  private async assertUnique(companyId: string, name: string) {
    const dup = await this.prisma.productCategory.findFirst({
      where: { companyId, deletedAt: null, name: { equals: name, mode: 'insensitive' } },
    });
    if (dup) throw new ConflictException('Ya existe una categoría con ese nombre');
  }
}
