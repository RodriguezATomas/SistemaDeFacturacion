import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController, SuppliersController } from './parties.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  controllers: [CustomersController, SuppliersController],
  providers: [CustomersService, SuppliersService],
  exports: [CustomersService],
})
export class PartiesModule {}
