import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export enum DecisionAprobacion {
  APROBADO = 'APROBADO',
  RECHAZADO = 'RECHAZADO',
}

export class DecidirAprobacionDto {
  @IsEnum(DecisionAprobacion, { message: 'La decisión debe ser APROBADO o RECHAZADO' })
  decision!: DecisionAprobacion;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'Debe especificar al menos un motivo cuando se envían motivos' })
  @IsString({ each: true, message: 'Cada motivo debe ser un texto' })
  motivos?: string[];

  @IsOptional()
  @IsString()
  observaciones?: string;
}
