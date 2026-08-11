import { IsString, IsOptional, IsEnum, IsEmail, IsNumber, IsBoolean } from 'class-validator';

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
  razon_social?: string;

  @IsString()
  @IsOptional()
  nombre_comercial?: string;

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

  @IsString()
  @IsOptional()
  tipo_empresa?: string;

  @IsBoolean()
  @IsOptional()
  usar_flujo_logistica?: boolean;

  @IsBoolean()
  @IsOptional()
  gre_obligatorio?: boolean;

  @IsBoolean()
  @IsOptional()
  gre_automatico_habilitado?: boolean;

  @IsNumber()
  @IsOptional()
  umbral_gre_automatico?: number;
}
