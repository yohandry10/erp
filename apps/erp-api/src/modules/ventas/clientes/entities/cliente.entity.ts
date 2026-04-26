/**
 * Cliente Entity
 * Representa un cliente en el sistema de ventas
 * Requirements: 1.2, 1.3, 1.4, 19.1, 19.2
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
  id: string;
  tenant_id: string;
  tipo: TipoCliente;
  documento_tipo: TipoDocumento;
  documento_numero: string;
  razon_social: string;
  nombre_comercial?: string;
  direccion?: string;
  email?: string;
  telefono?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}
