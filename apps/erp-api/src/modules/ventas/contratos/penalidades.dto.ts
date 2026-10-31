import { Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ReglaPenalidadDto {
  /** Ausente al crear; con grupo y versión se crea la versión siguiente. */
  @IsOptional() @IsUUID("4") grupo_id?: string;
  @ValidateIf((o: ReglaPenalidadDto) => Boolean(o.grupo_id)) @IsInt() @Min(1) version?: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(160) nombre!: string;
  @IsIn(["MORA_OSCE", "PORCENTAJE_DIARIO", "IMPORTE_DIARIO", "IMPORTE_UNICO"]) metodo!: string;
  @IsIn(["VALOR_ENTREGA", "VALOR_NO_ACEPTADO"]) base_calculo!: string;
  @ValidateIf((o: ReglaPenalidadDto) => o.metodo === "PORCENTAJE_DIARIO")
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) @Max(100) tasa?: number;
  @ValidateIf((o: ReglaPenalidadDto) => o.metodo === "IMPORTE_DIARIO" || o.metodo === "IMPORTE_UNICO")
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999) importe?: number;
  @ValidateIf((o: ReglaPenalidadDto) => o.metodo === "MORA_OSCE")
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(9) factor_f?: number;
  @ValidateIf((o: ReglaPenalidadDto) => o.metodo === "MORA_OSCE") @IsIn(["FIJO", "OC_A_ENTREGA"]) plazo_modo?: string;
  @ValidateIf((o: ReglaPenalidadDto) => o.plazo_modo === "FIJO") @IsInt() @Min(1) @Max(3650) plazo_dias?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) tolerancia_dias?: number;
  @IsOptional() @IsIn(["CALENDARIO", "HABILES"]) calendario?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) tope_porcentaje?: number;
  @ValidateIf((o: ReglaPenalidadDto) => o.tope_porcentaje !== undefined) @IsIn(["CONTRATO", "ENTREGA"]) tope_base?: string;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}

export class AnularReglaPenalidadDto {
  @IsInt() @Min(1) version!: number;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}

export class ExcepcionPenalidadDto {
  @IsUUID("4") entrega_id!: string;
  @IsOptional() @IsUUID("4") grupo_id?: string;
  @IsInt() @Min(1) @Max(3650) dias_excluidos!: number;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) referencia?: string;
}

export class CalcularPenalidadesDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_corte?: string;
}

export class RevisarPenalidadDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(["REVISAR", "APROBAR", "OBSERVAR", "CONTROVERSIA", "DESCARTAR"]) accion!: string;
  @ValidateIf((o: RevisarPenalidadDto) => o.accion === "APROBAR")
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999) monto_aprobado?: number;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(2000) comentario!: string;
}
