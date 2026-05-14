import { IsOptional, IsDateString, IsString, IsBoolean, IsInt, Min, Max, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

const toOptionalBoolean = ({ obj, key, value }: { obj?: Record<string, unknown>; key?: string; value: unknown }) => {
  const rawValue = key && obj ? obj[key] : value;
  if (rawValue === undefined || rawValue === null || rawValue === '') return undefined;
  if (typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim().toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return rawValue;
};

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
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'El estado de conciliación debe ser un booleano' })
  conciliado?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar movimientos importados desde extracto bancario',
    example: true,
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'El origen de extracto debe ser un booleano' })
  es_extracto?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar movimientos asociados a una conciliación bancaria',
    example: '0f2d1186-6d09-4fdb-9eb5-5d6b5d15db41',
  })
  @IsOptional()
  @IsUUID('4', { message: 'La conciliación debe ser un UUID válido' })
  conciliacion_id?: string;

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
