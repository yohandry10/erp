import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsISO8601,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoDocumento {
  FACTURA = '01',
  BOLETA = '03',
  NOTA_CREDITO = '07',
  NOTA_DEBITO = '08'
}

export type EstadoCPE = 'PENDIENTE' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO';

export enum CondicionPago {
  CONTADO = 'CONTADO',
  CREDITO = 'CREDITO',
}

export class ItemFacturaDto {
  @IsOptional()
  @IsUUID()
  pedido_detalle_id?: string;

  @IsOptional()
  @IsUUID()
  producto_id?: string;

  @IsString()
  codigo: string;

  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsString()
  unidad: string;

  @IsNumber()
  @Min(0)
  precio_unitario: number;

  @IsNumber()
  @Min(0)
  valor_venta: number;

  @IsNumber()
  @Min(0)
  igv: number;

  @IsNumber()
  @Min(0)
  precio_venta: number;

  @IsOptional()
  @IsString()
  tipo_afectacion_igv?: string;

  @IsOptional()
  @IsString()
  afectacion_igv?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  impuesto_isc?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuento_unitario?: number;
}

export class CreateFacturaDto {
  @IsString()
  serie: string;

  @IsNumber()
  @Min(1)
  @Max(99999999)
  numero: number;

  @IsEnum(TipoDocumento)
  tipo_documento: TipoDocumento;

  @IsString()
  ruc_emisor: string;

  @IsString()
  razon_social_emisor: string;

  @IsString()
  tipo_documento_receptor: string;

  @IsString()
  documento_receptor: string;

  @IsString()
  razon_social_receptor: string;

  @IsOptional()
  @IsString()
  cliente_id?: string;

  @IsString()
  @IsOptional()
  direccion_receptor?: string;

  /** Snapshot fiscal ARCA. No se infiere a partir de CUIT/CUIL/CDI. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  arca_condicion_iva_receptor?: string;

  /** Condición del emisor congelada al crear el comprobante ARCA. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  arca_condicion_iva_emisor?: string;

  @IsString()
  moneda: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaDto)
  items: ItemFacturaDto[];

  @IsNumber()
  @Min(0)
  total_gravadas: number;

  @IsNumber()
  @Min(0)
  total_igv: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total_isc?: number;

  @IsNumber()
  @Min(0)
  total_venta: number;

  // Costo contable de los bienes vendidos. No forma parte del XML UBL, pero
  // viaja con el comprobante para que el evento factura.emitida registre
  // Dr 69 / Cr 20 y no sobrestime la utilidad ni el inventario contable.
  @IsOptional()
  @IsNumber()
  @Min(0)
  costo_ventas?: number;

  // Bases por tipo de afectación del IGV (SUNAT Catálogo 07). Son opcionales
  // para no romper a los emisores que solo manejan operaciones gravadas, pero
  // sin ellas un comprobante con ítems exonerados se declararía como gravado.
  @IsOptional()
  @IsNumber()
  @Min(0)
  total_exoneradas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total_inafectas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total_exportacion?: number;

  @IsOptional()
  @IsISO8601()
  fecha_emision?: string;

  @IsOptional()
  @IsISO8601()
  fecha_vencimiento?: string;

  @IsOptional()
  @IsEnum(CondicionPago)
  condicion_pago?: CondicionPago;

  /** Código o descripción del medio de pago; DIAN exige el dato en ventas a crédito. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  medio_pago?: string;

  /** Plazo comercial en días. Opcional para conservar los contratos PE/AR existentes. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(36500)
  plazo_pago_dias?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  tipo_cambio?: number;

  @IsOptional()
  @IsUUID()
  pedido_id?: string;

  @IsOptional()
  ajustes?: {
    retencion?: number;
    percepcion?: number;
    detraccion?: number;
    anticipo?: number;
    detraccion_codigo?: string;
  };

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotency_key?: string;
}

export class FacturaDto extends CreateFacturaDto {
  id: string;

  @IsOptional()
  @IsString()
  documento_id?: string;

  @IsOptional()
  @IsString()
  documentoId?: string;
  
  @IsString()
  estado: EstadoCPE;

  @IsString()
  @IsOptional()
  hash?: string;

  @IsString()
  @IsOptional()
  xml_firmado?: string;

  @IsString()
  @IsOptional()
  cdr_sunat?: string;

  @IsString()
  @IsOptional()
  error_message?: string;

  @IsString()
  @IsOptional()
  hash_firma?: string;

  @IsString()
  @IsOptional()
  sunat_status?: string;

  @IsString()
  @IsOptional()
  event_id?: string;

  tenant_id: string;
  created_at: Date;
  updated_at: Date;
} 
