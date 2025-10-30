import { IsUUID, IsNumber, IsOptional, IsString, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EstadoPresupuesto {
  ACTIVO = 'ACTIVO',
  BLOQUEADO = 'BLOQUEADO',
  CERRADO = 'CERRADO'
}

export class CreatePresupuestoDto {
  @ApiProperty({
    description: 'ID del centro de costo',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsUUID()
  centro_costo_id: string;

  @ApiProperty({
    description: 'ID de la cuenta contable del plan de cuentas',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  @IsUUID()
  cuenta_id: string;

  @ApiProperty({
    description: 'ID del período contable',
    example: '123e4567-e89b-12d3-a456-426614174002'
  })
  @IsUUID()
  periodo_contable_id: string;

  @ApiProperty({
    description: 'Monto total presupuestado para el período',
    example: 50000.00,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  monto_presupuestado: number;

  @ApiPropertyOptional({
    description: 'Notas o comentarios adicionales sobre el presupuesto',
    example: 'Presupuesto para gastos de marketing del Q1'
  })
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiPropertyOptional({
    description: 'Estado del presupuesto',
    enum: EstadoPresupuesto,
    default: EstadoPresupuesto.ACTIVO
  })
  @IsOptional()
  @IsEnum(EstadoPresupuesto)
  estado?: EstadoPresupuesto;
}

export class UpdatePresupuestoDto {
  @ApiPropertyOptional({
    description: 'Monto total presupuestado para el período',
    example: 60000.00,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monto_presupuestado?: number;

  @ApiPropertyOptional({
    description: 'Notas o comentarios adicionales sobre el presupuesto',
    example: 'Presupuesto ajustado para gastos de marketing del Q1'
  })
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiPropertyOptional({
    description: 'Estado del presupuesto',
    enum: EstadoPresupuesto
  })
  @IsOptional()
  @IsEnum(EstadoPresupuesto)
  estado?: EstadoPresupuesto;
}

export class PresupuestoResponseDto {
  @ApiProperty({ description: 'ID del presupuesto' })
  id: string;

  @ApiProperty({ description: 'ID del tenant' })
  tenant_id: string;

  @ApiProperty({ description: 'ID del centro de costo' })
  centro_costo_id: string;

  @ApiProperty({ description: 'ID de la cuenta contable' })
  cuenta_id: string;

  @ApiProperty({ description: 'ID del período contable' })
  periodo_contable_id: string;

  @ApiProperty({ description: 'Monto total presupuestado' })
  monto_presupuestado: number;

  @ApiProperty({ description: 'Monto real ejecutado (gastos registrados)' })
  monto_ejecutado: number;

  @ApiProperty({ description: 'Monto comprometido (órdenes de compra aprobadas pendientes)' })
  monto_comprometido: number;

  @ApiProperty({ description: 'Monto disponible calculado (presupuestado - ejecutado - comprometido)' })
  monto_disponible: number;

  @ApiProperty({ description: 'Porcentaje de ejecución del presupuesto' })
  porcentaje_ejecutado: number;

  @ApiProperty({ description: 'Estado del presupuesto', enum: EstadoPresupuesto })
  estado: EstadoPresupuesto;

  @ApiProperty({ description: 'Notas o comentarios', required: false })
  notas?: string;

  @ApiProperty({ description: 'Fecha de creación' })
  created_at: string;

  @ApiProperty({ description: 'Fecha de última actualización' })
  updated_at: string;

  @ApiProperty({ description: 'Usuario que creó el presupuesto', required: false })
  created_by?: string;

  @ApiProperty({ description: 'Usuario que actualizó el presupuesto', required: false })
  updated_by?: string;
}
