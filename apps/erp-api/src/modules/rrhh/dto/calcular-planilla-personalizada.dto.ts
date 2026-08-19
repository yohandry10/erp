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

  /**
   * Recargo nocturno y trabajo en dominical o festivo (Colombia).
   *
   * La pantalla de cálculo los capturaba y los sumaba al neto que mostraba, pero
   * el DTO no los declaraba: con `forbidNonWhitelisted` activo, enviarlos habría
   * devuelto 400, así que el navegador los descartaba antes de salir. El motor
   * colombiano los liquidaba entonces en cero y el trabajador cobraba de menos un
   * recargo que sí había trabajado.
   *
   * Son opcionales porque sólo aplican al régimen colombiano.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  horas_recargo_nocturno?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  horas_dominicales_festivas?: number;
}

export class CalcularPlanillaPersonalizadaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmpleadoPlanillaPersonalizadaDto)
  empleados!: EmpleadoPlanillaPersonalizadaDto[];
}
