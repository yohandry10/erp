import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export enum CondicionesPagoCxp {
  CONTADO = 'CONTADO',
  CREDITO_7 = 'CREDITO_7',
  CREDITO_15 = 'CREDITO_15',
  CREDITO_30 = 'CREDITO_30',
  CREDITO_45 = 'CREDITO_45',
  CREDITO_60 = 'CREDITO_60',
  CREDITO_90 = 'CREDITO_90',
}

export class CrearCxpDto {
  @IsUUID('4', { message: 'El ID del proveedor debe ser un UUID válido' })
  proveedor_id!: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la orden debe ser un UUID válido' })
  orden_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la recepción debe ser un UUID válido' })
  recepcion_id?: string;

  @IsString({ message: 'El número de documento es requerido' })
  numero_documento!: string;

  @IsDateString({}, { message: 'La fecha de emisión debe ser una fecha válida' })
  fecha_emision!: string;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de vencimiento debe ser una fecha válida' })
  fecha_vencimiento?: string;

  @IsOptional()
  @IsEnum(CondicionesPagoCxp, { message: 'Condiciones de pago inválidas' })
  condiciones_pago?: CondicionesPagoCxp;

  @IsOptional()
  @IsNumber({}, { message: 'Los días de crédito deben ser numéricos' })
  @Min(0, { message: 'Los días de crédito no pueden ser negativos' })
  dias_credito?: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El subtotal debe ser numérico' })
  @Min(0, { message: 'El subtotal no puede ser negativo' })
  subtotal!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El IGV debe ser numérico' })
  @Min(0, { message: 'El IGV no puede ser negativo' })
  igv!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El total debe ser numérico' })
  @Min(0.01, { message: 'El total debe ser mayor a cero' })
  total!: number;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
