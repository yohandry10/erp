import { IsString, IsEnum, IsOptional, IsEmail, Length, MinLength, Matches } from 'class-validator';
import { TipoCliente, TipoDocumento } from '../entities/cliente.entity';

/**
 * CreateClienteDto
 * DTO para crear un nuevo cliente
 * Requirements: 1.2, 1.3, 1.4, 19.1, 19.2
 */
export class CreateClienteDto {
  @IsEnum(TipoCliente, { message: 'El tipo de cliente debe ser PERSONA o EMPRESA' })
  tipo: TipoCliente;

  @IsEnum(TipoDocumento, { message: 'El tipo de documento debe ser DNI, RUC, CUIT, NIT, CC, TI, CE o PASAPORTE' })
  documento_tipo: TipoDocumento;

  @IsString({ message: 'El número de documento es requerido' })
  @Length(6, 20, { message: 'El número de documento debe tener entre 6 y 20 caracteres' })
  @Matches(/^[0-9A-Z]+$/, { message: 'El número de documento solo puede contener números y letras mayúsculas' })
  documento_numero: string;

  @IsString({ message: 'La razón social es requerida' })
  @MinLength(3, { message: 'La razón social debe tener al menos 3 caracteres' })
  razon_social: string;

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
