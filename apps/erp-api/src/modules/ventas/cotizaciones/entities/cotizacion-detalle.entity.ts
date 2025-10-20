/**
 * CotizacionDetalle Entity
 * Representa el detalle de una cotización (líneas de productos)
 * Requirements: 3.2, 3.3
 */

export interface CotizacionDetalle {
  id: string;
  cotizacion_id: string;
  producto_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
}
