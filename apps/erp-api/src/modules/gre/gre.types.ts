import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GreItemDto {
  @IsOptional()
  @IsUUID()
  productoId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  descripcion!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad!: number;

  @IsOptional()
  @IsString()
  @Length(2, 3)
  unidadMedida?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  peso?: number;
}

export class CreateGuiaRemisionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  destinatario!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  direccionDestino!: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  ubigeoDestino?: string;

  @IsDateString()
  fechaTraslado!: string;

  @IsIn(['TRANSPORTE_PUBLICO', 'TRANSPORTE_PRIVADO'])
  modalidad!: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO';

  @IsIn([
    'VENTA',
    'COMPRA',
    'TRASLADO_ENTRE_ESTABLECIMIENTOS',
    'CONSIGNACION',
    'DEVOLUCION',
    'TRANSFORMACION',
    'DEMOSTRACION',
    'OTROS',
  ])
  motivo!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  pesoTotal!: number;

  @IsOptional() @IsString() @MaxLength(1000)
  observaciones?: string;

  @IsOptional() @IsString() @MaxLength(250)
  transportista?: string;

  @IsOptional() @IsString() @MaxLength(20)
  transportistaDocumento?: string;

  @IsOptional() @IsString() @MaxLength(20)
  placaVehiculo?: string;

  @IsOptional() @IsString() @MaxLength(30)
  licenciaConducir?: string;

  @IsOptional() @IsString() @MaxLength(2)
  conductorDocumentoTipo?: string;

  @IsOptional() @IsString() @MaxLength(20)
  conductorDocumentoNumero?: string;

  @IsOptional() @IsString() @MaxLength(120)
  conductorNombres?: string;

  @IsOptional() @IsString() @MaxLength(120)
  conductorApellidos?: string;

  @IsOptional() @IsUUID()
  cpeRelacionado?: string;

  @IsOptional() @IsUUID()
  pedidoId?: string;

  @IsOptional() @IsString() @MaxLength(80)
  pedidoNumero?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  despachosAsociados?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  @IsOptional()
  @IsObject()
  datosAdicionales?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GreItemDto)
  items?: GreItemDto[];
}

export class GreListQueryDto {
  @IsOptional() @IsIn(['BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR'])
  estado?: string;

  @IsOptional() @IsIn(['TRANSPORTE_PUBLICO', 'TRANSPORTE_PRIVADO'])
  modalidad?: 'TRANSPORTE_PUBLICO' | 'TRANSPORTE_PRIVADO';

  @IsOptional() @IsString() @MaxLength(120)
  buscar?: string;

  @IsOptional() @IsDateString()
  desde?: string;

  @IsOptional() @IsDateString()
  hasta?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

export class GreCancelDto {
  @IsString()
  @Length(5, 500)
  motivo!: string;
}

export class GreAutoConfigDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999_999_999)
  umbralGREAutomatico?: number;

  @IsOptional() @IsBoolean()
  greAutomaticoHabilitado?: boolean;

  @IsOptional() @IsBoolean()
  greObligatorio?: boolean;
}

export interface GuiaRemisionResponseDto {
  id: string;
  numero: string;
  estado: string;
  destinatario: string;
  direccionDestino: string;
  ubigeoDestino?: string;
  fechaTraslado: string;
  fechaCreacion: string;
  modalidad: string;
  motivo: string;
  pesoTotal: number;
  observaciones?: string;
  transportista?: string;
  transportistaDocumento?: string;
  placaVehiculo?: string;
  licenciaConducir?: string;
  conductorDocumentoTipo?: string;
  conductorDocumentoNumero?: string;
  conductorNombres?: string;
  conductorApellidos?: string;
  cpeRelacionado?: string;
  numeroSunat?: string;
  hashGre?: string;
  sunatStatus?: string;
  idempotencyKey?: string;
  eventId?: string;
  errorMessage?: string;
  signedAt?: string;
  lastSentAt?: string;
  lastConsultedAt?: string;
  motivoAnulacion?: string;
  items?: GreItemDto[];
}
