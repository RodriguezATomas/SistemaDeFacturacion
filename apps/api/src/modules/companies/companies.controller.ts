import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  AllowInactiveSubscription,
  CompanyId,
  CurrentAuth,
  NoCompanyRequired,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto, UpdateCompanySettingsDto } from './dto/company.dto';

@ApiTags('Empresas')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @NoCompanyRequired()
  @AllowInactiveSubscription()
  @ApiOperation({ summary: 'Crea una empresa adicional para el usuario (SaaS)' })
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateCompanyDto, @ReqMeta() meta: RequestMeta) {
    return this.companies.create(auth, dto, meta);
  }

  @Get('current')
  getCurrent(@CompanyId() companyId: string) {
    return this.companies.getCurrent(companyId);
  }

  @Patch('current')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: UpdateCompanyDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.update(auth, companyId, dto, meta);
  }

  @Patch('current/settings')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE.code)
  updateSettings(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: UpdateCompanySettingsDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.updateSettings(auth, companyId, dto, meta);
  }

  @Get('current/subscription')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTION_READ.code)
  subscription(@CompanyId() companyId: string) {
    return this.companies.subscription(companyId);
  }
}
