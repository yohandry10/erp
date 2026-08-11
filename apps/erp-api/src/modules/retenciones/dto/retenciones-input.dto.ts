import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OrigenAjusteFiscal {
  CLIENTE = 'CLIENTE',
  PROVEEDOR = 'PROVEEDOR',
}

export enum TipoAjusteFiscal {
  RETENCION = 'RETENCION',
  PERCEPCION = 'PERCEPCION',
  DETRACCION = 'DETRACCION',
  ANTICIPO = 'ANTICIPO',
}

export enum EstadoAjusteFiscal {
  APLICADO = 'APLICADO',
  PENDIENTE_TESORERIA = 'PENDIENTE_TESORERIA',
  ANULADO = 'ANULADO',
}

export class CalcularAjusteFiscalDto {
  @ApiProperty({ enum: TipoAjusteFiscal })
  @IsEnum(TipoAjusteFiscal)
  tipo!: TipoAjusteFiscal;

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  base_calculo!: number;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100)
  tasa!: number;
}

export class RegistrarAjusteFiscalDto {
  @ApiProperty({ enum: OrigenAjusteFiscal })
  @IsEnum(OrigenAjusteFiscal)
  origen!: OrigenAjusteFiscal;

  @ApiProperty({ enum: TipoAjusteFiscal })
  @IsEnum(TipoAjusteFiscal)
  tipo!: TipoAjusteFiscal;

  @ApiProperty({ description: 'ID de la CxC o CxP que se ajusta' })
  @IsUUID('4')
  cuenta_id!: string;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  base_calculo?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100)
  tasa?: number;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @Length(3, 3)
  moneda!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;

  @ApiProperty({ example: '2026-08-10' })
  @IsDateString()
  fecha!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  referencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notas?: string;

  @ApiPropertyOptional({ description: 'Obligatorio únicamente para ANTICIPO' })
  @ValidateIf((dto: RegistrarAjusteFiscalDto) => dto.tipo === TipoAjusteFiscal.ANTICIPO)
  @IsUUID('4')
  anticipo_id?: string;

  @ApiProperty({ description: 'Clave estable del intento', minLength: 8, maxLength: 180 })
  @IsString()
  @Length(8, 180)
  idempotency_key!: string;
}

export class RegistrarAnticipoDto {
  @ApiProperty({ enum: OrigenAjusteFiscal })
  @IsEnum(OrigenAjusteFiscal)
  origen!: OrigenAjusteFiscal;

  @ApiPropertyOptional()
  @ValidateIf((dto: RegistrarAnticipoDto) => dto.origen === OrigenAjusteFiscal.CLIENTE)
  @IsUUID('4')
  cliente_id?: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: RegistrarAnticipoDto) => dto.origen === OrigenAjusteFiscal.PROVEEDOR)
  @IsUUID('4')
  proveedor_id?: string;

  @ApiProperty()
  @IsUUID('4')
  cuenta_bancaria_id!: string;

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto!: number;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @Length(3, 3)
  moneda!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;

  @ApiProperty({ example: '2026-08-10' })
  @IsDateString()
  fecha!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  referencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  notas?: string;

  @ApiProperty({ minLength: 8, maxLength: 180 })
  @IsString()
  @Length(8, 180)
  idempotency_key!: string;
}

export class DepositarDetraccionDto {
  @ApiProperty()
  @IsUUID('4')
  cuenta_bancaria_id!: string;

  @ApiProperty({ example: '2026-08-10' })
  @IsDateString()
  fecha!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  referencia?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;

  @ApiProperty({ minLength: 8, maxLength: 180 })
  @IsString()
  @Length(8, 180)
  idempotency_key!: string;
}

export class RevertirAjusteFiscalCxcDto {
  @ApiProperty({ description: 'Motivo explícito de la reversa', minLength: 3, maxLength: 500 })
  @IsString()
  @Length(3, 500)
  motivo!: string;

  @ApiProperty({ minLength: 8, maxLength: 200 })
  @IsString()
  @Length(8, 200)
  idempotency_key!: string;
}

export class ListarAjustesFiscalesQueryDto {
  @ApiPropertyOptional({ enum: OrigenAjusteFiscal })
  @IsOptional()
  @IsEnum(OrigenAjusteFiscal)
  origen?: OrigenAjusteFiscal;

  @ApiPropertyOptional({ enum: TipoAjusteFiscal })
  @IsOptional()
  @IsEnum(TipoAjusteFiscal)
  tipo?: TipoAjusteFiscal;

  @ApiPropertyOptional({ enum: EstadoAjusteFiscal })
  @IsOptional()
  @IsEnum(EstadoAjusteFiscal)
  estado?: EstadoAjusteFiscal;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export class ListarAnticiposQueryDto {
  @ApiPropertyOptional({ enum: OrigenAjusteFiscal })
  @IsOptional()
  @IsEnum(OrigenAjusteFiscal)
  origen?: OrigenAjusteFiscal;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  tercero_id?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  disponibles?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
