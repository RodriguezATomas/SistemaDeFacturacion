import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { isSubscriptionWritable } from '../../common/utils/subscription';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompanyProvisioningService } from './company-provisioning.service';
import { CreateCompanyDto, UpdateCompanyDto, UpdateCompanySettingsDto } from './dto/company.dto';
import { PlanLimitsService } from './plan-limits.service';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: CompanyProvisioningService,
    private readonly limits: PlanLimitsService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  async create(auth: AuthContext, dto: CreateCompanyDto, meta: RequestMeta) {
    if (!this.config.isSaas) {
      throw new ForbiddenException('En instalaciones privadas no se pueden crear empresas adicionales.');
    }
    const company = await this.prisma.$transaction((tx) =>
      this.provisioning.provision(tx, dto, auth.userId),
    );
    await this.audit.log({
      companyId: company.id,
      userId: auth.userId,
      action: 'company.create',
      entity: 'company',
      entityId: company.id,
      meta,
    });
    return company;
  }

  async getCurrent(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      include: { settings: true },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async update(auth: AuthContext, companyId: string, dto: UpdateCompanyDto, meta: RequestMeta) {
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...dto,
        activityStartDate:
          dto.activityStartDate === undefined
            ? undefined
            : dto.activityStartDate === null
              ? null
              : new Date(dto.activityStartDate),
      },
      include: { settings: true },
    });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'company.update',
      entity: 'company',
      entityId: companyId,
      metadata: { fields: Object.keys(dto) },
      meta,
    });
    return updated;
  }

  async updateSettings(
    auth: AuthContext,
    companyId: string,
    dto: UpdateCompanySettingsDto,
    meta: RequestMeta,
  ) {
    if (dto.arcaEnvironment === 'PRODUCTION') {
      if (!this.config.env.ARCA_PRODUCTION_ENABLED) {
        throw new BadRequestException(
          'El ambiente de producción de ARCA no está habilitado en esta instalación (ARCA_PRODUCTION_ENABLED).',
        );
      }
      const credential = await this.prisma.fiscalCredential.findUnique({
        where: { companyId_environment: { companyId, environment: 'PRODUCTION' } },
      });
      if (!credential?.isActive) {
        throw new BadRequestException(
          'Cargue un certificado de producción válido antes de cambiar al ambiente de producción.',
        );
      }
    }
    if (dto.defaultPriceListId) {
      const list = await this.prisma.priceList.findFirst({
        where: { id: dto.defaultPriceListId, companyId, deletedAt: null },
      });
      if (!list) throw new BadRequestException('Lista de precios inexistente');
    }
    const settings = await this.prisma.companySettings.update({ where: { companyId }, data: dto });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: dto.arcaEnvironment ? 'company.arca_environment_changed' : 'company.settings_update',
      entity: 'company_settings',
      entityId: settings.id,
      metadata: { ...dto },
      meta,
    });
    return settings;
  }

  async subscription(companyId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    return {
      deploymentMode: this.config.env.DEPLOYMENT_MODE,
      subscription: sub,
      writable: this.config.isPrivate || isSubscriptionWritable(sub),
      usage: await this.limits.usage(companyId),
    };
  }
}
