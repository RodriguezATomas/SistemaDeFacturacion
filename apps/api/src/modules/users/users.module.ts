import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [CompaniesModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
