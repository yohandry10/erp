import { IsString, IsOptional, IsEnum, IsEmail, IsNumber } from 'class-validator';

export enum TenantEstado {
  ACTIVO = 'ACTIVO',
  INACTIVO = 'INACTIVO',
  SUSPENDIDO = 'SUSPENDIDO',
  PRUEBA = 'PRUEBA'
}

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  nombre?: string;

  @IsString()
  @IsOptional()
  ruc?: string;

  @IsString()
  @IsOptional()
  direccion?: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  pais?: string;

  @IsNumber()
  @IsOptional()
  pais_id?: number;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsEnum(TenantEstado)
  @IsOptional()
  estado?: TenantEstado;

  @IsString()
  @IsOptional()
  plan?: string;
}
