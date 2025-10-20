import { IsString, IsOptional, IsEnum, IsEmail } from 'class-validator';

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
