import { IsOptional, IsEnum, IsDateString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum EstadoCxp {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  PAGADA = 'PAGADA',
  VENCIDA = 'VENCIDA',
  ANULADA = 'ANULADA',
}

export class FiltrarCxpDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado de la cuenta por pagar',
    enum: EstadoCxp,
  })
  @IsOptional()
  @IsEnum(EstadoCxp, { message: 'Estado inválido' })
  estado?: EstadoCxp;

  @ApiPropertyOptional({
    description: 'Filtrar por fecha de vencimiento desde (formato ISO)',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe ser una fecha válida' })
  vencimiento_desde?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por fecha de vencimiento hasta (formato ISO)',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe ser una fecha válida' })
  vencimiento_hasta?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID del proveedor',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El ID del proveedor debe ser un UUID válido' })
  proveedor_id?: string;

  @ApiPropertyOptional({
    description: 'Numero de pagina',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un numero entero' })
  @Min(1, { message: 'La pagina debe ser mayor o igual a 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por pagina',
    example: 50,
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El limite debe ser un numero entero' })
  @Min(1, { message: 'El limite debe ser mayor o igual a 1' })
  @Max(100, { message: 'El limite no puede ser mayor a 100' })
  limit?: number = 50;
}
