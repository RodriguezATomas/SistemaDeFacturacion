import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { DocumentType, VatCondition } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateIf,
  ValidationArguments,
} from 'class-validator';
import { isValidCuit } from '../../common/utils/cuit';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const optional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

/** Valida el número según el tipo de documento (CUIT/CUIL con dígito verificador, DNI numérico, etc.). */
export function validateDocument(type: DocumentType, number: string): string | null {
  const digits = number.replace(/\D/g, '');
  switch (type) {
    case 'CUIT':
    case 'CUIL':
      return isValidCuit(digits) ? null : `${type} inválido`;
    case 'DNI':
      return /^\d{7,8}$/.test(digits) ? null : 'El DNI debe tener 7 u 8 dígitos';
    case 'SIN_IDENTIFICAR':
      return digits === '0' || digits === '' ? null : 'Sin identificar debe usar número 0';
    default:
      return number.trim().length >= 3 ? null : 'Número de documento inválido';
  }
}

function IsValidDocumentNumber() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidDocumentNumber',
      target: object.constructor,
      propertyName,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const type = (args.object as { documentType?: DocumentType }).documentType;
          if (typeof value !== 'string' || !type) return true;
          return validateDocument(type, value) === null;
        },
        defaultMessage(args: ValidationArguments) {
          const type = (args.object as { documentType: DocumentType }).documentType;
          return validateDocument(type, String(args.value)) ?? 'Documento inválido';
        },
      },
    });
  };
}

export function normalizeDocument(type: DocumentType, number: string): string {
  if (type === 'SIN_IDENTIFICAR') return '0';
  if (type === 'CUIT' || type === 'CUIL' || type === 'DNI') return number.replace(/\D/g, '');
  return number.trim();
}

export class PartyBaseDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  @IsValidDocumentNumber()
  documentNumber: string;

  @ApiProperty({ enum: VatCondition })
  @IsEnum(VatCondition)
  vatCondition: VatCondition;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(250)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class CreateCustomerDto extends PartyBaseDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  priceListId?: string | null;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CreateSupplierDto extends PartyBaseDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(optional)
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(150)
  contactName?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
