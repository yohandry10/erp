import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class AbrirCajaDto {
  @IsString()
  @IsOptional()
  cajero_id?: string;

  @IsNumber()
  @IsNotEmpty()
  monto_inicio: number;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsString()
  @IsOptional()
  dispositivo?: string;
}
