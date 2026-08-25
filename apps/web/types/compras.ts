// Types for Compras module

export interface Proveedor {
  id: string
  tenant_id: string
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  telefono?: string
  email?: string
  contacto?: string
  condiciones_pago?: 'CONTADO' | 'CREDITO_15' | 'CREDITO_30' | 'CREDITO_45' | 'CREDITO_60' | 'CREDITO_90'
  dias_credito?: number
  limite_credito?: number
  /** Sólo Perú: hasta cuándo rige su constancia de suspensión de cuarta categoría. */
  suspension_retencion_cuarta_hasta?: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface CreateProveedorDto {
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  telefono?: string
  email?: string
  contacto?: string
  condiciones_pago?: 'CONTADO' | 'CREDITO_15' | 'CREDITO_30' | 'CREDITO_45' | 'CREDITO_60' | 'CREDITO_90'
  dias_credito?: number
  limite_credito?: number
  /** Sólo Perú. Cadena vacía para retirarla: la suspensión caduca cada año. */
  suspension_retencion_cuarta_hasta?: string
}

export interface UpdateProveedorDto extends Partial<CreateProveedorDto> {}

export interface ProveedorFilters {
  search?: string
  activo?: boolean
  condiciones_pago?: string
  ruc?: string
  limit?: number
  offset?: number
}

export interface CotizacionCompra {
  id: string
  tenant_id: string
  numero: string
  proveedor_id: string
  fecha_cotizacion: string
  fecha_vencimiento: string
  validez_dias: number
  estado: 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA'
  subtotal: number
  igv: number
  total: number
  observaciones?: string
  motivo_rechazo?: string
  convertida_a_oc?: boolean
  orden_compra_id?: string
  created_at: string
  updated_at: string
  proveedores?: Proveedor
  detalles?: CotizacionCompraDetalle[]
}

export interface CotizacionCompraDetalle {
  id: string
  cotizacion_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  created_at: string
}

export interface CotizacionCompraFilters {
  estado?: string
  proveedor_id?: string
  fecha_desde?: string
  fecha_hasta?: string
  limit?: number
  offset?: number
}
