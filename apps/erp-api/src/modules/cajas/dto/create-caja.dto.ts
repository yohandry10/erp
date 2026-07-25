import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

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

  @IsUUID()
  @IsNotEmpty()
  almacen_id: string;

  @IsString()
  @IsOptional()
  dispositivo?: string;

  @IsString()
  @IsOptional()
  tipo?: string; // TIENDA / MOSTRADOR / KIOSKO
}
