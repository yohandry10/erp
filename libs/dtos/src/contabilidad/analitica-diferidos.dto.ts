import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Distribución analítica
// ---------------------------------------------------------------------------

export class ImputacionAnaliticaDto {
  @ApiProperty({ description: 'Centro de costo, proyecto o sucursal según su eje' })
  @IsUUID()
  centro_costo_id: string;

  @ApiProperty({ description: 'Porcentaje de la línea imputado a este destino', example: 33.33 })
  @IsNumber()
  @Min(0.0001)
  porcentaje: number;
}

export class AsignarDistribucionDto {
  @ApiProperty({ description: 'Línea de asiento a repartir' })
  @IsUUID()
  detalle_asiento_id: string;

  @ApiProperty({
    description:
      'Eje analítico del reparto. Los porcentajes deben sumar 100 dentro del eje; ' +
      'ejes distintos son independientes entre sí.',
    example: 'CENTRO_COSTO'
  })
  @IsString()
  eje: string;

  @ApiProperty({ type: [ImputacionAnaliticaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImputacionAnaliticaDto)
  imputaciones: ImputacionAnaliticaDto[];
}

export class DistribucionAnaliticaResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  detalle_asiento_id: string;

  @ApiProperty()
  @IsUUID()
  centro_costo_id: string;

  @ApiProperty()
  @IsString()
  eje: string;

  @ApiProperty()
  @IsNumber()
  porcentaje: number;

  @ApiProperty({ description: 'Importe imputado, derivado del porcentaje' })
  @IsNumber()
  monto: number;
}

// ---------------------------------------------------------------------------
// Diferidos
// ---------------------------------------------------------------------------

export enum TipoDiferido {
  GASTO = 'GASTO',
  INGRESO = 'INGRESO'
}

export enum EstadoDiferido {
  VIGENTE = 'VIGENTE',
  DEVENGADO = 'DEVENGADO',
  CANCELADO = 'CANCELADO'
}

export class CreateDiferidoDto {
  @ApiPropertyOptional({ example: 'DIF-0001' })
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiProperty({ example: 'Seguro vehicular anual' })
  @IsString()
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ enum: TipoDiferido })
  @IsEnum(TipoDiferido)
  tipo: TipoDiferido;

  @ApiProperty({ description: 'Cuenta de balance donde espera el importe pendiente' })
  @IsUUID()
  cuenta_diferido_id: string;

  @ApiProperty({ description: 'Cuenta de resultados a la que se lleva cada cuota' })
  @IsUUID()
  cuenta_resultado_id: string;

  @ApiProperty({ description: 'Importe total a devengar' })
  @IsNumber()
  @Min(0.01)
  monto_total: number;

  @ApiProperty({ description: 'Número de períodos mensuales', example: 12 })
  @IsInt()
  @Min(1)
  periodos: number;

  @ApiProperty({ description: 'Primer período a devengar (YYYY-MM-DD)' })
  @IsDateString()
  fecha_inicio: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;
}

export class DevengarDiferidoDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  anio: number;

  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(1)
  mes: number;
}

export class CuotaDiferidoDto {
  @ApiProperty({ example: '2026-09' })
  @IsString()
  periodo: string;

  @ApiProperty()
  @IsNumber()
  monto: number;

  @ApiProperty()
  @IsNumber()
  acumulado: number;

  @ApiProperty()
  @IsNumber()
  pendiente: number;
}

export class DiferidoResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  codigo?: string;

  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty({ enum: TipoDiferido })
  @IsEnum(TipoDiferido)
  tipo: TipoDiferido;

  @ApiProperty()
  @IsNumber()
  monto_total: number;

  @ApiProperty()
  @IsNumber()
  monto_devengado: number;

  @ApiProperty({ description: 'Importe que queda por llevar a resultados' })
  @IsNumber()
  monto_pendiente: number;

  @ApiProperty()
  @IsInt()
  periodos: number;

  @ApiProperty()
  @IsDateString()
  fecha_inicio: string;

  @ApiProperty({ enum: EstadoDiferido })
  @IsEnum(EstadoDiferido)
  estado: EstadoDiferido;

  @ApiPropertyOptional({ type: [CuotaDiferidoDto] })
  @IsOptional()
  cronograma?: CuotaDiferidoDto[];
}

export class ResultadoDevengoDto {
  @ApiProperty({ example: '2026-09' })
  @IsString()
  periodo: string;

  @ApiProperty()
  @IsInt()
  diferidos_devengados: number;

  @ApiProperty()
  @IsNumber()
  total_devengado: number;

  @ApiPropertyOptional()
  @IsOptional()
  omitidos?: Array<{ diferido_id: string; nombre?: string; motivo: string }>;
}
