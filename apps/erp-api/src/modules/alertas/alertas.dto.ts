import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

export const TIPOS_ALERTA = [
  "ENTREGA_PROXIMA",
  "ENTREGA_ATRASADA",
  "ENTREGA_INCOMPLETA",
  "LOTE_POR_VENCER",
  "COBRANZA_POR_VENCER",
  "COBRANZA_VENCIDA",
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

// La conversión implícita global convertiría "false" en true.
const raw = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key];

export class ConsultaAlertasDto {
  @IsOptional() @IsIn(["ABIERTA", "RESUELTA", "TODAS"]) estado?: "ABIERTA" | "RESUELTA" | "TODAS";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
}

export class ReglaAlertaDto {
  @Transform(raw) @IsBoolean() activa!: boolean;
  @IsInt() @Min(0) @Max(365) dias_anticipacion!: number;
  /** null sin escalamiento; con escalar_a exige días. */
  @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(90) dias_escalamiento!: number | null;
  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID("4", { each: true }) destinatarios!: string[];
  @IsArray() @ArrayMaxSize(50) @ArrayUnique() @IsUUID("4", { each: true }) escalar_a!: string[];
  @Transform(raw) @IsBoolean() incluir_responsable!: boolean;
  @Transform(raw) @IsBoolean() enviar_correo!: boolean;
  /** 0 cuando el tipo aún no tiene regla. */
  @IsInt() @Min(0) version!: number;
}
