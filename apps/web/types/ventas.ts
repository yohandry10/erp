/**
 * Types for Ventas Module
 * Based on design document and backend entities
 */

export enum TipoCliente {
  PERSONA = 'PERSONA',
  EMPRESA = 'EMPRESA'
}

export enum TipoDocumento {
  DNI = 'DNI',
  RUC = 'RUC',
  CUIT = 'CUIT',
  NIT = 'NIT',
  CC = 'CC',
  TI = 'TI',
  CE = 'CE',
  PASAPORTE = 'PASAPORTE'
}

export interface Cliente {
  id: string
  tenant_id: string
  tipo: TipoCliente
  documento_tipo: TipoDocumento
  documento_numero: string | null
  numero_documento?: string | number | null
  codigo?: string | null
  ruc?: string | null
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  email?: string
  telefono?: string
  created_at: string
  updated_at: string
  created_by?: string
}

export interface ClienteEstadisticas {
  total_compras: number
  total_cotizaciones: number
  total_pedidos: number
  total_facturas: number
  ultima_compra?: string
}

export interface ClienteDetalle extends Cliente {
  estadisticas?: ClienteEstadisticas
  historial?: TransaccionHistorial[]
}

export interface TransaccionHistorial {
  id: string
  tipo: 'COTIZACION' | 'PEDIDO' | 'FACTURA'
  numero: string
  fecha: string
  total: number
  estado: string
}

export enum EstadoCotizacion {
  BORRADOR = 'BORRADOR',
  ENVIADA = 'ENVIADA',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  CONVERTIDA = 'CONVERTIDA',
  VENCIDA = 'VENCIDA'
}

export interface Cotizacion {
  id: string
  tenant_id: string
  numero: string
  cliente_id: string
  cliente?: Cliente
  fecha: string
  fecha_vencimiento?: string
  estado: EstadoCotizacion
  subtotal: number
  igv: number
  total: number
  notas?: string
  detalle: CotizacionDetalle[]
  created_at: string
  updated_at: string
}

export interface CotizacionDetalle {
  id: string
  cotizacion_id: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

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
  id: string
  tenant_id: string
  numero: string
  cotizacion_id?: string | null
  cliente_id: string
  cliente?: Cliente
  fecha_pedido: string
  estado: EstadoPedido
  subtotal: number
  igv: number
  total: number
  observaciones?: string
  factura_id?: string | null
  gre_id?: string | null
  detalle: PedidoDetalle[]
  created_at: string
  updated_at: string
  requiere_aprobacion?: boolean
  motivo_requiere_aprobacion?: string | null
  estado_credito?: string
  tracking_estado?: string
  tracking_actualizado_en?: string | null
}

export interface PedidoDetalle {
  id: string
  pedido_id: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  cantidad_despachada?: number
  cantidad_facturada?: number
  estado_item?: 'PENDIENTE' | 'PARCIAL' | 'DESPACHADO' | 'FACTURADO'
}
