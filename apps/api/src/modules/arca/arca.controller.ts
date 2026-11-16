import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ArcaEnvironment } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  CompanyId,
  CurrentAuth,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PERMISSIONS } from '../../common/permissions';
import { ArcaLogService } from './arca-log.service';
import { ArcaStatusService } from './arca-status.service';
import { CredentialsService } from './credentials.service';

class CsrDto {
  @ApiProperty({ enum: ArcaEnvironment })
  @IsEnum(ArcaEnvironment)
  environment: ArcaEnvironment;

  @ApiProperty({ description: 'Alias del certificado (CN)', example: 'facturacion' })
  @Matches(/^[A-Za-z0-9_-]{3,40}$/, { message: 'El alias solo admite letras, números, guiones (3-40)' })
  alias: string;
}

class CertificateDto {
  @ApiProperty({ enum: ArcaEnvironment })
  @IsEnum(ArcaEnvironment)
  environment: ArcaEnvironment;

  @ApiProperty({ description: 'Certificado X.509 en formato PEM emitido por ARCA' })
  @IsString()
  @MaxLength(20000)
  certificate: string;

  @ApiPropertyOptional({ description: 'Clave privada PEM. Omitir si el CSR se generó desde el sistema.' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  privateKey?: string;
}

class ArcaLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  operation?: string;
}

class ReconciliationQueryDto {
  @ApiProperty()
  @IsUUID()
  pointOfSaleId: string;
}

@ApiTags('ARCA')
@ApiBearerAuth()
@Controller('arca')
export class ArcaController {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly status: ArcaStatusService,
    private readonly logs: ArcaLogService,
  ) {}

  @Get('status')
  @RequirePermissions(PERMISSIONS.ARCA_MANAGE.code)
  getStatus(@CompanyId() companyId: string) {
    return this.status.status(companyId);
  }

  @Get('credentials')
  @RequirePermissions(PERMISSIONS.ARCA_MANAGE.code)
  listCredentials(@CompanyId() companyId: string) {
    return this.credentials.list(companyId);
  }

  @Post('credentials/csr')
  @RequirePermissions(PERMISSIONS.ARCA_MANAGE.code)
  @ApiOperation({ summary: 'Genera clave privada (guardada cifrada) y CSR para tramitar el certificado' })
  csr(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CsrDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.credentials.generateCsr(auth, companyId, dto.environment, dto.alias, meta);
  }

  @Post('credentials/certificate')
  @RequirePermissions(PERMISSIONS.ARCA_MANAGE.code)
  upload(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CertificateDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    if (!dto.certificate.includes('BEGIN CERTIFICATE')) {
      throw new BadRequestException('El certificado debe estar en formato PEM');
    }
    return this.credentials.uploadCertificate(auth, companyId, dto.environment, dto.certificate, dto.privateKey, meta);
  }

  @Delete('credentials/:environment')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ARCA_MANAGE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('environment', new ParseEnumPipe(ArcaEnvironment)) environment: ArcaEnvironment,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.credentials.remove(auth, companyId, environment, meta);
  }

  @Post('test-connection')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ARCA_MANAGE.code)
  @ApiOperation({ summary: 'Prueba FEDummy, autenticación WSAA y consulta de puntos de venta' })
  test(@CompanyId() companyId: string) {
    return this.status.testConnection(companyId);
  }

  @Get('points-of-sale')
  @RequirePermissions(PERMISSIONS.POS_MANAGE.code)
  @ApiOperation({ summary: 'Puntos de venta habilitados en ARCA para web services' })
  remotePointsOfSale(@CompanyId() companyId: string) {
    return this.status.remotePointsOfSale(companyId);
  }

  @Get('reconciliation')
  @RequirePermissions(PERMISSIONS.INVOICES_READ.code)
  @ApiOperation({ summary: 'Compara numeración local vs. último autorizado en ARCA por tipo de comprobante' })
  reconciliation(@CompanyId() companyId: string, @Query() q: ReconciliationQueryDto) {
    return this.status.reconciliation(companyId, q.pointOfSaleId);
  }

  @Get('logs')
  @RequirePermissions(PERMISSIONS.ARCA_MANAGE.code)
  listLogs(@CompanyId() companyId: string, @Query() q: ArcaLogsQueryDto) {
    return this.logs.list(companyId, q);
  }
}
