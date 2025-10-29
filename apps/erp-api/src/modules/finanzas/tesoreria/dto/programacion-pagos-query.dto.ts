import { IsOptional, IsDateString, IsUUID, IsString, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ProgramacionPagosQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial del rango de vencimiento',
    example: '2025-10-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe ser una fecha válida en formato ISO' })
  fecha_desde?: string;

  @ApiPropertyOptional({
    description: 'Fecha final del rango de vencimiento',
    example: '2025-10-31',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe ser una fecha válida en formato ISO' })
  fecha_hasta?: string;

  @ApiPropertyOptional({
    description: 'ID del proveedor para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID del proveedor debe ser un UUID válido' })
  proveedor_id?: string;

  @ApiPropertyOptional({
    description: 'Estado de la CxP para filtrar',
    example: 'PENDIENTE',
    enum: ['PENDIENTE', 'PARCIAL', 'VENCIDA'],
  })
  @IsOptional()
  @IsString({ message: 'El estado debe ser un texto' })
  estado?: string;

  @ApiPropertyOptional({
    description: 'Número de página',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por página',
    example: 50,
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1' })
  limit?: number = 50;
}
