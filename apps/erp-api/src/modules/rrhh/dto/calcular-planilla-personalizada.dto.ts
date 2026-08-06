import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class EmpleadoPlanillaPersonalizadaDto {
  @IsUUID()
  empleado_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  dias_trabajados!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  horas_extras_25!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  horas_extras_35!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  tardanzas_minutos!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  faltas!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonos_adicionales?: number;
}

export class CalcularPlanillaPersonalizadaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmpleadoPlanillaPersonalizadaDto)
  empleados!: EmpleadoPlanillaPersonalizadaDto[];
}
