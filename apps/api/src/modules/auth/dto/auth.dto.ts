import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxCondition } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsCuit } from '../../../common/utils/is-cuit.validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
export const PASSWORD_MESSAGE =
  'La contraseña debe tener entre 10 y 128 caracteres e incluir letras y números';

export class CompanyRegistrationDto {
  @ApiProperty({ example: 'Mi Empresa S.A.' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName: string;

  @ApiProperty({ example: '30-12345678-1' })
  @IsCuit()
  cuit: string;

  @ApiProperty({ enum: TaxCondition })
  @IsEnum(TaxCondition)
  taxCondition: TaxCondition;
}

export class RegisterDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty()
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty({ description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ type: CompanyRegistrationDto })
  @ValidateNested()
  @Type(() => CompanyRegistrationDto)
  company: CompanyRegistrationDto;
}

export class LoginDto {
  @ApiProperty()
  @Transform(lowerTrim)
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password: string;
}

export class SwitchCompanyDto {
  @ApiProperty()
  @IsUUID()
  companyId: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Transform(lowerTrim)
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @ApiProperty({ description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;
}
