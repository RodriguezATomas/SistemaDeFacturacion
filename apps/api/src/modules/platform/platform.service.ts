import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { paginate, searchFilter, skipTake } from '../../common/dto/pagination.dto';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PlanDto,
  PlatformCompaniesQueryDto,
  UpdateCompanyStatusDto,
  UpdateSubscriptionDto,
} from './platform.dto';

/** Administración central de la plataforma SaaS: empresas, planes y suscripciones. */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  private assertSaas() {
    if (!this.config.isSaas) {
      throw new ForbiddenException('La administración de plataforma solo existe en modalidad SaaS');
    }
  }

  async stats() {
    this.assertSaas();
    const [companies, activeCompanies, users, bySubscription, authorizedInvoices] = await Promise.all([
      this.prisma.company.count({ where: { deletedAt: null } }),
      this.prisma.company.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.subscription.groupBy({ by: ['status'], _count: true }),
      this.prisma.invoice.count({ where: { status: 'AUTHORIZED' } }),
    ]);
    return {
      companies,
      activeCompanies,
      users,
      authorizedInvoices,
      subscriptions: Object.fromEntries(bySubscription.map((s) => [s.status, s._count])),
    };
  }

  async listCompanies(q: PlatformCompaniesQueryDto) {
    this.assertSaas();
    const where: Prisma.CompanyWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...searchFilter(q.search, ['legalName', 'tradeName', 'cuit']),
    };
    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        include: {
          subscription: { include: { plan: { select: { id: true, name: true, code: true } } } },
          _count: { select: { members: true, invoices: true } },
        },
      }),
      this.prisma.company.count({ where }),
    ]);
    return paginate(data, total, q);
  }

  async updateCompanyStatus(auth: AuthContext, id: string, dto: UpdateCompanyStatusDto, meta: RequestMeta) {
    this.assertSaas();
    await this.findCompany(id);
    const company = await this.prisma.company.update({ where: { id }, data: { status: dto.status } });
    if (dto.status === 'SUSPENDED') {
      await this.prisma.refreshToken.updateMany({
        where: { companyId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({
      companyId: id,
      userId: auth.userId,
      action: 'platform.company_status',
      entity: 'company',
      entityId: id,
      metadata: { status: dto.status },
      meta,
    });
    return company;
  }

  async updateSubscription(auth: AuthContext, companyId: string, dto: UpdateSubscriptionDto, meta: RequestMeta) {
    this.assertSaas();
    await this.findCompany(companyId);
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new NotFoundException('Plan inexistente');
    }
    const data = {
      planId: dto.planId,
      status: dto.status,
      trialEndsAt: dto.trialEndsAt === undefined ? undefined : dto.trialEndsAt ? new Date(dto.trialEndsAt) : null,
      currentPeriodEnd:
        dto.currentPeriodEnd === undefined ? undefined : dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : null,
    };
    const sub = await this.prisma.subscription.update({
      where: { companyId },
      data,
      include: { plan: true },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'platform.subscription_update',
      entity: 'subscription',
      entityId: sub.id,
      metadata: { ...dto },
      meta,
    });
    return sub;
  }

  listPlans() {
    this.assertSaas();
    return this.prisma.plan.findMany({
      orderBy: { priceMonthly: 'asc' },
      include: { _count: { select: { subscriptions: true } } },
    });
  }

  async createPlan(auth: AuthContext, dto: PlanDto, meta: RequestMeta) {
    this.assertSaas();
    const exists = await this.prisma.plan.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Ya existe un plan con ese código');
    const plan = await this.prisma.plan.create({ data: dto });
    await this.audit.log({
      userId: auth.userId,
      action: 'platform.plan_create',
      entity: 'plan',
      entityId: plan.id,
      metadata: { code: dto.code },
      meta,
    });
    return plan;
  }

  async updatePlan(auth: AuthContext, id: string, dto: PlanDto, meta: RequestMeta) {
    this.assertSaas();
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan inexistente');
    if (dto.code !== plan.code) {
      const dup = await this.prisma.plan.findUnique({ where: { code: dto.code } });
      if (dup) throw new ConflictException('Ya existe un plan con ese código');
    }
    const updated = await this.prisma.plan.update({ where: { id }, data: dto });
    await this.audit.log({
      userId: auth.userId,
      action: 'platform.plan_update',
      entity: 'plan',
      entityId: id,
      metadata: { ...dto },
      meta,
    });
    return updated;
  }

  private async findCompany(id: string) {
    const company = await this.prisma.company.findFirst({ where: { id, deletedAt: null } });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }
}
