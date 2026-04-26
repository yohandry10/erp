import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MatchAutomaticoDto {
  @ApiProperty({
    description: 'Tolerancia en días para el match por fecha (±N días)',
    example: 2,
    default: 2,
    minimum: 0,
    maximum: 7,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'La tolerancia debe ser un número entero' })
  @Min(0, { message: 'La tolerancia mínima es 0 días' })
  @Max(7, { message: 'La tolerancia máxima es 7 días' })
  tolerancia_dias?: number = 2;
}
