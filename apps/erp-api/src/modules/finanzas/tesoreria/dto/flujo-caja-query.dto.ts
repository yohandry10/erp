import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsUUID, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FlujoCajaQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial para la proyección (por defecto: hoy)',
    example: '2025-10-25',
  })
  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @ApiPropertyOptional({
    description: 'Fecha final para la proyección (por defecto: 90 días desde hoy)',
    example: '2026-01-25',
  })
  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por cuenta bancaria específica',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  cuenta_bancaria_id?: string;

  @ApiPropertyOptional({
    description: 'Días de proyección (alternativa a fecha_hasta)',
    example: 90,
    default: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  dias_proyeccion?: number;
}
