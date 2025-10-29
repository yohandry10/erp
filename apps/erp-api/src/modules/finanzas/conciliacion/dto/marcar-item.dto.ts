import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsNumber } from 'class-validator';

export class MarcarItemDto {
  @ApiProperty({
    description: 'ID del movimiento del sistema a conciliar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  movimiento_sistema_id: string;

  @ApiProperty({
    description: 'ID del movimiento del extracto bancario a conciliar',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  movimiento_extracto_id: string;

  @ApiProperty({
    description: 'Diferencia entre los montos (opcional, para registro)',
    example: 0.50,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  diferencia?: number;
}
