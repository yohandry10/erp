import { IsEmail, IsString, IsOptional, IsNotEmpty, IsBoolean, IsNumber, IsIn } from 'class-validator';

export class CreateTenantDto {
  // Información básica del tenant
  @IsString()
  @IsNotEmpty()
  ruc: string;

  @IsString()
  @IsNotEmpty()
  razon_social: string;

  @IsString()
  @IsOptional()
  nombre_comercial?: string;

  @IsString()
  @IsNotEmpty()
  direccion: string;

  @IsNumber()
  @IsNotEmpty()
  pais_id: number;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  telefono?: string;

  // Configuración de ventas
  @IsString()
  @IsIn(['MICRO', 'PEQUEÑA', 'MEDIANA', 'GRANDE'])
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

  // Campos opcionales para compatibilidad con el servicio existente
  @IsString()
  @IsOptional()
  pais?: string;

  @IsString()
  @IsOptional()
  moneda?: string;

  @IsEmail()
  @IsOptional()
  admin_email?: string;

  @IsString()
  @IsOptional()
  admin_nombre?: string;

  @IsString()
  @IsOptional()
  admin_apellido?: string;

  @IsString()
  @IsOptional()
  admin_password?: string; // Contraseña personalizada del admin (opcional)
}
