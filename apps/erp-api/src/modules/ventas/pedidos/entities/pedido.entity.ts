/**
 * PedidoVenta Entity
 * Representa un pedido de venta en el sistema
 * Requirements: 5.2, 5.3, 5.4
 */

export enum EstadoPedido {
  PENDIENTE = 'PENDIENTE',
  PENDIENTE_APROBACION = 'PENDIENTE_APROBACION',
  CONFIRMADO = 'CONFIRMADO',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO_DESPACHO = 'LISTO_DESPACHO',
  DESPACHO_PARCIAL = 'DESPACHO_PARCIAL',
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
  fecha_pedido: string;
  estado: EstadoPedido;
  subtotal: number;
  igv: number;
  total: number;
  observaciones?: string;
  factura_id?: string;
  gre_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  requiere_aprobacion?: boolean;
  motivo_requiere_aprobacion?: string | null;
  aprobado_por?: string | null;
  aprobado_en?: string | null;
  estado_credito?: string;
  tracking_estado?: string;
  tracking_actualizado_en?: string | null;
  tracking_notas?: string | null;
  metadata?: Record<string, unknown>;
}
