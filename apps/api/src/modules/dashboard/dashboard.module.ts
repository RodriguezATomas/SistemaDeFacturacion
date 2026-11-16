import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { CompanyId, RequirePermissions } from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { VOUCHER_TYPES } from '../fiscal/fiscal.constants';

const CREDIT_NOTE_TYPES = Object.values(VOUCHER_TYPES)
  .filter((v) => v.kind === 'NOTA_CREDITO')
  .map((v) => v.code);

/** Indicadores del panel principal calculados sobre comprobantes autorizados (las notas de crédito restan). */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(companyId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const yearAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

    const [month, prevMonth, statusCounts, customers, products, recent, monthly, top] = await Promise.all([
      this.netSales(companyId, monthStart, null),
      this.netSales(companyId, prevMonthStart, monthStart),
      this.prisma.invoice.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      this.prisma.customer.count({ where: { companyId, deletedAt: null } }),
      this.prisma.product.count({ where: { companyId, deletedAt: null, isActive: true } }),
      this.prisma.invoice.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          voucherType: true,
          number: true,
          status: true,
          issueDate: true,
          receiverName: true,
          total: true,
          pointOfSale: { select: { number: true } },
        },
      }),
      this.prisma.$queryRaw<Array<{ month: Date; total: Prisma.Decimal; count: bigint }>>`
        SELECT date_trunc('month', "issueDate")::date AS month,
               SUM(CASE WHEN "voucherType" IN (${Prisma.join(CREDIT_NOTE_TYPES)}) THEN -total * "exchangeRate" ELSE total * "exchangeRate" END) AS total,
               COUNT(*) AS count
        FROM invoices
        WHERE "companyId" = ${companyId}::uuid AND status = 'AUTHORIZED' AND "issueDate" >= ${yearAgo}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<Array<{ name: string; total: Prisma.Decimal; count: bigint }>>`
        SELECT "receiverName" AS name,
               SUM(CASE WHEN "voucherType" IN (${Prisma.join(CREDIT_NOTE_TYPES)}) THEN -total * "exchangeRate" ELSE total * "exchangeRate" END) AS total,
               COUNT(*) AS count
        FROM invoices
        WHERE "companyId" = ${companyId}::uuid AND status = 'AUTHORIZED' AND "issueDate" >= ${yearAgo}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    ]);

    const series: Array<{ month: string; total: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = d.toISOString().slice(0, 7);
      const row = monthly.find((m) => new Date(m.month).toISOString().slice(0, 7) === key);
      series.push({ month: key, total: row ? new Decimal(row.total.toString()).toFixed(2) : '0.00', count: row ? Number(row.count) : 0 });
    }

    const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count]));
    return {
      salesThisMonth: month.total.toFixed(2),
      salesPrevMonth: prevMonth.total.toFixed(2),
      invoicesThisMonth: month.count,
      customers,
      activeProducts: products,
      statusCounts: counts,
      pendingReconciliation: (counts.UNKNOWN ?? 0) + (counts.SENDING ?? 0),
      drafts: counts.DRAFT ?? 0,
      monthlySales: series,
      topCustomers: top.map((t) => ({ name: t.name, total: new Decimal(t.total.toString()).toFixed(2), count: Number(t.count) })),
      recentInvoices: recent,
    };
  }

  private async netSales(companyId: string, from: Date, to: Date | null) {
    const rows = await this.prisma.invoice.findMany({
      where: { companyId, status: 'AUTHORIZED', issueDate: { gte: from, ...(to ? { lt: to } : {}) } },
      select: { total: true, exchangeRate: true, voucherType: true },
    });
    const total = rows.reduce((acc, r) => {
      const amount = new Decimal(r.total.toString()).mul(r.exchangeRate.toString());
      return CREDIT_NOTE_TYPES.includes(r.voucherType) ? acc.minus(amount) : acc.plus(amount);
    }, new Decimal(0));
    return { total, count: rows.length };
  }
}

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DASHBOARD_VIEW.code)
  summary(@CompanyId() companyId: string) {
    return this.dashboard.summary(companyId);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
