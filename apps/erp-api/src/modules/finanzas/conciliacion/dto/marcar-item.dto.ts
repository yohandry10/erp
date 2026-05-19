import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUUID, IsOptional, IsNumber, IsBoolean } from 'class-validator';

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return value;
};

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

  @ApiProperty({
    description: 'Autoriza explícitamente conciliar movimientos con diferencia de monto',
    example: false,
    required: false,
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  aceptar_diferencia?: boolean;
}
