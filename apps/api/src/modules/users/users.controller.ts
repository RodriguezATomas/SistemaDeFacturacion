import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  CompanyId,
  CurrentAuth,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import { UsersService } from './users.service';

class InviteUserDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty()
  @IsUUID()
  roleId: string;
}

class UpdateMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ.code)
  list(@CompanyId() companyId: string) {
    return this.users.list(companyId);
  }

  @Post('invite')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE.code)
  invite(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: InviteUserDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.invite(auth, companyId, dto, meta);
  }

  @Post(':id/resend-invite')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE.code)
  resend(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.resendInvite(auth, companyId, id, meta);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.update(auth, companyId, id, dto, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USERS_MANAGE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.users.remove(auth, companyId, id, meta);
  }
}
