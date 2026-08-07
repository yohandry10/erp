import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EstadoConciliacion {
  PARCIAL = 'PARCIAL',
  TOTAL = 'TOTAL'
}

/** Un apunte contable con saldo pendiente de casar. */
export class PartidaAbiertaDto {
  @ApiProperty({ description: 'ID de la línea de asiento' })
  @IsUUID()
  detalle_id: string;

  @ApiProperty()
  @IsUUID()
  asiento_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  numero_asiento?: string | number;

  @ApiProperty()
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  concepto?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiProperty({ description: 'Importe al debe' })
  @IsNumber()
  debe: number;

  @ApiProperty({ description: 'Importe al haber' })
  @IsNumber()
  haber: number;

  @ApiProperty({ description: 'Importe ya casado contra otras partidas' })
  @IsNumber()
  monto_conciliado: number;

  @ApiProperty({
    description:
      'Saldo abierto con signo: positivo si es deudor, negativo si es acreedor.'
  })
  @IsNumber()
  pendiente: number;
}

export class ListarPartidasAbiertasQueryDto {
  @ApiProperty({ description: 'Cuenta conciliable a inspeccionar' })
  @IsUUID()
  cuenta_id: string;

  @ApiPropertyOptional({ description: 'Fecha desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_desde?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_hasta?: string;
}

export class ConciliarPartidasDto {
  @ApiProperty({
    description:
      'Líneas de asiento a casar entre sí. Deben pertenecer a la misma cuenta y ' +
      'debe haber saldo deudor y acreedor.',
    type: [String]
  })
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  detalle_ids: string[];

  @ApiPropertyOptional({ description: 'Fecha de la conciliación (YYYY-MM-DD). Por omisión, hoy.' })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class ConciliacionResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  cuenta_id: string;

  @ApiProperty({ enum: EstadoConciliacion })
  @IsEnum(EstadoConciliacion)
  estado: EstadoConciliacion;

  @ApiProperty({ description: 'Importe efectivamente casado' })
  @IsNumber()
  monto_conciliado: number;

  @ApiProperty()
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiPropertyOptional({
    description: 'Cuánto se aplicó a cada partida en esta conciliación.'
  })
  @IsOptional()
  lineas?: Array<{ detalle_asiento_id: string; monto_aplicado: number }>;

  @ApiPropertyOptional({
    description:
      'Saldo que quedó sin casar cuando la conciliación es parcial, con su signo.'
  })
  @IsOptional()
  @IsNumber()
  saldo_no_conciliado?: number;
}

export class ResumenPartidasDto {
  @ApiProperty()
  @IsUUID()
  cuenta_id: string;

  @ApiProperty({ description: 'Suma de los saldos deudores abiertos' })
  @IsNumber()
  total_deudor: number;

  @ApiProperty({ description: 'Suma de los saldos acreedores abiertos' })
  @IsNumber()
  total_acreedor: number;

  @ApiProperty({ description: 'Diferencia entre ambos: el saldo abierto de la cuenta' })
  @IsNumber()
  saldo_abierto: number;

  @ApiProperty({ type: [PartidaAbiertaDto] })
  partidas: PartidaAbiertaDto[];
}
