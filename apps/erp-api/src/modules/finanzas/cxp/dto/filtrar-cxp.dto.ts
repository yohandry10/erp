import { IsOptional, IsEnum, IsDateString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
}
