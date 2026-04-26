import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActivateDemoTenantDto {
  @ApiProperty({ description: 'Email real del usuario demo' })
  @IsEmail({}, { message: 'El email debe ser válido' })
  email: string;

  @ApiProperty({ description: 'Contraseña temporal para el usuario demo' })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @ApiPropertyOptional({ description: 'Días de duración de la demo (default: 15)', minimum: 1, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  dias_duracion?: number = 15;

  @ApiPropertyOptional({ description: 'Nombre del usuario demo' })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ description: 'Apellido del usuario demo' })
  @IsOptional()
  @IsString()
  apellido?: string;
}
