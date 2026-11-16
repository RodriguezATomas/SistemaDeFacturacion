import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType, InvoiceConcept, InvoiceStatus, VatCondition, VatTreatment } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CURRENCIES, OTHER_TAX_TYPES, VALID_VAT_RATES, VOUCHER_TYPES } from '../fiscal/fiscal.constants';

const optional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export const VOUCHER_KINDS = ['FACTURA', 'NOTA_DEBITO', 'NOTA_CREDITO'] as const;

export class InvoiceItemDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  productId?: string | null;

  @ApiPropertyOptional({ description: 'Si se omite y hay producto, se usa su nombre' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(99999999)
  quantity: number;

  @ApiPropertyOptional({ description: 'Precio unitario neto. Si se omite se toma de la lista de precios' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(999999999999)
  unitPrice?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ enum: VatTreatment })
  @IsOptional()
  @IsEnum(VatTreatment)
  vatTreatment?: VatTreatment;

  @ApiPropertyOptional({ enum: VALID_VAT_RATES })
  @IsOptional()
  @Type(() => Number)
  @IsIn(VALID_VAT_RATES as unknown as number[], { message: 'Alícuota de IVA inválida' })
  vatRate?: number;
}

export class InvoiceTaxDto {
  @ApiProperty({ enum: Object.keys(OTHER_TAX_TYPES).map(Number) })
  @Type(() => Number)
  @IsIn(Object.keys(OTHER_TAX_TYPES).map(Number), { message: 'Tipo de tributo inválido' })
  arcaTaxId: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  description: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseAmount: number;

  @ApiProperty({ description: 'Alícuota en porcentaje' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  rate: number;
}

export class InvoiceReceiverDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty()
  @IsString()
  @MaxLength(30)
  documentNumber: string;

  @ApiProperty({ enum: VatCondition })
  @IsEnum(VatCondition)
  vatCondition: VatCondition;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(250)
  address?: string | null;
}

export class CreateInvoiceDto {
  @ApiProperty()
  @IsUUID()
  pointOfSaleId: string;

  @ApiProperty({ enum: VOUCHER_KINDS })
  @IsIn(VOUCHER_KINDS as unknown as string[])
  kind: (typeof VOUCHER_KINDS)[number];

  @ApiPropertyOptional({
    enum: Object.keys(VOUCHER_TYPES).map(Number),
    description: 'Opcional: se determina automáticamente según emisor y receptor',
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(Object.keys(VOUCHER_TYPES).map(Number))
  voucherType?: number;

  @ApiPropertyOptional({ nullable: true, description: 'Cliente. Si se omite, usar receiver o Consumidor Final' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ type: InvoiceReceiverDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InvoiceReceiverDto)
  receiver?: InvoiceReceiverDto;

  @ApiProperty({ enum: InvoiceConcept })
  @IsEnum(InvoiceConcept)
  concept: InvoiceConcept;

  @ApiProperty({ example: '2026-11-16' })
  @IsDateString()
  issueDate: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  serviceFrom?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  serviceTo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  paymentDueDate?: string | null;

  @ApiPropertyOptional({ enum: Object.keys(CURRENCIES), default: 'PES' })
  @IsOptional()
  @IsIn(Object.keys(CURRENCIES))
  currency?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  exchangeRate?: number;

  @ApiPropertyOptional({ nullable: true, description: 'Lista de precios para completar precios omitidos' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  priceListId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Comprobante original (obligatorio para notas de crédito/débito)' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  associatedInvoiceId?: string | null;

  @ApiProperty({ type: [InvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @ApiPropertyOptional({ type: [InvoiceTaxDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => InvoiceTaxDto)
  otherTaxes?: InvoiceTaxDto[];
}

export class InvoicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  voucherType?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pointOfSaleId?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
