/**
 * PedidoDetalle Entity
 * Representa el detalle de un pedido de venta (líneas de productos)
 * Requirements: 5.2, 5.3
 */

export interface PedidoDetalle {
  id: string;
  pedido_id: string;
  producto_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  created_at: string;
}
