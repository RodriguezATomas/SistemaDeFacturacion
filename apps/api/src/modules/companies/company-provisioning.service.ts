import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma, TaxCondition } from '@prisma/client';
import { SYSTEM_ROLE_TEMPLATES } from '../../common/permissions';
import { normalizeCuit } from '../../common/utils/cuit';
import { AppConfigService } from '../../config/app-config.service';

export const DEFAULT_TRIAL_PLAN_CODE = 'profesional';
export const PRIVATE_PLAN_CODE = 'instalacion-privada';
export const TRIAL_DAYS = 30;

export interface NewCompanyData {
  legalName: string;
  cuit: string;
  taxCondition: TaxCondition;
  tradeName?: string;
}

/**
 * Alta de una empresa (tenant) con su configuración, roles de sistema, membresía del
 * propietario y suscripción. Se ejecuta dentro de la transacción del llamador.
 */
@Injectable()
export class CompanyProvisioningService {
  constructor(private readonly config: AppConfigService) {}

  async provision(tx: Prisma.TransactionClient, data: NewCompanyData, ownerUserId: string) {
    const cuit = normalizeCuit(data.cuit);
    const duplicated = await tx.company.findFirst({ where: { cuit } });
    if (duplicated) throw new ConflictException('Ya existe una empresa registrada con esa CUIT');

    const company = await tx.company.create({
      data: {
        legalName: data.legalName,
        tradeName: data.tradeName,
        cuit,
        taxCondition: data.taxCondition,
        settings: { create: {} },
      },
    });

    const permissions = await tx.permission.findMany({ select: { id: true, code: true } });
    const idByCode = new Map(permissions.map((p) => [p.code, p.id]));

    let ownerRoleId: string | undefined;
    for (const tpl of SYSTEM_ROLE_TEMPLATES) {
      const role = await tx.role.create({
        data: {
          companyId: company.id,
          name: tpl.name,
          description: tpl.description,
          isSystem: true,
          systemKey: tpl.key,
          permissions: {
            create: tpl.permissions
              .map((code) => idByCode.get(code))
              .filter((id): id is string => Boolean(id))
              .map((permissionId) => ({ permissionId })),
          },
        },
      });
      if (tpl.key === 'owner') ownerRoleId = role.id;
    }
    if (!ownerRoleId) throw new InternalServerErrorException('Plantilla de rol propietario ausente');

    await tx.companyUser.create({
      data: { companyId: company.id, userId: ownerUserId, roleId: ownerRoleId, status: 'ACTIVE' },
    });

    await this.createSubscription(tx, company.id);
    return company;
  }

  private async createSubscription(tx: Prisma.TransactionClient, companyId: string) {
    if (this.config.isPrivate) {
      const plan = await tx.plan.upsert({
        where: { code: PRIVATE_PLAN_CODE },
        update: {},
        create: {
          code: PRIVATE_PLAN_CODE,
          name: 'Instalación privada',
          description: 'Licencia de instalación propia sin límites operativos',
        },
      });
      await tx.subscription.create({ data: { companyId, planId: plan.id, status: 'ACTIVE' } });
      return;
    }
    const plan = await tx.plan.findUnique({ where: { code: DEFAULT_TRIAL_PLAN_CODE } });
    if (!plan) {
      throw new InternalServerErrorException(
        `No existe el plan de prueba "${DEFAULT_TRIAL_PLAN_CODE}". Ejecute el seed de la base de datos.`,
      );
    }
    await tx.subscription.create({
      data: {
        companyId,
        planId: plan.id,
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }
}
