import { IsString, IsEnum, IsOptional, IsEmail, Length, MinLength, Matches } from 'class-validator';
import { TipoCliente, TipoDocumento } from '../entities/cliente.entity';

/**
 * UpdateClienteDto
 * DTO para actualizar un cliente existente
 * Todos los campos son opcionales
 * Requirements: 1.2, 1.8
 */
export class UpdateClienteDto {
  @IsOptional()
  @IsEnum(TipoCliente, { message: 'El tipo de cliente debe ser PERSONA o EMPRESA' })
  tipo?: TipoCliente;

  @IsOptional()
  @IsEnum(TipoDocumento, { message: 'El tipo de documento debe ser DNI, RUC, CE o PASAPORTE' })
  documento_tipo?: TipoDocumento;

  @IsOptional()
  @IsString({ message: 'El número de documento es requerido' })
  @Length(8, 20, { message: 'El número de documento debe tener entre 8 y 20 caracteres' })
  @Matches(/^[0-9A-Z]+$/, { message: 'El número de documento solo puede contener números y letras mayúsculas' })
  documento_numero?: string;

  @IsOptional()
  @IsString({ message: 'La razón social es requerida' })
  @MinLength(3, { message: 'La razón social debe tener al menos 3 caracteres' })
  razon_social?: string;

  @IsOptional()
  @IsString({ message: 'El nombre comercial debe ser texto' })
  nombre_comercial?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto' })
  direccion?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El email debe ser válido' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto' })
  @Length(6, 20, { message: 'El teléfono debe tener entre 6 y 20 caracteres' })
  telefono?: string;
}
