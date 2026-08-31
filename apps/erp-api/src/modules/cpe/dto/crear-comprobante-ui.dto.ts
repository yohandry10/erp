import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Body de `POST /api/cpe/comprobantes`, la emisión desde pantalla.
 *
 * El DTO es ancho a propósito: `createFromComprobantePayload` acepta cada campo
 * bajo dos o tres alias (`tipo_documento` / `tipoComprobante` /
 * `tipo_comprobante`, `documento_receptor` / `clienteRuc` / `clienteDocumento`,
 * y así), y el normalizador de ítems hace lo mismo. Declarar sólo un alias
 * rompería a los clientes que usan los otros, porque el `ValidationPipe` global
 * corre con `forbidNonWhitelisted`.
 *
 * `tipoOperacion` y `observaciones` se aceptan y se descartan: el formulario los
 * envía siempre y el servicio no los lee. Igual `unidadMedida` y `descuento` en
 * cada ítem. Omitirlos dejaría la emisión en 400.
 *
 * Nada de esto valida reglas fiscales: eso es trabajo del servicio y de SUNAT.
 * Aquí sólo se comprueba forma y tipo.
 */
export class ComprobanteItemUiDto {
  @IsOptional() @IsString() @MaxLength(60) codigo?: string;
  @IsOptional() @IsString() @MaxLength(60) codigo_producto?: string;

  @IsString()
  @MaxLength(500)
  descripcion!: string;

  @IsNumber()
  @Min(0)
  cantidad!: number;

  @IsOptional() @IsString() @MaxLength(10) unidadMedida?: string;

  @IsOptional() @IsNumber() @Min(0) valorUnitario?: number;
  @IsOptional() @IsNumber() @Min(0) valor_unitario?: number;
  @IsOptional() @IsNumber() @Min(0) precioUnitario?: number;
  @IsOptional() @IsNumber() @Min(0) precio_unitario?: number;
  @IsOptional() @IsNumber() @Min(0) precio_venta?: number;
  @IsOptional() @IsNumber() @Min(0) valorVenta?: number;
  @IsOptional() @IsNumber() @Min(0) valor_venta?: number;

  @IsOptional() @IsNumber() @Min(0) descuento?: number;
  @IsOptional() @IsNumber() @Min(0) igv?: number;
  @IsOptional() @IsNumber() @Min(0) impuesto_igv?: number;
  @IsOptional() @IsNumber() @Min(0) total_impuestos?: number;
  @IsOptional() @IsNumber() @Min(0) total?: number;

  // Impuesto Nacional al Consumo. El normalizador fiscal soporta el nombre
  // histórico SUNAT (`isc`), el nombre DIAN (`inc`) y sus alias snake/camel.
  @IsOptional() @IsNumber() @Min(0) impuesto_isc?: number;
  @IsOptional() @IsNumber() @Min(0) impuesto_inc?: number;
  @IsOptional() @IsNumber() @Min(0) impuestoInc?: number;
  @IsOptional() @IsNumber() @Min(0) inc?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tasa_isc?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tasa_inc?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) tasaInc?: number;

  // Afectación tributaria por línea. No puede reconstruirse a partir del IGV
  // ni de los totales del documento: una línea exenta y una excluida tienen
  // impuesto cero, pero se declaran de forma distinta ante DIAN.
  @IsOptional() @IsIn(['10', '20', '30', '40']) afectacion_igv?: string;
  @IsOptional() @IsIn(['10', '20', '30', '40']) tipo_afectacion_igv?: string;
  @IsOptional() @IsIn(['10', '20', '30', '40']) afectacionIgv?: string;
  @IsOptional() @IsIn(['10', '20', '30', '40']) tipoAfectacionIgv?: string;
}

export class CrearComprobanteUiDto {
  // Tipo y numeración: tres alias históricos del mismo dato.
  @IsOptional() @IsString() @MaxLength(10) tipo_documento?: string;
  @IsOptional() @IsString() @MaxLength(10) tipoComprobante?: string;
  @IsOptional() @IsString() @MaxLength(10) tipo_comprobante?: string;
  @IsOptional() @IsString() @MaxLength(10) serie?: string;
  @IsOptional() @IsNumber() @Min(1) numero?: number;
  @IsOptional() @IsNumber() @Min(1) correlativo?: number;

  // Receptor
  @IsOptional()
  @IsUUID()
  cliente_id?: string;
  @IsOptional() @IsString() @MaxLength(20) documento_receptor?: string;
  @IsOptional() @IsString() @MaxLength(20) clienteRuc?: string;
  @IsOptional() @IsString() @MaxLength(20) clienteDocumento?: string;
  @IsOptional() @IsString() @MaxLength(10) tipo_documento_receptor?: string;
  @IsOptional() @IsString() @MaxLength(10) clienteTipoDocumento?: string;
  @IsOptional() @IsString() @MaxLength(300) razon_social_receptor?: string;
  @IsOptional() @IsString() @MaxLength(300) clienteRazonSocial?: string;
  @IsOptional() @IsString() @MaxLength(300) clienteNombre?: string;
  @IsOptional() @IsString() @MaxLength(500) direccion_receptor?: string;
  @IsOptional() @IsString() @MaxLength(500) clienteDireccion?: string;

  @IsOptional() @IsString() @MaxLength(10) moneda?: string;

  @IsOptional() @IsIn(['CONTADO', 'CREDITO']) condicion_pago?: 'CONTADO' | 'CREDITO';
  @IsOptional() @IsIn(['CONTADO', 'CREDITO']) condicionPago?: 'CONTADO' | 'CREDITO';
  @IsOptional() @IsString() @MaxLength(3) medio_pago?: string;
  @IsOptional() @IsString() @MaxLength(3) medioPago?: string;
  @IsOptional() @IsInt() @Min(0) plazo_pago_dias?: number;
  @IsOptional() @IsInt() @Min(0) plazoPagoDias?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ComprobanteItemUiDto)
  items!: ComprobanteItemUiDto[];

  // Totales: si no llegan, el servicio los deriva de los ítems.
  @IsOptional() @IsNumber() total_gravadas?: number;
  @IsOptional() @IsNumber() subtotal?: number;
  @IsOptional() @IsNumber() total_exoneradas?: number;
  @IsOptional() @IsNumber() totalExoneradas?: number;
  @IsOptional() @IsNumber() total_inafectas?: number;
  @IsOptional() @IsNumber() totalInafectas?: number;
  @IsOptional() @IsNumber() total_exportacion?: number;
  @IsOptional() @IsNumber() totalExportacion?: number;
  @IsOptional() @IsNumber() total_igv?: number;
  @IsOptional() @IsNumber() totalIgv?: number;
  @IsOptional() @IsNumber() total_venta?: number;
  @IsOptional() @IsNumber() total?: number;

  @IsOptional() @IsString() @MaxLength(30) fecha_emision?: string;
  @IsOptional() @IsString() @MaxLength(30) fechaEmision?: string;
  @IsOptional() @IsString() @MaxLength(30) fecha_vencimiento?: string;
  @IsOptional() @IsString() @MaxLength(30) fechaVencimiento?: string;

  // Se dejan las propiedades en una línea propia: además de ValidationPipe,
  // el verificador estático Web→DTO las extrae del contrato y debe poder
  // demostrar que el payload real no será rechazado por whitelist.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotency_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  /** Aceptados y descartados: el formulario los envía y el servicio no los lee. */
  @IsOptional() @IsString() @MaxLength(10) tipoOperacion?: string;
  @IsOptional() @IsString() @MaxLength(1000) observaciones?: string;
}
