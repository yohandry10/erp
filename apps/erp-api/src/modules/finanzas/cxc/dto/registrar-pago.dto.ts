import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum TipoMovimientoCxc {
  PAGO = 'PAGO',
  ANTICIPO = 'ANTICIPO',
  DETRACCION = 'DETRACCION',
  PERCEPCION = 'PERCEPCION',
  RETENCION = 'RETENCION',
  NOTA_CREDITO = 'NOTA_CREDITO',
}

export class RegistrarPagoCxcDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto debe ser numérico' })
  @Min(0.01, { message: 'El monto debe ser mayor a cero' })
  monto!: number;

  @IsString({ message: 'La fecha de pago es requerida' })
  fecha_pago!: string; // ISO date

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  metodo_pago?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsUUID()
  cuenta_bancaria_id?: string;

  @IsOptional()
  @IsEnum(TipoMovimientoCxc, { message: 'Tipo de movimiento inválido' })
  tipo?: TipoMovimientoCxc;

  @IsOptional()
  @IsBoolean()
  aplica_retencion?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  retencion_monto?: number;

  @IsOptional()
  @IsUUID()
  documento_pago_id?: string;

  @IsOptional()
  @IsString()
  // HARDENING: permitir idempotencia en solicitudes de cobro al aceptar un identificador del cliente.
  idempotency_key?: string;
}
