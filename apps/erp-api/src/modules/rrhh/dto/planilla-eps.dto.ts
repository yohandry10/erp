import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { RemuneracionGratificacionPreviaDto } from './rrhh-acciones.dto';

export class RemuneracionGratificacionPlanillaEmpleadoDto extends RemuneracionGratificacionPreviaDto {
  @IsUUID('4') empleado_id!: string;
}

export class CoberturaEpsPlanillaDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) periodo_cobertura!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999) monto_pagado!: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_pago!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) referencia!: string;
  @IsBoolean() pago_oportuno!: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999) credito_arrastre_declarado?: number;
  @IsOptional() @IsString() @MaxLength(500) referencia_arrastre?: string;
  @IsOptional() @IsUUID('4') planilla_arrastre_id?: string;
  // En pago extemporáneo de cobertura previa la base histórica se declara;
  // la UIT aplicable se obtiene de la normativa del período de origen.
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999) aporte_essalud_origen?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) trabajadores_cubiertos_origen?: number;
}

export class CalcularPlanillaMensualDto {
  @IsOptional() @ValidateNested() @Type(() => CoberturaEpsPlanillaDto)
  eps_cobertura?: CoberturaEpsPlanillaDto;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true })
  @Type(() => RemuneracionGratificacionPlanillaEmpleadoDto)
  remuneraciones_gratificacion_previas?: RemuneracionGratificacionPlanillaEmpleadoDto[];
}
