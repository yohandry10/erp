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
  CE = 'CE',
  PASAPORTE = 'PASAPORTE'
}

export interface Cliente {
  id: string
  tenant_id: string
  tipo: TipoCliente
  documento_tipo: TipoDocumento
  documento_numero: string
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
  id: string
  tenant_id: string
  numero: string
  cotizacion_id?: string
  cliente_id: string
  cliente?: Cliente
  fecha: string
  estado: EstadoPedido
  subtotal: number
  igv: number
  total: number
  notas?: string
  factura_id?: string
  gre_id?: string
  detalle: PedidoDetalle[]
  created_at: string
  updated_at: string
}

export interface PedidoDetalle {
  id: string
  pedido_id: string
  producto_id: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}
