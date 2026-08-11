import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PrecioListaDetalleDto {
  @IsOptional()
  @IsUUID('4')
  producto_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  marca?: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  cantidad_minima = 0;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  precio_unitario: number;
}
export class CrearListaPreciosDto {
  @IsString()
  @Length(2, 40)
  codigo: string;

  @IsString()
  @Length(2, 160)
  nombre: string;

  @IsString()
  @Length(3, 3)
  moneda = 'PEN';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  prioridad?: number;

  @IsOptional()
  @IsUUID('4')
  vendedor_id?: string;

  @IsOptional()
  @IsUUID('4')
  cliente_id?: string;

  @IsDateString()
  vigencia_desde: string;

  @IsOptional()
  @IsDateString()
  vigencia_hasta?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(999)
  @ValidateNested({ each: true })
  @Type(() => PrecioListaDetalleDto)
  detalles: PrecioListaDetalleDto[];
}

export class ResolverPrecioItemDto {
  @IsUUID('4')
  producto_id: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  cantidad: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  precio_unitario?: number;
}

export class ResolverPreciosDto {
  @IsOptional()
  @IsUUID('4')
  vendedor_id?: string;

  @IsOptional()
  @IsUUID('4')
  cliente_id?: string;

  @IsString()
  @Length(3, 3)
  moneda = 'PEN';

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(999)
  @ValidateNested({ each: true })
  @Type(() => ResolverPrecioItemDto)
  detalle: ResolverPrecioItemDto[];
}

export class CrearReglaComisionDto {
  @IsString()
  @Length(2, 40)
  codigo: string;

  @IsString()
  @Length(2, 160)
  nombre: string;

  @IsOptional()
  @IsUUID('4')
  vendedor_id?: string;

  @IsOptional()
  @IsUUID('4')
  producto_id?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  marca?: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100)
  porcentaje: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  prioridad?: number;

  @IsDateString()
  vigencia_desde: string;

  @IsOptional()
  @IsDateString()
  vigencia_hasta?: string;
}

export class CambiarEstadoReglaDto {
  @IsBoolean()
  activo: boolean;
}

export class FuenteConsolidadoDto {
  @IsIn(['POS', 'DOCUMENTO'])
  tipo: 'POS' | 'DOCUMENTO';

  @IsUUID('4')
  id: string;
}

export class CrearConsolidadoVentasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FuenteConsolidadoDto)
  fuentes: FuenteConsolidadoDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}
