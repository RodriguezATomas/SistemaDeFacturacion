import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  CompanyId,
  CurrentAuth,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import { RolesService } from './roles.service';

class RoleDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}

@ApiTags('Roles y permisos')
@ApiBearerAuth()
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.USERS_READ.code)
  catalog() {
    return this.roles.permissionsCatalog();
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_READ.code)
  list(@CompanyId() companyId: string) {
    return this.roles.list(companyId);
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: RoleDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.create(auth, companyId, dto, meta);
  }

  @Patch('roles/:id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoleDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.update(auth, companyId, id, dto, meta);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.remove(auth, companyId, id, meta);
  }
}
