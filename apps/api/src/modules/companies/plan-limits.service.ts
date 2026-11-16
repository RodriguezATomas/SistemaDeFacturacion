import { ForbiddenException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Aplica los límites del plan contratado (solo en modalidad SaaS; las instalaciones privadas no tienen límites). */
@Injectable()
export class PlanLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private async plan(companyId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    return sub?.plan ?? null;
  }

  async assertCanAddUser(companyId: string): Promise<void> {
    if (!this.config.isSaas) return;
    const plan = await this.plan(companyId);
    if (plan?.maxUsers == null) return;
    const count = await this.prisma.companyUser.count({
      where: { companyId, status: { in: ['ACTIVE', 'INVITED'] } },
    });
    if (count >= plan.maxUsers) {
      throw new ForbiddenException(
        `El plan ${plan.name} permite hasta ${plan.maxUsers} usuarios. Actualice el plan para agregar más.`,
      );
    }
  }

  async assertCanAddPointOfSale(companyId: string): Promise<void> {
    if (!this.config.isSaas) return;
    const plan = await this.plan(companyId);
    if (plan?.maxPointsOfSale == null) return;
    const count = await this.prisma.pointOfSale.count({ where: { companyId, isActive: true } });
    if (count >= plan.maxPointsOfSale) {
      throw new ForbiddenException(
        `El plan ${plan.name} permite hasta ${plan.maxPointsOfSale} puntos de venta activos.`,
      );
    }
  }

  async assertCanEmitInvoice(companyId: string): Promise<void> {
    if (!this.config.isSaas) return;
    const plan = await this.plan(companyId);
    if (plan?.maxInvoicesPerMonth == null) return;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const count = await this.prisma.invoice.count({
      where: { companyId, status: 'AUTHORIZED', authorizedAt: { gte: monthStart } },
    });
    if (count >= plan.maxInvoicesPerMonth) {
      throw new ForbiddenException(
        `Se alcanzó el límite mensual de ${plan.maxInvoicesPerMonth} comprobantes del plan ${plan.name}.`,
      );
    }
  }

  async usage(companyId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [users, pointsOfSale, invoicesThisMonth] = await Promise.all([
      this.prisma.companyUser.count({ where: { companyId, status: { in: ['ACTIVE', 'INVITED'] } } }),
      this.prisma.pointOfSale.count({ where: { companyId, isActive: true } }),
      this.prisma.invoice.count({
        where: { companyId, status: 'AUTHORIZED', authorizedAt: { gte: monthStart } },
      }),
    ]);
    return { users, pointsOfSale, invoicesThisMonth };
  }
}
