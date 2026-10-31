import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export const DATASETS = ["contratos", "entregas", "stock", "vencimientos", "cobranza", "penalidades"] as const;
export type Dataset = (typeof DATASETS)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const fecha = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros del tablero; también los usan Excel y la lectura BI. */
export class FiltrosTableroDto {
  @IsOptional() @IsUUID("4") contrato_id?: string;
  @IsOptional() @IsUUID("4") cliente_id?: string;
  @IsOptional() @Matches(fecha) @IsDateString({ strict: true }) desde?: string;
  @IsOptional() @Matches(fecha) @IsDateString({ strict: true }) hasta?: string;
}

export class ConsultaTableroDto extends FiltrosTableroDto {
  /** Ausente: tablero en vivo. */
  @IsOptional() @IsUUID("4") corte_id?: string;
}

export class LecturaBiDto extends FiltrosTableroDto {
  /** "ultimo" (por defecto) o el identificador de un corte. */
  @IsOptional() @Matches(/^(ultimo|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i) corte?: string;
}

export class CredencialBiDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) nombre!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(DATASETS.length) @ArrayUnique() @IsIn(DATASETS, { each: true }) datasets!: Dataset[];
  @Matches(fecha) @IsDateString({ strict: true }) expira_en!: string;
}

export class RevocarCredencialDto {
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}
