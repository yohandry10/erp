import { IsOptional, IsDateString, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListarMovimientosQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial del rango de búsqueda',
    example: '2025-10-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe ser una fecha válida en formato ISO' })
  fecha_desde?: string;

  @ApiPropertyOptional({
    description: 'Fecha final del rango de búsqueda',
    example: '2025-10-31',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe ser una fecha válida en formato ISO' })
  fecha_hasta?: string;

  @ApiPropertyOptional({
    description: 'Tipo de movimiento para filtrar',
    example: 'ABONO',
    enum: ['ABONO', 'CARGO'],
  })
  @IsOptional()
  @IsString({ message: 'El tipo de movimiento debe ser un texto' })
  tipo?: 'ABONO' | 'CARGO';

  @ApiPropertyOptional({
    description: 'Filtrar por estado de conciliación',
    example: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'El estado de conciliación debe ser un booleano' })
  conciliado?: boolean;

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
  @Max(100, { message: 'El límite debe ser menor o igual a 100' })
  limit?: number = 50;
}
