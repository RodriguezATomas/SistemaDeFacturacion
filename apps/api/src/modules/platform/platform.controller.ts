import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import { CurrentAuth, PlatformAdminOnly, ReqMeta } from '../../common/decorators/auth.decorators';
import {
  PlanDto,
  PlatformCompaniesQueryDto,
  UpdateCompanyStatusDto,
  UpdateSubscriptionDto,
} from './platform.dto';
import { PlatformService } from './platform.service';

@ApiTags('Plataforma (administración SaaS)')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('stats')
  stats() {
    return this.platform.stats();
  }

  @Get('companies')
  companies(@Query() q: PlatformCompaniesQueryDto) {
    return this.platform.listCompanies(q);
  }

  @Patch('companies/:id/status')
  status(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyStatusDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.platform.updateCompanyStatus(auth, id, dto, meta);
  }

  @Patch('companies/:id/subscription')
  subscription(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.platform.updateSubscription(auth, id, dto, meta);
  }

  @Get('plans')
  plans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  createPlan(@CurrentAuth() auth: AuthContext, @Body() dto: PlanDto, @ReqMeta() meta: RequestMeta) {
    return this.platform.createPlan(auth, dto, meta);
  }

  @Patch('plans/:id')
  updatePlan(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlanDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.platform.updatePlan(auth, id, dto, meta);
  }
}
