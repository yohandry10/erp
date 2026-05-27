import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

const METODOS_PAGO_CXC = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'CHEQUE',
  'TARJETA',
  'RETENCION',
  'DETRACCION',
  'ANTICIPO',
  'NOTA_CREDITO',
] as const;

export class RegistrarPagoCxcDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto debe ser numérico' })
  @Min(0.01, { message: 'El monto debe ser mayor a cero' })
  monto!: number;

  @IsDateString({ strict: true }, { message: 'La fecha de pago debe ser una fecha válida' })
  fecha_pago!: string; // ISO date

  @IsOptional()
  @IsString()
  @MaxLength(3)
  moneda?: string;

  @IsOptional()
  @IsString()
  @IsIn(METODOS_PAGO_CXC, { message: 'Método de pago inválido' })
  metodo_pago?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
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
  @MaxLength(200)
  // HARDENING: permitir idempotencia en solicitudes de cobro al aceptar un identificador del cliente.
  idempotency_key?: string;
}
