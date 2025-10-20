/**
 * Cotizacion Entity
 * Representa una cotización en el sistema de ventas
 * Requirements: 3.2, 3.3, 3.4
 */

export enum EstadoCotizacion {
  BORRADOR = 'BORRADOR',
  ENVIADA = 'ENVIADA',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  CONVERTIDA = 'CONVERTIDA',
  VENCIDA = 'VENCIDA'
}

export interface Cotizacion {
  id: string;
  tenant_id: string;
  numero: string;
  cliente_id: string;
  fecha: string;
  fecha_vencimiento?: string;
  estado: EstadoCotizacion;
  subtotal: number;
  igv: number;
  total: number;
  notas?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}
