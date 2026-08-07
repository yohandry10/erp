import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EstadoMiembroConsolidacion {
  PENDIENTE = 'PENDIENTE',
  ACTIVO = 'ACTIVO',
  RECHAZADO = 'RECHAZADO',
}

export enum TipoTasaConsolidacion {
  CIERRE = 'CIERRE',
  PROMEDIO = 'PROMEDIO',
  HISTORICA = 'HISTORICA',
}

export enum TipoAjusteConsolidacion {
  ELIMINACION = 'ELIMINACION',
  RECLASIFICACION = 'RECLASIFICACION',
}

export enum TipoLineaReporte {
  CUENTAS = 'CUENTAS',
  FORMULA = 'FORMULA',
}

export enum NaturalezaLineaReporte {
  SALDO = 'SALDO',
  DEBE = 'DEBE',
  HABER = 'HABER',
}

export enum AlcanceFechaReporte {
  PERIODO = 'PERIODO',
  HASTA_FECHA = 'HASTA_FECHA',
}

export class CrearGrupoConsolidacionDto {
  @ApiProperty({ example: 'GRUPO-ANDINO' })
  @IsString()
  codigo: string;

  @ApiProperty({ example: 'Grupo Andino' })
  @IsString()
  nombre: string;

  @ApiProperty({ example: 'PEN' })
  @Matches(/^[A-Z]{3}$/)
  moneda_presentacion: string;
}

export class InvitarMiembroConsolidacionDto {
  @ApiProperty({ description: 'RUC exacto de la empresa que debe aceptar la invitación' })
  @IsString()
  ruc: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  @Max(100)
  participacion?: number;
}

export class ResponderInvitacionConsolidacionDto {
  @ApiProperty()
  @IsBoolean()
  aceptar: boolean;
}

export class RegistrarTasaConsolidacionDto {
  @ApiProperty()
  @IsUUID()
  tenant_miembro_id: string;

  @ApiProperty()
  @IsDateString()
  fecha: string;

  @ApiProperty({ enum: TipoTasaConsolidacion })
  @IsEnum(TipoTasaConsolidacion)
  tipo: TipoTasaConsolidacion;

  @ApiProperty({ description: 'Unidades de moneda de presentación por unidad de moneda origen' })
  @IsNumber()
  @Min(0.0000000001)
  factor_conversion: number;
}

export class RegistrarMapeoCuentaConsolidacionDto {
  @ApiProperty()
  @IsUUID()
  tenant_miembro_id: string;

  @ApiProperty({ description: 'Código exacto en el plan de la empresa miembro' })
  @IsString()
  cuenta_codigo_origen: string;

  @ApiProperty({ description: 'Código exacto equivalente en el plan de la controladora' })
  @IsString()
  cuenta_codigo_destino: string;
}

export class CrearAjusteConsolidacionDto {
  @ApiProperty()
  @IsDateString()
  fecha: string;

  @ApiProperty({ enum: TipoAjusteConsolidacion })
  @IsEnum(TipoAjusteConsolidacion)
  tipo: TipoAjusteConsolidacion;

  @ApiProperty({ example: '1212' })
  @IsString()
  cuenta_codigo: string;

  @ApiProperty()
  @IsString()
  descripcion: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  debe?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  haber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referencia?: string;
}

export class ComponenteFormulaReporteDto {
  @ApiProperty({ description: 'Código de otra línea del mismo reporte' })
  @IsString()
  codigo: string;

  @ApiProperty({ example: -1 })
  @IsNumber()
  coeficiente: number;
}

export class LineaReporteConfigurableDto {
  @ApiProperty()
  @IsString()
  codigo: string;

  @ApiProperty()
  @IsString()
  nombre: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  orden: number;

  @ApiProperty({ enum: TipoLineaReporte })
  @IsEnum(TipoLineaReporte)
  tipo: TipoLineaReporte;

  @ApiPropertyOptional({ type: [String], example: ['10', '11'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  patrones_cuenta?: string[];

  @ApiPropertyOptional({ enum: NaturalezaLineaReporte })
  @IsOptional()
  @IsEnum(NaturalezaLineaReporte)
  naturaleza?: NaturalezaLineaReporte;

  @ApiPropertyOptional({ enum: AlcanceFechaReporte })
  @IsOptional()
  @IsEnum(AlcanceFechaReporte)
  alcance_fecha?: AlcanceFechaReporte;

  @ApiPropertyOptional({ enum: TipoTasaConsolidacion })
  @IsOptional()
  @IsEnum(TipoTasaConsolidacion)
  tipo_tasa?: TipoTasaConsolidacion;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  signo?: number;

  @ApiPropertyOptional({ type: [ComponenteFormulaReporteDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponenteFormulaReporteDto)
  formula?: ComponenteFormulaReporteDto[];
}

export class GuardarReporteConfigurableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

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

  @ApiProperty({ type: [LineaReporteConfigurableDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaReporteConfigurableDto)
  lineas: LineaReporteConfigurableDto[];
}

export class GenerarReporteConfigurableQueryDto {
  @ApiProperty()
  @IsDateString()
  fecha_desde: string;

  @ApiProperty()
  @IsDateString()
  fecha_hasta: string;

  @ApiPropertyOptional({ description: 'Si se omite, genera el reporte de la empresa actual' })
  @IsOptional()
  @IsUUID()
  grupo_id?: string;
}
