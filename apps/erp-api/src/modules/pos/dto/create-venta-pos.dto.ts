import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  Min,
  IsObject,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

// Snapshot opcional del producto que envía el POS UI (offline/print de ticket).
// El backend re-valida y re-calcula contra la BD usando producto_id, así que
// estos campos son informativos: se aceptan para no romper el contrato del
// front pero no se confía en ellos.
export class VentaPosItemProductoSnapshotDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  unidad_medida_sunat?: string;
}

export class VentaPosItemDto {
  @IsString({ message: 'producto_id debe ser string' })
  producto_id: string;

  @IsNumber({}, { message: 'cantidad debe ser un número' })
  @Min(0.001, { message: 'cantidad debe ser mayor a 0' })
  cantidad: number;

  @IsNumber({}, { message: 'precio_unitario debe ser un número' })
  @Min(0, { message: 'precio_unitario no puede ser negativo' })
  precio_unitario: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precio_original?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuento_porcentaje?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuento_monto?: number;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  // Snapshot del producto desde el front (POS imprime ticket sin re-fetchear).
  // El backend NO depende de estos campos para calcular impuestos/stock; usa
  // producto_id. Aceptarlo evita HTTP 400 por forbidNonWhitelisted.
  @IsOptional()
  @ValidateNested()
  @Type(() => VentaPosItemProductoSnapshotDto)
  producto?: VentaPosItemProductoSnapshotDto;
}

export class VentaPosPagoDto {
  @IsString({ message: 'metodo_pago_id debe ser string' })
  metodo_pago_id: string;

  @IsNumber({}, { message: 'monto debe ser un número' })
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referencia?: string;
}

export class VentaPosComprobanteDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  serie?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  correlativo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  tipo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numero?: string;

  // Compatibilidad de despliegue progresivo con la imagen Web anterior.
  // Son snapshots informativos: PosService recalcula precios, impuestos y
  // stock desde la BD y sólo usa serie/correlativo/tipo/numero del comprobante.
  @IsOptional()
  @IsString()
  fecha?: string;

  @IsOptional()
  @IsObject()
  cliente?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  items?: unknown[];

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  descuentos?: number;

  @IsOptional()
  @IsNumber()
  impuestos?: number;

  @IsOptional()
  @IsNumber()
  total?: number;

  @IsOptional()
  @IsObject()
  metodoPago?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  estado?: string;
}

export class VentaPosDescuentoGlobalDto {
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descripcion?: string;
}

export class CreateVentaPosDto {
  @IsString({ message: 'idempotency_key es obligatorio' })
  @MaxLength(200, { message: 'idempotency_key demasiado largo' })
  idempotency_key: string;

  @IsString({ message: 'cliente_documento es obligatorio' })
  @MaxLength(20, { message: 'cliente_documento demasiado largo' })
  cliente_documento: string;

  @IsString({ message: 'cliente_nombre es obligatorio' })
  @MaxLength(300, { message: 'cliente_nombre demasiado largo' })
  cliente_nombre: string;

  @IsArray({ message: 'items debe ser un array' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item' })
  @ArrayMaxSize(999, { message: 'Máximo 999 items por venta (límite SUNAT)' })
  @ValidateNested({ each: true })
  @Type(() => VentaPosItemDto)
  items: VentaPosItemDto[];

  @IsOptional()
  @IsString()
  sesion_caja_id?: string;

  @IsOptional()
  @IsString()
  cliente_id?: string;

  @IsOptional()
  @IsString()
  cliente_tipo_documento?: string;

  /** Condición IVA ARCA (RG 5616); obligatoria al emitir para Argentina. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cliente_condicion_iva?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cliente_direccion?: string;

  @IsOptional()
  @IsString()
  metodo_pago_id?: string;

  /** Plazo fiscal DIAN para ventas a crédito; si se omite usa la empresa. */
  @IsOptional()
  @IsInt()
  @Min(1)
  plazo_pago_dias?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referencia_pago?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numero_comprobante?: string;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  descuentos?: number;

  @IsOptional()
  @IsNumber()
  impuestos?: number;

  @IsOptional()
  @IsNumber()
  total?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  moneda?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VentaPosComprobanteDto)
  comprobante?: VentaPosComprobanteDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => VentaPosDescuentoGlobalDto)
  descuento_global?: VentaPosDescuentoGlobalDto;

  /**
   * Aceptado y descartado. El interruptor "Venta rápida" del POS no cambiaba
   * nada: ni la pantalla, ni el servicio, ni el writer lo leían. Se retiró de la
   * interfaz, pero el campo se mantiene declarado porque los binarios de
   * escritorio ya distribuidos lo siguen enviando y `forbidNonWhitelisted`
   * convertiría esa venta en un 400.
   */
  @IsOptional()
  @IsBoolean()
  modo_venta_rapida?: boolean;

  @IsOptional()
  @IsBoolean()
  permite_venta_sin_stock?: boolean;

  @IsOptional()
  @IsBoolean()
  emitir_cpe?: boolean;

  /** Solicita el cobro físico redondeado; SQL vuelve a derivarlo y validarlo. */
  @IsOptional()
  @IsBoolean()
  redondeo_efectivo_legal?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentaPosPagoDto)
  pagos?: VentaPosPagoDto[];
}
