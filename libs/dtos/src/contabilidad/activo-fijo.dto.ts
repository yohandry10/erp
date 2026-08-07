import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SituacionActivo {
  ACTIVO = 'ACTIVO',
  DEPRECIADO = 'DEPRECIADO',
  BAJA = 'BAJA',
  VENDIDO = 'VENDIDO'
}

export enum MotivoBajaActivo {
  BAJA = 'BAJA',
  VENTA = 'VENTA'
}

export class CreateActivoFijoDto {
  @ApiProperty({ description: 'Código interno del activo', example: 'AF-0001' })
  @IsString()
  codigo: string;

  @ApiProperty({ description: 'Nombre del activo', example: 'Camioneta Hilux 2026' })
  @IsString()
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ description: 'Fecha de adquisición (YYYY-MM-DD)' })
  @IsDateString()
  fecha_adquisicion: string;

  @ApiProperty({ description: 'Valor de adquisición en moneda local' })
  @IsNumber()
  @Min(0)
  valor_adquisicion: number;

  @ApiPropertyOptional({
    description: 'Valor residual estimado al final de la vida útil.',
    default: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_residual?: number;

  @ApiProperty({ description: 'Vida útil en meses', example: 60 })
  @IsInt()
  @Min(1)
  vida_util_meses: number;

  @ApiPropertyOptional({
    description:
      'Fecha desde la que empieza a depreciar. Por omisión, la de adquisición.'
  })
  @IsOptional()
  @IsDateString()
  fecha_inicio_depreciacion?: string;

  @ApiPropertyOptional({ description: 'Centro de costo al que se imputa el gasto' })
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;
}

export class UpdateActivoFijoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiPropertyOptional({
    description:
      'Nueva vida útil en meses. Se aplica hacia adelante sobre el valor pendiente, ' +
      'sin recalcular la depreciación ya registrada.'
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  vida_util_meses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_residual?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;
}

export class DepreciarPeriodoDto {
  @ApiProperty({ description: 'Año del período a depreciar', example: 2026 })
  @IsInt()
  anio: number;

  @ApiProperty({ description: 'Mes del período a depreciar (1-12)', example: 9 })
  @IsInt()
  @Min(1)
  mes: number;
}

export class DarDeBajaActivoDto {
  @ApiProperty({ description: 'Fecha de la baja (YYYY-MM-DD)' })
  @IsDateString()
  fecha: string;

  @ApiProperty({
    description: 'BAJA retira el bien sin contraprestación; VENTA registra el ingreso.',
    enum: MotivoBajaActivo
  })
  @IsEnum(MotivoBajaActivo)
  tipo: MotivoBajaActivo;

  @ApiPropertyOptional({ description: 'Importe de la venta. Obligatorio si el tipo es VENTA.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_venta?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motivo?: string;
}

export class ActivoFijoResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  codigo: string;

  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty()
  @IsDateString()
  fecha_adquisicion: string;

  @ApiProperty()
  @IsNumber()
  valor_adquisicion: number;

  @ApiProperty()
  @IsNumber()
  valor_residual: number;

  @ApiProperty()
  @IsInt()
  vida_util_meses: number;

  @ApiProperty()
  @IsNumber()
  depreciacion_acumulada: number;

  @ApiProperty({ description: 'Valor de adquisición menos depreciación acumulada' })
  @IsNumber()
  valor_neto: number;

  @ApiProperty({ enum: SituacionActivo })
  @IsEnum(SituacionActivo)
  situacion: SituacionActivo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fecha_baja?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;
}

/** Una cuota del cronograma de depreciación. */
export class CuotaDepreciacionDto {
  @ApiProperty({ example: '2026-09' })
  @IsString()
  periodo: string;

  @ApiProperty()
  @IsNumber()
  cuota: number;

  @ApiProperty()
  @IsNumber()
  acumulada: number;

  @ApiProperty()
  @IsNumber()
  valor_neto: number;
}

export class ResultadoDepreciacionDto {
  @ApiProperty({ example: '2026-09' })
  @IsString()
  periodo: string;

  @ApiProperty({ description: 'Activos depreciados en esta ejecución' })
  @IsInt()
  activos_depreciados: number;

  @ApiProperty({ description: 'Importe total depreciado en el período' })
  @IsNumber()
  total_depreciado: number;

  @ApiPropertyOptional({
    description: 'Activos que no depreciaron y el motivo.'
  })
  @IsOptional()
  omitidos?: Array<{ activo_id: string; codigo?: string; motivo: string }>;
}
