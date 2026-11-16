import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ProductType, VatTreatment } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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
import { VALID_VAT_RATES } from '../fiscal/fiscal.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const optional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class CategoryDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(300)
  description?: string | null;
}

export class CreateProductDto {
  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  type: ProductType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(60)
  sku?: string | null;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ default: 'unidad' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiProperty({ description: 'Precio neto de IVA' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(999999999999)
  price: number;

  @ApiProperty({ enum: VatTreatment })
  @IsEnum(VatTreatment)
  vatTreatment: VatTreatment;

  @ApiProperty({ enum: VALID_VAT_RATES })
  @Type(() => Number)
  @IsIn(VALID_VAT_RATES as unknown as number[], { message: 'Alícuota de IVA inválida' })
  vatRate: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Devuelve el precio efectivo según esta lista' })
  @IsOptional()
  @IsUUID()
  priceListId?: string;
}

export class CreatePriceListDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional({ description: 'Ajuste % sobre precio base para productos sin precio propio' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(1000)
  adjustmentPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePriceListDto extends PartialType(CreatePriceListDto) {}

export class PriceListItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  price: number;
}

export class SetPriceListItemsDto {
  @ApiProperty({ type: [PriceListItemDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PriceListItemDto)
  items: PriceListItemDto[];
}
