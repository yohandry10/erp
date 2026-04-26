import { IsString, IsNumber, IsOptional, IsDateString, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EstadoAsiento {
  BORRADOR = 'BORRADOR',
  CONFIRMADO = 'CONFIRMADO',
  ANULADO = 'ANULADO'
}

export enum OrigenAsiento {
  MANUAL = 'MANUAL',
  AUTOMATICO = 'AUTOMATICO',
  VENTA = 'VENTA',
  COMPRA = 'COMPRA',
  COBRO = 'COBRO',
  PAGO = 'PAGO',
  AJUSTE_INVENTARIO = 'AJUSTE_INVENTARIO',
  PLANILLA = 'PLANILLA',
  DEPRECIACION = 'DEPRECIACION'
}

export class DetalleAsientoDto {
  @ApiProperty({ description: 'ID del detalle' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'ID de la cuenta contable' })
  @IsUUID()
  cuenta_id: string;

  @ApiProperty({ description: 'Código de la cuenta' })
  @IsString()
  cuenta_codigo: string;

  @ApiProperty({ description: 'Nombre de la cuenta' })
  @IsString()
  cuenta_nombre: string;

  @ApiProperty({ description: 'Monto en el debe' })
  @IsNumber()
  debe: number;

  @ApiProperty({ description: 'Monto en el haber' })
  @IsNumber()
  haber: number;

  @ApiProperty({ description: 'Concepto del movimiento' })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({ description: 'ID del centro de costo' })
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;

  @ApiPropertyOptional({ description: 'Nombre del centro de costo' })
  @IsOptional()
  @IsString()
  centro_costo_nombre?: string;
}

export class AsientoResponseDto {
  @ApiProperty({ description: 'ID del asiento contable' })
  @IsUUID()
  id: string;

  @ApiProperty({ description: 'ID del tenant' })
  @IsUUID()
  tenant_id: string;

  @ApiProperty({ description: 'Número del asiento' })
  @IsString()
  numero_asiento: string;

  @ApiProperty({ description: 'Fecha del asiento' })
  @IsDateString()
  fecha: string;

  @ApiProperty({ description: 'Concepto del asiento' })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({ description: 'Referencia (factura, recibo, etc.)' })
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiProperty({ description: 'Total del debe' })
  @IsNumber()
  total_debe: number;

  @ApiProperty({ description: 'Total del haber' })
  @IsNumber()
  total_haber: number;

  @ApiProperty({ description: 'Estado del asiento', enum: EstadoAsiento })
  @IsEnum(EstadoAsiento)
  estado: EstadoAsiento;

  @ApiPropertyOptional({ description: 'Origen del asiento (columna no existe aún en BD)', enum: OrigenAsiento })
  @IsOptional()
  @IsEnum(OrigenAsiento)
  origen?: OrigenAsiento;

  @ApiPropertyOptional({ description: 'ID del evento origen (para idempotencia)' })
  @IsOptional()
  @IsUUID()
  source_event_id?: string;

  @ApiProperty({ description: 'Fecha de creación' })
  @IsDateString()
  created_at: string;

  @ApiProperty({ description: 'Fecha de actualización' })
  @IsDateString()
  updated_at: string;

  @ApiPropertyOptional({ description: 'Detalles del asiento', type: [DetalleAsientoDto] })
  @IsOptional()
  detalles?: DetalleAsientoDto[];
}

export class CreateDetalleAsientoDto {
  @ApiProperty({ description: 'ID de la cuenta contable' })
  @IsUUID()
  cuenta_id: string;

  @ApiProperty({ description: 'Monto en el debe' })
  @IsNumber()
  debe: number;

  @ApiProperty({ description: 'Monto en el haber' })
  @IsNumber()
  haber: number;

  @ApiProperty({ description: 'Concepto del movimiento' })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({ description: 'ID del centro de costo' })
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;
}

export class CreateAsientoManualDto {
  @ApiProperty({ description: 'Fecha del asiento (YYYY-MM-DD)' })
  @IsDateString()
  fecha: string;

  @ApiProperty({ description: 'Concepto del asiento' })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({ description: 'Referencia (factura, recibo, etc.)' })
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiProperty({ description: 'Detalles del asiento (debe/haber)', type: [CreateDetalleAsientoDto] })
  detalles: CreateDetalleAsientoDto[];
}

export class ListarAsientosQueryDto {
  @ApiPropertyOptional({ description: 'Fecha desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;

  @ApiPropertyOptional({ description: 'Origen del asiento', enum: OrigenAsiento })
  @IsOptional()
  @IsEnum(OrigenAsiento)
  origen?: OrigenAsiento;

  @ApiPropertyOptional({ description: 'ID de la cuenta contable' })
  @IsOptional()
  @IsUUID()
  cuenta_id?: string;

  @ApiPropertyOptional({ description: 'Código de la cuenta contable' })
  @IsOptional()
  @IsString()
  cuenta_codigo?: string;

  @ApiPropertyOptional({ description: 'Estado del asiento', enum: EstadoAsiento })
  @IsOptional()
  @IsEnum(EstadoAsiento)
  estado?: EstadoAsiento;

  @ApiPropertyOptional({ description: 'Número de asiento' })
  @IsOptional()
  @IsString()
  numero_asiento?: string;

  @ApiPropertyOptional({ description: 'Referencia (factura, recibo, etc.)' })
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiPropertyOptional({ description: 'ID del centro de costo' })
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;

  @ApiPropertyOptional({ description: 'Página (para paginación)', default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Límite de resultados por página', default: 50 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}
