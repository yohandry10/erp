import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CrearPlanillaFinancieraDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsUUID('4')
  idempotency_key!: string;
}

export class ActualizarPlanillaBorradorDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  periodo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsUUID('4')
  idempotency_key!: string;
}

export class PagarPlanillaTesoreriaDto {
  @IsIn(['efectivo', 'transferencia'])
  metodo_pago!: 'efectivo' | 'transferencia';

  @IsUUID('4')
  idempotency_key!: string;

  @IsOptional()
  @IsUUID('4')
  cuenta_bancaria_id?: string;

  @IsOptional()
  @IsUUID('4')
  sesion_caja_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  referencia?: string;

  @IsOptional()
  @IsDateString()
  fecha_pago?: string;
}
