import {
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsEnum,
  Min,
  Max,
  MaxLength,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoDocumento {
  FACTURA = '01',
  BOLETA = '03',
  NOTA_CREDITO = '07',
  NOTA_DEBITO = '08'
}

export type EstadoCPE = 'PENDIENTE' | 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO';

export class ItemFacturaDto {
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

  @IsNumber()
  @Min(0)
  total_venta: number;

  @IsOptional()
  @IsISO8601()
  fecha_emision?: string;

  @IsOptional()
  @IsISO8601()
  fecha_vencimiento?: string;

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
