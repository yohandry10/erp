import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserEstado } from './update-user.dto';

/**
 * Forma del body HTTP de alta y edición de usuario.
 *
 * No se reutilizan `CreateUserDto`/`UpdateUserDto`: esos describen lo que
 * consume `UserManagementService`, que recibe `roles: string[]`, mientras que la
 * pantalla envía un único `rol_id`. Son dos contratos distintos y mezclarlos
 * obligaría a que el cliente conociera la forma interna del servicio.
 *
 * El `ValidationPipe` global corre con `forbidNonWhitelisted`, así que todo campo
 * que la pantalla envíe debe estar declarado aquí o la petición pasa a 400. Por
 * eso `estado` aparece en el alta aunque el controlador no lo use: el formulario
 * lo manda siempre, y omitirlo rompería la creación de usuarios.
 */
export class CrearUsuarioRequestDto {
  @IsUUID('4')
  idempotency_key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  apellido?: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  cargo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  departamento?: string;

  @IsOptional()
  @IsUUID('4')
  rol_id?: string;

  /** Aceptado y descartado: el alta siempre nace activa. */
  @IsOptional()
  @IsEnum(UserEstado)
  estado?: UserEstado;
}

export class ActualizarUsuarioRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  apellido?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  cargo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  departamento?: string;

  @IsOptional()
  @IsEnum(UserEstado)
  estado?: UserEstado;

  @IsOptional()
  @IsUUID('4')
  rol_id?: string;
}

export class CambiarEstadoUsuarioRequestDto {
  @IsEnum(UserEstado)
  estado!: UserEstado;
}
