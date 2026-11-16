import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CompaniesModule } from '../companies/companies.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [JwtModule.register({}), CompaniesModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [AuthService, PasswordService, TokenService, JwtModule],
})
export class AuthModule {}
