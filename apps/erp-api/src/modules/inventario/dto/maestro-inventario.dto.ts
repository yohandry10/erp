import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PrecioSucursalProductoDto {
  @IsUUID()
  sucursal_id!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  moneda!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  precio!: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

class ProductoMaestroBaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  marca?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  categoria!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  precio_venta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  precio_compra?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  stock_minimo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  codigo_barras?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  impuesto?: number;

  @IsOptional()
  @IsBoolean()
  es_servicio?: boolean;

  @IsOptional()
  @IsBoolean()
  controla_stock?: boolean;

  @IsOptional()
  @IsIn(['10', '20', '30', '40'])
  afectacion_igv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipo_operacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clasificador_sunat?: string;

  @IsOptional()
  @IsBoolean()
  favorito?: boolean;

  @IsOptional()
  @IsObject()
  atributos_extra?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PrecioSucursalProductoDto)
  precios_sucursal?: PrecioSucursalProductoDto[];
}

export class CreateProductoMaestroDto extends ProductoMaestroBaseDto {
  @IsOptional()
  @IsUUID()
  almacen_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  stock_inicial?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  stock_reservado?: number;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}

export class UpdateProductoMaestroDto extends PartialType(ProductoMaestroBaseDto) {
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}

class AlmacenBaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  es_principal?: boolean;
}

export class CreateAlmacenDto extends AlmacenBaseDto {
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}

export class UpdateAlmacenDto extends PartialType(AlmacenBaseDto) {
  @IsOptional()
  @Equals(true, { message: 'La desactivación requiere DELETE y su permiso específico' })
  activo?: true;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}

class UbicacionBaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsIn(['PISO', 'PASILLO', 'RACK', 'ESTANTE', 'BIN', 'OTRO'])
  tipo?: string;
}

export class CreateUbicacionDto extends UbicacionBaseDto {
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}

export class UpdateUbicacionDto extends PartialType(UbicacionBaseDto) {
  @IsOptional()
  @Equals(true, { message: 'La desactivación requiere DELETE y su permiso específico' })
  activo?: true;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}
