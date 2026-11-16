import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthContext, RequestMeta } from '../../common/context/auth-context';
import {
  CompanyId,
  CurrentAuth,
  ReqMeta,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import { CreateInvoiceDto, InvoicesQueryDto } from './invoice.dto';
import { InvoiceEmissionService } from './invoice-emission.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesService } from './invoices.service';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,100}$/;

@ApiTags('Comprobantes')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly emission: InvoiceEmissionService,
    private readonly pdf: InvoicePdfService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVOICES_READ.code)
  list(@CompanyId() companyId: string, @Query() q: InvoicesQueryDto) {
    return this.invoices.list(companyId, q);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INVOICES_READ.code)
  get(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.get(companyId, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE.code)
  @ApiOperation({ summary: 'Crea un borrador (calcula importes y determina el tipo de comprobante)' })
  create(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Body() dto: CreateInvoiceDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.invoices.create(auth, companyId, dto, meta);
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE.code)
  update(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInvoiceDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.invoices.update(auth, companyId, id, dto, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE.code)
  remove(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.invoices.remove(auth, companyId, id, meta);
  }

  @Post(':id/emit')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INVOICES_EMIT.code)
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Clave única por intento (16-100 caracteres)' })
  @ApiOperation({ summary: 'Solicita CAE a ARCA (WSFEv1). Idempotente por Idempotency-Key.' })
  emit(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    if (!key || !IDEMPOTENCY_KEY.test(key)) {
      throw new BadRequestException('Encabezado Idempotency-Key requerido (16-100 caracteres alfanuméricos)');
    }
    return this.emission.emit(auth, companyId, id, key, meta);
  }

  @Post(':id/reconcile')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.INVOICES_EMIT.code)
  @ApiOperation({ summary: 'Consulta en ARCA el resultado de una emisión incierta' })
  reconcile(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.emission.reconcile(auth, companyId, id, meta);
  }

  @Post(':id/credit-note')
  @RequirePermissions(PERMISSIONS.INVOICES_WRITE.code)
  @ApiOperation({ summary: 'Crea un borrador de nota de crédito que anula el comprobante' })
  creditNote(
    @CurrentAuth() auth: AuthContext,
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.invoices.creditNoteFrom(auth, companyId, id, meta);
  }

  @Get(':id/pdf')
  @RequirePermissions(PERMISSIONS.INVOICES_READ.code)
  async downloadPdf(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.pdf.getPdf(companyId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }
}
