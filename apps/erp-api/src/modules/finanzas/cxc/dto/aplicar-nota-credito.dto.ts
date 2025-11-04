import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AplicarNotaCreditoDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto debe ser numérico' })
  @Min(0.01, { message: 'El monto debe ser mayor a cero' })
  monto!: number;

  @IsDateString({}, { message: 'La fecha de emisión debe tener formato ISO-8601' })
  fecha_emision!: string;

  @IsOptional()
  @IsString()
  serie?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsUUID()
  documento_id?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  // HARDENING: permitir anotaciones internas para auditoría del ajuste.
  notas?: string;
}
