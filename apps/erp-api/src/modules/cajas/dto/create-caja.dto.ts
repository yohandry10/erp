import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCajaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  sucursal_id?: string;

  @IsString()
  @IsOptional()
  almacen_id?: string;

  @IsString()
  @IsOptional()
  dispositivo?: string;

  @IsString()
  @IsOptional()
  tipo?: string; // TIENDA / MOSTRADOR / KIOSKO
}
