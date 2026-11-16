import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  CompanyId,
  CurrentAuth,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PERMISSIONS } from '../../common/permissions';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CreateSupplierDto, UpdateCustomerDto, UpdateSupplierDto } from './party.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ.code)
  list(@CompanyId() companyId: string, @Query() q: PaginationQueryDto) {
    return this.customers.list(companyId, q);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ.code)
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.get(companyId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE.code)
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CreateCustomerDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.create(auth, companyId, dto, meta);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.update(auth, companyId, id, dto, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.customers.remove(auth, companyId, id, meta);
  }
}

@ApiTags('Proveedores')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ.code)
  list(@CompanyId() companyId: string, @Query() q: PaginationQueryDto) {
    return this.suppliers.list(companyId, q);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_READ.code)
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(companyId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIERS_WRITE.code)
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CreateSupplierDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.suppliers.create(auth, companyId, dto, meta);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIERS_WRITE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.suppliers.update(auth, companyId, id, dto, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SUPPLIERS_WRITE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.suppliers.remove(auth, companyId, id, meta);
  }
}
