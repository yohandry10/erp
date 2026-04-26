/**
 * Zod Validation Schemas for Ventas Module
 * Requirements: 15.1, 15.2, 19.1, 19.2
 */

import { z } from 'zod'
import { TipoCliente, TipoDocumento } from '@/types/ventas'

// ============================================================================
// Cliente Validation Schemas
// ============================================================================

export const clienteSchema = z.object({
  tipo: z.nativeEnum(TipoCliente, {
    errorMap: () => ({ message: 'Tipo de cliente inválido' })
  }),
  documento_tipo: z.nativeEnum(TipoDocumento, {
    errorMap: () => ({ message: 'Tipo de documento inválido' })
  }),
  documento_numero: z.string()
    .min(1, 'El número de documento es requerido')
    .refine((val) => {
      // Validar según tipo de documento
      return val.length >= 8 && val.length <= 20
    }, 'El número de documento debe tener entre 8 y 20 caracteres'),
  razon_social: z.string()
    .min(3, 'La razón social debe tener al menos 3 caracteres')
    .max(255, 'La razón social no puede exceder 255 caracteres'),
  nombre_comercial: z.string()
    .max(255, 'El nombre comercial no puede exceder 255 caracteres')
    .optional(),
  direccion: z.string().optional(),
  email: z.string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  telefono: z.string()
    .max(20, 'El teléfono no puede exceder 20 caracteres')
    .optional()
}).refine((data) => {
  // Validación específica para RUC: debe tener exactamente 11 dígitos
  if (data.documento_tipo === TipoDocumento.RUC) {
    return /^\d{11}$/.test(data.documento_numero)
  }
  // Validación específica para DNI: debe tener exactamente 8 dígitos
  if (data.documento_tipo === TipoDocumento.DNI) {
    return /^\d{8}$/.test(data.documento_numero)
  }
  return true
}, {
  message: 'RUC debe tener 11 dígitos y DNI debe tener 8 dígitos',
  path: ['documento_numero']
})

export type ClienteFormData = z.infer<typeof clienteSchema>

// Schema para creación rápida de cliente (campos mínimos)
export const clienteQuickCreateSchema = z.object({
  tipo: z.nativeEnum(TipoCliente),
  documento_tipo: z.nativeEnum(TipoDocumento),
  documento_numero: z.string().min(1, 'El número de documento es requerido'),
  razon_social: z.string().min(3, 'El nombre es requerido')
}).refine((data) => {
  if (data.documento_tipo === TipoDocumento.RUC) {
    return /^\d{11}$/.test(data.documento_numero)
  }
  if (data.documento_tipo === TipoDocumento.DNI) {
    return /^\d{8}$/.test(data.documento_numero)
  }
  return true
}, {
  message: 'RUC debe tener 11 dígitos y DNI debe tener 8 dígitos',
  path: ['documento_numero']
})

export type ClienteQuickCreateFormData = z.infer<typeof clienteQuickCreateSchema>

// ============================================================================
// Cotización/Pedido Detalle Validation Schema
// ============================================================================

export const detalleItemSchema = z.object({
  producto_id: z.string().uuid('ID de producto inválido'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  cantidad: z.number()
    .positive('La cantidad debe ser mayor a 0')
    .min(0.01, 'La cantidad debe ser mayor a 0'),
  precio_unitario: z.number()
    .nonnegative('El precio no puede ser negativo')
    .min(0, 'El precio debe ser mayor o igual a 0'),
  subtotal: z.number().nonnegative()
})

export type DetalleItemFormData = z.infer<typeof detalleItemSchema>

// ============================================================================
// Cotización Validation Schema
// ============================================================================

export const cotizacionSchema = z.object({
  cliente_id: z.string().uuid('Debe seleccionar un cliente'),
  fecha: z.string().or(z.date()),
  fecha_vencimiento: z.string().or(z.date()).optional(),
  notas: z.string().optional(),
  detalle: z.array(detalleItemSchema)
    .min(1, 'Debe agregar al menos un producto')
    .max(999, 'No puede superar 999 ítems por documento')
}).refine((data) => {
  // Validar que la fecha de vencimiento sea posterior a la fecha
  if (data.fecha_vencimiento) {
    const fecha = new Date(data.fecha)
    const vencimiento = new Date(data.fecha_vencimiento)
    return vencimiento >= fecha
  }
  return true
}, {
  message: 'La fecha de vencimiento debe ser posterior a la fecha de cotización',
  path: ['fecha_vencimiento']
})

export type CotizacionFormData = z.infer<typeof cotizacionSchema>

// ============================================================================
// Pedido Validation Schema
// ============================================================================

export const pedidoSchema = z.object({
  cliente_id: z.string().uuid('Debe seleccionar un cliente'),
  cotizacion_id: z.string().uuid().optional(),
  fecha: z.string().or(z.date()),
  notas: z.string().optional(),
  detalle: z.array(detalleItemSchema)
    .min(1, 'Debe agregar al menos un producto')
    .max(999, 'No puede superar 999 ítems por documento')
})

export type PedidoFormData = z.infer<typeof pedidoSchema>

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Valida si un número de documento es válido según su tipo
 */
export function validarDocumento(tipo: TipoDocumento, numero: string): boolean {
  switch (tipo) {
    case TipoDocumento.RUC:
      return /^\d{11}$/.test(numero)
    case TipoDocumento.DNI:
      return /^\d{8}$/.test(numero)
    case TipoDocumento.CE:
      return numero.length >= 8 && numero.length <= 12
    case TipoDocumento.PASAPORTE:
      return numero.length >= 6 && numero.length <= 20
    default:
      return false
  }
}

/**
 * Obtiene el mensaje de error para un tipo de documento
 */
export function getMensajeErrorDocumento(tipo: TipoDocumento): string {
  switch (tipo) {
    case TipoDocumento.RUC:
      return 'El RUC debe tener exactamente 11 dígitos'
    case TipoDocumento.DNI:
      return 'El DNI debe tener exactamente 8 dígitos'
    case TipoDocumento.CE:
      return 'El Carnet de Extranjería debe tener entre 8 y 12 caracteres'
    case TipoDocumento.PASAPORTE:
      return 'El Pasaporte debe tener entre 6 y 20 caracteres'
    default:
      return 'Documento inválido'
  }
}
