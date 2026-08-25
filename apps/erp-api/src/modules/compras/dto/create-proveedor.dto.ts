import { IsString, IsEmail, IsOptional, IsNumber, IsEnum, MinLength, MaxLength, Min, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidRuc } from '../validators/is-valid-ruc.validator';

export enum CondicionesPago {
  CONTADO = 'CONTADO',
  CREDITO_15 = 'CREDITO_15',
  CREDITO_30 = 'CREDITO_30',
  CREDITO_45 = 'CREDITO_45',
  CREDITO_60 = 'CREDITO_60',
  CREDITO_90 = 'CREDITO_90'
}

export class CreateProveedorDto {
  @ApiProperty({ description: 'RUC, CUIT o NIT del proveedor según el país del tenant', example: '900123456-8' })
  @IsString()
  @IsValidRuc({ message: 'La identificación fiscal debe tener formato RUC, CUIT o NIT válido' })
  ruc: string;

  @ApiProperty({ description: 'Razón social del proveedor', example: 'DISTRIBUIDORA ABC S.A.C.' })
  @IsString()
  @MinLength(3, { message: 'La razón social debe tener al menos 3 caracteres' })
  @MaxLength(200, { message: 'La razón social debe tener máximo 200 caracteres' })
  razon_social: string;

  @ApiPropertyOptional({ description: 'Nombre comercial del proveedor', example: 'ABC Distribuidora' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre_comercial?: string;

  @ApiPropertyOptional({ description: 'Dirección del proveedor', example: 'Av. Principal 123, Lima' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion?: string;

  @ApiPropertyOptional({ description: 'Teléfono del proveedor', example: '+51 999 888 777' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @ApiProperty({ description: 'Email del proveedor', example: 'contacto@abc.com' })
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  email: string;

  @ApiPropertyOptional({ description: 'Nombre del contacto principal', example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contacto?: string;

  @ApiPropertyOptional({ 
    description: 'Condiciones de pago', 
    enum: CondicionesPago,
    default: CondicionesPago.CONTADO 
  })
  @IsOptional()
  @IsEnum(CondicionesPago, { message: 'Condiciones de pago inválidas' })
  condiciones_pago?: CondicionesPago;

  @ApiPropertyOptional({ description: 'Límite de crédito en la moneda base', example: 50000, default: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'El límite de crédito debe ser un número' })
  @Min(0, { message: 'El límite de crédito no puede ser negativo' })
  limite_credito?: number;

  @ApiPropertyOptional({
    description:
      'Fecha hasta la que rige la constancia de suspensión de retenciones de cuarta categoría. ' +
      'Mientras esté vigente no se retiene el 8 % de sus recibos por honorarios. ' +
      'Cadena vacía para retirarla: la suspensión caduca cada año.',
    example: '2026-12-31',
  })
  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, {
    message: 'La suspensión debe ser una fecha AAAA-MM-DD, o vacío para retirarla',
  })
  suspension_retencion_cuarta_hasta?: string;

  @ApiPropertyOptional({ description: 'Días de crédito otorgados', example: 30, default: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Los días de crédito deben ser un número' })
  @Min(0, { message: 'Los días de crédito no pueden ser negativos' })
  dias_credito?: number;
}
