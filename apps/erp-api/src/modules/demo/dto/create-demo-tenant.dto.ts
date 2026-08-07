import { IsOptional, IsString, IsInt, Min, Max, IsEmail, MinLength, IsIn, Matches, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDemoTenantDto {
  @ApiPropertyOptional({ description: 'Nombre opcional para el tenant demo' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ description: 'Días de duración de la demo (default: 14)', minimum: 7, maximum: 30 })
  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(30)
  dias_duracion?: number = 14;

  @ApiPropertyOptional({
    description: 'País operativo de la demo',
    enum: ['PE', 'AR', 'CO'],
    default: 'PE',
  })
  @IsOptional()
  @IsString()
  @IsIn(['PE', 'AR', 'CO'])
  pais?: 'PE' | 'AR' | 'CO' = 'PE';
}

export class ConvertDemoToRealDto {
  @ApiProperty({ description: 'Email real del usuario' })
  @IsEmail({}, { message: 'El email debe ser válido' })
  email: string;

  @ApiProperty({ description: 'Contraseña (mínimo 8 caracteres)' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiProperty({ description: 'Razón social de la empresa' })
  @IsString()
  @MinLength(3, { message: 'La razón social debe tener al menos 3 caracteres' })
  razon_social: string;

  @ApiProperty({ description: 'Identificación fiscal real según país: RUC, CUIT o NIT con DV' })
  @IsString()
  @Matches(/^[0-9-]{9,13}$/, {
    message: 'La identificación fiscal sólo puede contener dígitos y guion',
  })
  ruc: string;

  @ApiPropertyOptional({ description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({
    description:
      'Si el cliente conserva lo que probó en el demo o arranca con la cuenta vacía. ' +
      'Por defecto conserva: borrar sin que lo haya pedido es irreversible.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  conservar_datos?: boolean;

  @ApiPropertyOptional({ description: 'ID del plan: basico, profesional, enterprise' })
  @IsOptional()
  @IsString()
  @IsIn(['basico', 'profesional', 'enterprise'], { message: 'Plan no válido' })
  plan_id?: string = 'basico';

  @ApiPropertyOptional({ description: 'Periodo de facturación: mensual o anual' })
  @IsOptional()
  @IsString()
  @IsIn(['mensual', 'anual'], { message: 'Periodo debe ser mensual o anual' })
  periodo?: string = 'mensual';

  // Campo interno para webhook (no expuesto en API)
  password_hash?: string;
}
