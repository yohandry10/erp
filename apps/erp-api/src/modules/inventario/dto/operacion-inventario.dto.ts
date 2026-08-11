import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals
} from 'class-validator';

export class RegistrarAjusteInventarioDto {
  @IsUUID()
  producto_id!: string;

  @IsUUID()
  almacen_id!: string;

  @IsOptional()
  @IsUUID()
  ubicacion_id?: string;

  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @NotEquals(0)
  @Min(-999999999999)
  @Max(999999999999)
  delta!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}

export class TransferirInventarioDto {
  @IsUUID()
  producto_id!: string;

  @IsUUID()
  almacen_origen_id!: string;

  @IsUUID()
  almacen_destino_id!: string;

  @IsOptional()
  @IsUUID()
  ubicacion_origen_id?: string;

  @IsOptional()
  @IsUUID()
  ubicacion_destino_id?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(999999999999)
  cantidad!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lote?: string;

  @IsOptional()
  @IsDateString()
  fecha_expiracion?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotency_key!: string;
}
