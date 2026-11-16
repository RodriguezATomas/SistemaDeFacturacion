import { Module } from '@nestjs/common';
import { ArcaModule } from '../arca/arca.module';
import { CompaniesModule } from '../companies/companies.module';
import { InvoiceEmissionService } from './invoice-emission.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { ReconciliationScheduler } from './reconciliation.scheduler';

@Module({
  imports: [ArcaModule, CompaniesModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceEmissionService, InvoicePdfService, ReconciliationScheduler],
})
export class InvoicesModule {}
