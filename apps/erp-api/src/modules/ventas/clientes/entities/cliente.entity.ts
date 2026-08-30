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
  CUIT = 'CUIT',
  CUIL = 'CUIL',
  CDI = 'CDI',
  NIT = 'NIT',
  CC = 'CC',
  TI = 'TI',
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
  arca_condicion_iva?: string;
  dian_perfil_fiscal?: 'CONSUMIDOR_FINAL' | 'ADQUIRIENTE_NIT_B2B';
  dian_responsabilidad_fiscal?: 'R-99-PN' | 'O-99';
  dian_responsabilidad_list_name?: '49' | '04';
  dian_tributo_id?: 'ZY' | '01';
  dian_tributo_nombre?: 'No causa' | 'IVA';
  created_at: string;
  updated_at: string;
  created_by?: string;
}
