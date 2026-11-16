import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  CompanyId,
  CurrentAuth,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompaniesModule } from '../companies/companies.module';
import { PlanLimitsService } from '../companies/plan-limits.service';

class CreatePointOfSaleDto {
  @ApiProperty({ description: 'Número de punto de venta habilitado en ARCA para web services', example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99998)
  number: number;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ nullable: true, description: 'Domicilio comercial informado en el comprobante' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(250)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class UpdatePointOfSaleDto extends PartialType(CreatePointOfSaleDto) {}

@Injectable()
export class PointsOfSaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: PlanLimitsService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.pointOfSale.findMany({ where: { companyId }, orderBy: { number: 'asc' } });
  }

  async create(auth: AuthContext, companyId: string, dto: CreatePointOfSaleDto, meta: RequestMeta) {
    if (dto.isActive !== false) await this.limits.assertCanAddPointOfSale(companyId);
    await this.assertUniqueNumber(companyId, dto.number);
    // WSFEv1 es el servicio implementado para emisión (comprobantes A, B y C).
    const pos = await this.prisma.pointOfSale.create({ data: { ...dto, companyId, service: 'WSFE' } });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'pos.create',
      entity: 'point_of_sale',
      entityId: pos.id,
      metadata: { number: dto.number },
      meta,
    });
    return pos;
  }

  async update(auth: AuthContext, companyId: string, id: string, dto: UpdatePointOfSaleDto, meta: RequestMeta) {
    const current = await this.prisma.pointOfSale.findFirst({ where: { id, companyId } });
    if (!current) throw new NotFoundException('Punto de venta no encontrado');
    if (dto.number !== undefined && dto.number !== current.number) {
      const used = await this.prisma.invoice.count({ where: { pointOfSaleId: id, number: { not: null } } });
      if (used > 0) {
        throw new ConflictException('No se puede cambiar el número de un punto de venta con comprobantes emitidos');
      }
      await this.assertUniqueNumber(companyId, dto.number);
    }
    if (dto.isActive === true && !current.isActive) await this.limits.assertCanAddPointOfSale(companyId);
    const pos = await this.prisma.pointOfSale.update({ where: { id }, data: dto });
    await this.audit.log({
      companyId,
      userId: auth.userId,
      action: 'pos.update',
      entity: 'point_of_sale',
      entityId: id,
      metadata: { ...dto },
      meta,
    });
    return pos;
  }

  private async assertUniqueNumber(companyId: string, number: number) {
    const dup = await this.prisma.pointOfSale.findFirst({ where: { companyId, number } });
    if (dup) throw new ConflictException(`Ya existe el punto de venta ${number}`);
  }
}

@ApiTags('Puntos de venta')
@ApiBearerAuth()
@Controller('points-of-sale')
export class PointsOfSaleController {
  constructor(private readonly service: PointsOfSaleService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_READ.code)
  list(@CompanyId() companyId: string) {
    return this.service.list(companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.POS_MANAGE.code)
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CreatePointOfSaleDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.create(auth, companyId, dto, meta);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.POS_MANAGE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePointOfSaleDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.update(auth, companyId, id, dto, meta);
  }
}

@Module({
  imports: [CompaniesModule],
  controllers: [PointsOfSaleController],
  providers: [PointsOfSaleService],
})
export class PointsOfSaleModule {}
