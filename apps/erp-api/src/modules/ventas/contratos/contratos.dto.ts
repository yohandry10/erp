import { Type, Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
  ValidateNested,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ConsultaContratosDto {
  @IsOptional() @IsString() @MaxLength(120) busqueda?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
}
export class LineaContratoDto {
  @IsUUID("4") producto_id!: string;
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(99999999999999)
  cantidad!: number;
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999999999)
  precio_unitario!: number;
}
export class CrearContratoDto {
  @IsUUID("4") cliente_id!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) numero!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(200) asunto!: string;
  @IsIn(["PEN", "USD", "EUR", "COP", "ARS"]) moneda!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  vigencia_desde!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  vigencia_hasta!: string;
  @IsUUID("4") responsable_id!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineaContratoDto)
  lineas!: LineaContratoDto[];
}
export class EditarContratoDto extends CrearContratoDto {
  @IsInt() @Min(1) version!: number;
}
export class VersionContratoDto {
  @IsInt() @Min(1) version!: number;
}
export class AnularContratoDto extends VersionContratoDto {
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}
export class LineaOrdenClienteDto {
  @IsUUID("4") contrato_linea_id!: string;
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(99999999999999)
  cantidad!: number;
}
export class CrearOrdenClienteDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) numero!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fecha_emision!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((line: LineaOrdenClienteDto) => line.contrato_linea_id)
  @ValidateNested({ each: true })
  @Type(() => LineaOrdenClienteDto)
  lineas!: LineaOrdenClienteDto[];
}
export class ProgramarEntregaDto {
  @IsUUID("4") orden_linea_id!: string;
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(99999999999999)
  cantidad!: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fecha_programada!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) destino!: string;
}
export class ReprogramarEntregaDto extends AnularContratoDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fecha_programada!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) destino!: string;
}

export class RevisionSuministroDto extends AnularContratoDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) referencia!: string;
}
export class LineaAdendaDto extends LineaContratoDto {
  @IsOptional() @IsUUID("4") id?: string;
}
export class AdendarContratoDto extends RevisionSuministroDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(200) asunto!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  vigencia_hasta!: string;
  @IsUUID("4") responsable_id!: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  observaciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineaAdendaDto)
  lineas!: LineaAdendaDto[];
}
export class ModificarOrdenClienteDto extends CrearOrdenClienteDto {
  @IsInt() @Min(1) version!: number;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) referencia!: string;
}
export class MotivoSuministroDto {
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(1000) motivo!: string;
}
export class VinculoLineaDto {
  @IsUUID("4") pedido_detalle_id!: string;
  @IsUUID("4") entrega_id!: string;
}
export class VincularPedidoDto extends MotivoSuministroDto {
  @Matches(/^[a-f0-9]{64}$/) fingerprint!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((line: VinculoLineaDto) => line.pedido_detalle_id)
  @ValidateNested({ each: true })
  @Type(() => VinculoLineaDto)
  lineas!: VinculoLineaDto[];
}
export class AdjuntarDocumentoDto {
  @IsIn(["CONTRATO", "OC", "ADENDA", "RECEPCION"]) recurso_tipo!: string;
  @IsUUID("4") recurso_id!: string;
}
