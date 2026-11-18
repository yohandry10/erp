import { IsEmail, MaxLength } from 'class-validator';

export class CorreoPruebaDto {
  @IsEmail({}, { message: 'Debe proporcionar un correo válido' })
  @MaxLength(254)
  destinatario!: string;
}
