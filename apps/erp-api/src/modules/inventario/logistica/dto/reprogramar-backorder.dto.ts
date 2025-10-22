import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReprogramarBackorderDto {
  @IsDateString({}, { message: 'La fecha comprometida debe tener formato ISO (YYYY-MM-DD).' })
  proxima_fecha_compromiso!: string;

  @IsOptional()
  @IsIn([1, 2, 3, 4, 5], { message: 'La prioridad debe estar entre 1 (alta) y 5 (baja).' })
  prioridad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La nota no puede superar los 500 caracteres.' })
  nota?: string;
}
