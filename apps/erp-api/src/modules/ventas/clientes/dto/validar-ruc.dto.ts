import { IsString, Length, Matches } from 'class-validator';

/**
 * ValidarRucDto
 * DTO para validar un RUC con la API de SUNAT
 * Requirements: 1.4, 19.1, 19.3
 */
export class ValidarRucDto {
  @IsString({ message: 'El RUC es requerido' })
  @Length(11, 11, { message: 'El RUC debe tener exactamente 11 dígitos' })
  @Matches(/^[0-9]{11}$/, { message: 'El RUC debe contener solo números' })
  ruc: string;
}
