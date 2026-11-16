import { Module } from '@nestjs/common';
import { CategoriesController, PriceListsController, ProductsController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { PriceListsService } from './price-lists.service';
import { ProductsService } from './products.service';

@Module({
  controllers: [CategoriesController, ProductsController, PriceListsController],
  providers: [CategoriesService, ProductsService, PriceListsService],
})
export class CatalogModule {}
