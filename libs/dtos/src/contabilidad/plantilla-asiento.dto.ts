import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoAsiento } from './asiento.dto';

export enum PeriodicidadPlantilla {
  NINGUNA = 'NINGUNA',
  MENSUAL = 'MENSUAL',
  BIMESTRAL = 'BIMESTRAL',
  TRIMESTRAL = 'TRIMESTRAL',
  SEMESTRAL = 'SEMESTRAL',
  ANUAL = 'ANUAL'
}

/** Meses que avanza cada periodicidad. NINGUNA no avanza: no es recurrente. */
export const MESES_POR_PERIODICIDAD: Record<PeriodicidadPlantilla, number> = {
  [PeriodicidadPlantilla.NINGUNA]: 0,
  [PeriodicidadPlantilla.MENSUAL]: 1,
  [PeriodicidadPlantilla.BIMESTRAL]: 2,
  [PeriodicidadPlantilla.TRIMESTRAL]: 3,
  [PeriodicidadPlantilla.SEMESTRAL]: 6,
  [PeriodicidadPlantilla.ANUAL]: 12
};

export class DetallePlantillaDto {
  @ApiProperty({ description: 'ID de la cuenta contable' })
  @IsUUID()
  cuenta_id: string;

  @ApiProperty({ description: 'Monto en el debe' })
  @IsNumber()
  @Min(0)
  debe: number;

  @ApiProperty({ description: 'Monto en el haber' })
  @IsNumber()
  @Min(0)
  haber: number;

  @ApiProperty({ description: 'Concepto del movimiento' })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({ description: 'ID del centro de costo' })
  @IsOptional()
  @IsUUID()
  centro_costo_id?: string;
}

export class CreatePlantillaAsientoDto {
  @ApiProperty({ description: 'Nombre de la plantilla', example: 'Provisión mensual de alquiler' })
  @IsString()
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción larga' })
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty({ description: 'Concepto que llevará el asiento generado' })
  @IsString()
  concepto: string;

  @ApiPropertyOptional({ description: 'Referencia que llevará el asiento generado' })
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiPropertyOptional({
    description: 'NINGUNA convierte la plantilla en reutilizable a mano, sin agenda.',
    enum: PeriodicidadPlantilla,
    default: PeriodicidadPlantilla.NINGUNA
  })
  @IsOptional()
  @IsEnum(PeriodicidadPlantilla)
  periodicidad?: PeriodicidadPlantilla;

  @ApiPropertyOptional({
    description: 'Día del mes de generación. -1 significa último día del mes.',
    minimum: -1,
    maximum: 31
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(31)
  dia_ejecucion?: number;

  @ApiPropertyOptional({ description: 'Primera fecha de generación (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @ApiPropertyOptional({ description: 'Fecha a partir de la cual deja de generar (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @ApiPropertyOptional({
    description:
      'Estado del asiento generado. BORRADOR por omisión: un asiento automático debería revisarse.',
    enum: [EstadoAsiento.BORRADOR, EstadoAsiento.CONFIRMADO],
    default: EstadoAsiento.BORRADOR
  })
  @IsOptional()
  @IsEnum(EstadoAsiento)
  crear_en_estado?: EstadoAsiento;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;

  @ApiProperty({ type: [DetallePlantillaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetallePlantillaDto)
  detalles: DetallePlantillaDto[];
}

export class UpdatePlantillaAsientoDto extends CreatePlantillaAsientoDto {}

export class GenerarDesdePlantillaDto {
  @ApiPropertyOptional({
    description: 'Fecha del asiento (YYYY-MM-DD). Por omisión, hoy.'
  })
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @ApiPropertyOptional({ description: 'Sobrescribe el concepto de la plantilla' })
  @IsOptional()
  @IsString()
  concepto?: string;

  @ApiPropertyOptional({ description: 'Sobrescribe la referencia de la plantilla' })
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiPropertyOptional({
    description: 'Sobrescribe el estado destino de la plantilla',
    enum: [EstadoAsiento.BORRADOR, EstadoAsiento.CONFIRMADO]
  })
  @IsOptional()
  @IsEnum(EstadoAsiento)
  estado?: EstadoAsiento;

  @ApiPropertyOptional({
    description:
      'Importes que reemplazan a los de la plantilla, en el mismo orden de sus líneas. ' +
      'Útil cuando el reparto contable es fijo pero el monto cambia cada período.',
    type: [DetallePlantillaDto]
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetallePlantillaDto)
  detalles?: DetallePlantillaDto[];
}

export class PlantillaAsientoResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  tenant_id: string;

  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  descripcion?: string;

  @ApiProperty()
  @IsString()
  concepto: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referencia?: string;

  @ApiProperty({ enum: PeriodicidadPlantilla })
  @IsEnum(PeriodicidadPlantilla)
  periodicidad: PeriodicidadPlantilla;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  dia_ejecucion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fecha_inicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  fecha_fin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  proxima_ejecucion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  ultima_ejecucion?: string;

  @ApiProperty({ enum: EstadoAsiento })
  @IsEnum(EstadoAsiento)
  crear_en_estado: EstadoAsiento;

  @ApiProperty()
  @IsBoolean()
  activa: boolean;

  @ApiPropertyOptional({ type: [DetallePlantillaDto] })
  @IsOptional()
  detalles?: DetallePlantillaDto[];

  @ApiPropertyOptional({ description: 'Suma del debe de la plantilla' })
  @IsOptional()
  @IsNumber()
  total_debe?: number;

  @ApiPropertyOptional({ description: 'Suma del haber de la plantilla' })
  @IsOptional()
  @IsNumber()
  total_haber?: number;
}
