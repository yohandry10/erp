import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
  ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ConsultaLotesDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) busqueda?: string;
  @IsOptional() @IsUUID("4") almacen_id?: string;
  @IsOptional() @IsUUID("4") lote_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3650) dias?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
}

// La conversión implícita global convertiría "false" en true: se valida el
// valor JSON original.
const raw = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key];

export class PoliticaLoteDto {
  @Transform(raw) @IsBoolean() controla_lote!: boolean;
  @Transform(raw) @IsBoolean() requiere_vencimiento!: boolean;
  @IsInt() @Min(0) @Max(3650) dias_minimos_vida_util!: number;
  /** 0 cuando el producto aún no tiene política. */
  @IsInt() @Min(0) version!: number;
}

export class LineaRegularizacionDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) lote!: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fecha_vencimiento?: string;
  @IsOptional() @IsUUID("4") ubicacion_id?: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(999999999999) cantidad!: number;
}

export class RegularizarLotesDto {
  @IsUUID("4") almacen_id!: string;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineaRegularizacionDto)
  lineas!: LineaRegularizacionDto[];
}

export class LineaReasignacionDto {
  @IsUUID("4") lote_id!: string;
  /** Presente (aunque sea null) fija el saldo exacto lote/ubicación. */
  @IsOptional() @IsUUID("4") ubicacion_id?: string | null;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(999999999999) cantidad!: number;
}

export class ReasignarReservaDto {
  @IsUUID("4") almacen_id!: string;
  @IsUUID("4") referencia_id!: string;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LineaReasignacionDto)
  lineas!: LineaReasignacionDto[];
}
