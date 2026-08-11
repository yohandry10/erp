import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum TipoDocumentoManual {
  FACTURA = 'FACTURA',
  BOLETA = 'BOLETA',
  CONTRATO = 'CONTRATO',
}

export enum CondicionPagoDocumento {
  CONTADO = 'CONTADO',
  CREDITO = 'CREDITO',
}

export class DocumentoDetalleManualDto {
  @IsOptional()
  @IsUUID()
  producto_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigo_producto?: string;

  @IsString()
  @Length(1, 500)
  descripcion: string;

  @IsString()
  @Matches(/^[A-Z0-9]{2,5}$/)
  unidad_medida: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(999999999)
  cantidad: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999999)
  precio_unitario: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(999999999)
  descuento_unitario?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{2}$/)
  afectacion_igv?: string;
}

export class CrearDocumentoManualDto {
  @IsEnum(TipoDocumentoManual)
  tipo_documento: TipoDocumentoManual;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  serie?: string;

  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsString()
  @Length(1, 20)
  receptor_tipo_doc: string;

  @IsString()
  @Length(1, 30)
  receptor_numero_doc: string;

  @IsString()
  @Length(1, 250)
  receptor_razon_social: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receptor_direccion?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  receptor_email?: string;

  @IsISO8601({ strict: true })
  fecha_emision: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  fecha_vencimiento?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  moneda: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  tipo_cambio?: number;

  @IsOptional()
  @IsEnum(CondicionPagoDocumento)
  condicion_pago?: CondicionPagoDocumento;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(999)
  @ValidateNested({ each: true })
  @Type(() => DocumentoDetalleManualDto)
  detalles: DocumentoDetalleManualDto[];

  @IsString()
  @Length(8, 255)
  idempotency_key: string;
}

/**
 * Un borrador se reemplaza completo. Así el servidor vuelve a calcular todas
 * las líneas y no mezcla una cabecera nueva con detalles antiguos.
 */
export class ActualizarDocumentoManualDto extends CrearDocumentoManualDto {}

export class GenerarXmlDocumentoDto {
  @IsString()
  @Length(8, 255)
  idempotency_key: string;
}

export class AnularDocumentoDto {
  @IsString()
  @Length(3, 500)
  motivo: string;

  @IsString()
  @Length(8, 255)
  idempotency_key: string;
}

export class CrearSerieDocumentoDto {
  @IsEnum(TipoDocumentoManual)
  tipo_documento: TipoDocumentoManual;

  @IsString()
  @Length(1, 10)
  serie: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(1)
  @Max(99999999)
  correlativo_maximo?: number;

  @IsString()
  @Length(8, 255)
  idempotency_key: string;
}

export class ValidarRucDto {
  @IsString()
  @Length(8, 20)
  ruc: string;
}

export class DocumentoFiltrosDto {
  @IsOptional()
  @IsEnum(TipoDocumentoManual)
  tipo_documento?: TipoDocumentoManual;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  estado?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  fecha_desde?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  fecha_hasta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  receptor_numero_doc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  serie?: string;
}
