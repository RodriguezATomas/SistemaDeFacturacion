import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyProvisioningService } from './company-provisioning.service';
import { PermissionsSyncService } from './permissions-sync.service';
import { PlanLimitsService } from './plan-limits.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyProvisioningService, PlanLimitsService, PermissionsSyncService],
  exports: [CompanyProvisioningService, PlanLimitsService, PermissionsSyncService],
})
export class CompaniesModule {}
