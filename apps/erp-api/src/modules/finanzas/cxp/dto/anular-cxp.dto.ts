import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AnularCxpDto {
  @ApiProperty({
    description: 'Motivo de la anulación de la cuenta por pagar',
    example: 'Error en el registro, se creó duplicada',
    required: true,
  })
  @IsNotEmpty({ message: 'El motivo de anulación es requerido' })
  @IsString({ message: 'El motivo debe ser un texto' })
  @MaxLength(500, { message: 'El motivo no puede exceder 500 caracteres' })
  motivo: string;

  @ApiProperty({
    description: 'Observaciones adicionales sobre la anulación',
    example: 'Se procederá a crear una nueva CxP con los datos correctos',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser un texto' })
  @MaxLength(1000, { message: 'Las observaciones no pueden exceder 1000 caracteres' })
  observaciones?: string;
}
