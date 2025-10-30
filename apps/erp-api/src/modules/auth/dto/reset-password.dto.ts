import { IsEmail, IsNotEmpty, IsString, Length, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Email del usuario',
    example: 'usuario@ejemplo.com'
  })
  @IsEmail({}, { message: 'Debe proporcionar un email válido' })
  @IsNotEmpty({ message: 'El email es requerido' })
  email: string;

  @ApiProperty({
    description: 'Token de reset recibido por email',
    example: 'abc123def456...'
  })
  @IsString({ message: 'El token debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El token es requerido' })
  @Length(64, 64, { message: 'Token inválido' })
  token: string;

  @ApiProperty({
    description: 'Nueva contraseña (mínimo 8 caracteres, debe incluir mayúscula, minúscula, número y símbolo especial)',
    example: 'MiPassword123!',
    minLength: 8
  })
  @IsString({ message: 'La nueva contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La nueva contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener mínimo 8 caracteres' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    {
      message: 'La contraseña debe contener al menos: una mayúscula, una minúscula, un número y un símbolo especial (@$!%*?&)'
    }
  )
  newPassword: string;
}

