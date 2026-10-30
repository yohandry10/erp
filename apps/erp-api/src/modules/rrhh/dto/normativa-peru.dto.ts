import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Versión explícita propia del contribuyente. No modifica las filas globales. */
export class NormativaPeruPeriodoDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) periodo!: string;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0.01) @Max(999999999999.99) uit!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0.01) @Max(999999999999.99) rmv!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0) @Max(999999999999.99) asignacion_familiar!: number;
  @IsNumber({maxDecimalPlaces: 6}) @Min(0) @Max(1) afp_aporte!: number;
  @IsNumber({maxDecimalPlaces: 6}) @Min(0) @Max(1) afp_prima_seguro!: number;
  @IsOptional() @IsNumber({maxDecimalPlaces: 2}) @Min(0.01) @Max(999999999999.99) afp_remuneracion_max_asegurable?: number;
  @IsNumber({maxDecimalPlaces: 6}) @Min(0) @Max(1) afp_comision_flujo_default!: number;
  @IsNumber({maxDecimalPlaces: 6}) @Min(0) @Max(1) onp_aporte!: number;
  @IsNumber({maxDecimalPlaces: 6}) @Min(0) @Max(1) essalud_aporte!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0.01) @Max(100) quinta_deduccion_uit!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0.01) @Max(999999999999.99) bancarizacion_pen_min!: number;
  @IsNumber({maxDecimalPlaces: 2}) @Min(0.01) @Max(999999999999.99) bancarizacion_usd_min!: number;
  @IsNumber({maxDecimalPlaces: 6}) @Min(0) @Max(1) igv_tasa!: number;
  @IsString() @MinLength(3) @MaxLength(1000) referencia!: string;
}
