import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateCajaDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsString()
  @IsOptional()
  sucursal_id?: string;

  @IsUUID()
  @IsOptional()
  almacen_id?: string;

  @IsString()
  @IsOptional()
  dispositivo?: string;

  @IsString()
  @IsOptional()
  tipo?: string;

  @IsString()
  @IsOptional()
  estado?: string;
}
