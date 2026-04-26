import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CerrarCajaDto {
  @IsNumber()
  @IsNotEmpty()
  monto_cierre: number;

  @IsOptional()
  @IsNumber()
  monto_contado?: number;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsString()
  @IsOptional()
  notas?: string;

  @IsOptional()
  resumen?: Record<string, any>;

  @IsOptional()
  @IsString()
  sesion_id?: string;

  @IsOptional()
  @IsString()
  sesionId?: string;
}
