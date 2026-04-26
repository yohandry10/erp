import { IsOptional, IsInt, Min, Max, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class VencimientosCxpDto {
  @ApiPropertyOptional({
    description: 'Número de días hacia adelante para buscar vencimientos (por defecto 30 días)',
    example: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Los días deben ser un número entero' })
  @Min(1, { message: 'Los días deben ser al menos 1' })
  @Max(365, { message: 'Los días no pueden ser más de 365' })
  dias?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por ID del proveedor',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID del proveedor debe ser un UUID válido' })
  proveedor_id?: string;
}
