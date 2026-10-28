import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class LineaRecepcionDto {
  @IsUUID("4") despacho_id!: string;
  /** Lote despachado; se omite para productos sin control de lote. */
  @IsOptional() @IsUUID("4") lote_id?: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(999999999999) cantidad_recibida!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(999999999999) cantidad_aceptada!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(999999999999) cantidad_rechazada!: number;
  @ValidateIf((o: LineaRecepcionDto) => o.cantidad_rechazada > 0 || o.motivo_rechazo !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  motivo_rechazo?: string;
}

export class RegistrarRecepcionDto {
  @IsUUID("4") pedido_id!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) fecha_recepcion!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(160) receptor_nombre!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) receptor_documento?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) receptor_cargo?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) guia_referencia?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) pecosa_numero?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) conformidad_numero?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) incidencias?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineaRecepcionDto)
  lineas!: LineaRecepcionDto[];
}

export class BaseFacturacionDto {
  @IsIn(["DESPACHO", "CONFORMIDAD"]) base_facturacion!: "DESPACHO" | "CONFORMIDAD";
  @IsInt() @Min(1) version!: number;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}

export class AnularRecepcionDto {
  @IsInt() @Min(1) version!: number;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}
