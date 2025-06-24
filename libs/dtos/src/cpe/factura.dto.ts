import { 
  IsString, 
  IsNumber, 
  IsArray, 
  ValidateNested, 
  IsOptional, 
  IsEnum,
  Min,
  Max
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TipoDocumento {
  FACTURA = '01',
  BOLETA = '03',
  NOTA_CREDITO = '07',
  NOTA_DEBITO = '08'
}

export enum EstadoCPE {
  PENDIENTE = 'PENDIENTE',
  ENVIADO = 'ENVIADO',
  ACEPTADO = 'ACEPTADO',
  RECHAZADO = 'RECHAZADO'
}

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
}

export class FacturaDto extends CreateFacturaDto {
  id: string;
  
  @IsEnum(EstadoCPE)
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

  tenant_id: string;
  created_at: Date;
  updated_at: Date;
} 