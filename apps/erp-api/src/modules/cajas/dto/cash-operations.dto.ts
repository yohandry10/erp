import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SolicitarRetiroCajaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsIn(['DEPOSITO_BANCARIO', 'COMPRA_EMERGENCIA', 'BOVEDA', 'BÓVEDA', 'OTRO'])
  motivo: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo_detalle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  foto_comprobante?: string;

  @IsOptional()
  @IsUUID()
  cuenta_bancaria_id?: string;

  @IsOptional()
  @IsUUID()
  cuenta_contrapartida_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;
}
export class ConciliarRetiroCajaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  numero_operacion: string;

  @IsString()
  @IsNotEmpty()
  fecha_conciliacion: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comprobante_url?: string;
}

export class IniciarCambioTurnoCajaDto {
  @IsUUID()
  usuario_entrante_id: string;
}

export class CompletarCambioTurnoCajaDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monto_contado: number;

  @IsObject()
  denominaciones: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  foto_arqueo: string;

  @IsString()
  @MinLength(4)
  @MaxLength(200)
  confirmacion_saliente: string;

  @IsString()
  @MinLength(4)
  @MaxLength(200)
  confirmacion_entrante: string;

  @IsOptional()
  @IsUUID()
  cuenta_diferencia_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;
}

export class CancelarCambioTurnoCajaDto {
  @IsString()
  @MinLength(8)
  @MaxLength(300)
  razon: string;
}

export class MovimientoManualCajaDto {
  @IsIn(['INGRESO', 'GASTO'])
  tipo: 'INGRESO' | 'GASTO';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo: string;

  @IsUUID()
  cuenta_contrapartida_id: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;
}
