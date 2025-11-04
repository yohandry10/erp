import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReprogramarCxcDto {
  @IsDateString({}, { message: 'La nueva fecha de vencimiento debe ser válida (ISO-8601)' })
  nueva_fecha_vencimiento!: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  // HARDENING: registrar comentarios para trazabilidad de reprogramaciones.
  comentarios?: string;
}
