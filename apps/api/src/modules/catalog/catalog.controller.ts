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
  Put,
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
import { PERMISSIONS } from '../../common/permissions';
import {
  CategoryDto,
  CreatePriceListDto,
  CreateProductDto,
  ProductsQueryDto,
  SetPriceListItemsDto,
  UpdatePriceListDto,
  UpdateProductDto,
} from './catalog.dto';
import { CategoriesService } from './categories.service';
import { PriceListsService } from './price-lists.service';
import { ProductsService } from './products.service';

@ApiTags('Categorías')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ.code)
  list(@CompanyId() companyId: string) {
    return this.categories.list(companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE.code)
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CategoryDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.categories.create(auth, companyId, dto, meta);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.categories.update(auth, companyId, id, dto, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.categories.remove(auth, companyId, id, meta);
  }
}

@ApiTags('Productos y servicios')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ.code)
  list(@CompanyId() companyId: string, @Query() q: ProductsQueryDto) {
    return this.products.list(companyId, q);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ.code)
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(companyId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE.code)
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CreateProductDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.products.create(auth, companyId, dto, meta);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.products.update(auth, companyId, id, dto, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.products.remove(auth, companyId, id, meta);
  }
}

@ApiTags('Listas de precios')
@ApiBearerAuth()
@Controller('price-lists')
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_READ.code)
  list(@CompanyId() companyId: string) {
    return this.priceLists.list(companyId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_READ.code)
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.priceLists.get(companyId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_WRITE.code)
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CreatePriceListDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.create(auth, companyId, dto, meta);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_WRITE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceListDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.update(auth, companyId, id, dto, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_WRITE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.remove(auth, companyId, id, meta);
  }

  @Put(':id/items')
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_WRITE.code)
  setItems(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPriceListItemsDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.setItems(auth, companyId, id, dto, meta);
  }

  @Delete(':id/items/:productId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_WRITE.code)
  removeItem(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.priceLists.removeItem(auth, companyId, id, productId, meta);
  }
}
