/**
 * PedidoVenta Entity
 * Representa un pedido de venta en el sistema
 * Requirements: 5.2, 5.3, 5.4
 */

export enum EstadoPedido {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADO = 'CONFIRMADO',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO_DESPACHO = 'LISTO_DESPACHO',
  LISTO_FACTURAR = 'LISTO_FACTURAR',
  FACTURADO = 'FACTURADO',
  COMPLETADO = 'COMPLETADO',
  COMPLETADO_CON_GRE = 'COMPLETADO_CON_GRE',
  CANCELADO = 'CANCELADO'
}

export interface PedidoVenta {
  id: string;
  tenant_id: string;
  numero: string;
  cotizacion_id?: string;
  cliente_id: string;
  fecha: string;
  estado: EstadoPedido;
  subtotal: number;
  igv: number;
  total: number;
  notas?: string;
  factura_id?: string;
  gre_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}
