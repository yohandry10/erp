import { IsIn, IsOptional, IsDateString, IsUUID, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const METODOS_PAGO_TESORERIA = ['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'TARJETA'] as const;

export class ListarPagosQueryDto {
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
    description: 'ID del proveedor para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID del proveedor debe ser un UUID válido' })
  proveedor_id?: string;

  @ApiPropertyOptional({
    description: 'ID de la cuenta bancaria para filtrar',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la cuenta bancaria debe ser un UUID válido' })
  cuenta_bancaria_id?: string;

  @ApiPropertyOptional({
    description: 'Método de pago para filtrar',
    example: 'TRANSFERENCIA',
    enum: METODOS_PAGO_TESORERIA,
  })
  @IsOptional()
  @IsString({ message: 'El método de pago debe ser un texto' })
  @IsIn(METODOS_PAGO_TESORERIA, { message: 'Método de pago inválido' })
  metodo_pago?: string;

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
  limit?: number = 50;
}
