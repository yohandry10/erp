// Interfaces base para abstracción de servicios fiscales
export interface FiscalConfig {
  url: string;
  usuario: string;
  password: string;
  empresaId: string; // RUC para Perú, NIT para Colombia
  certificatePath: string;
  certificatePassword: string;
  environment: 'homologacion' | 'produccion';
  pais: 'PE' | 'CO';
}

export interface FiscalResponse {
  success: boolean;
  codigoRespuesta: string;
  descripcionRespuesta: string;
  cdr?: string;
  observaciones?: string[];
  numeroComprobante?: string;
  hashDocumento?: string;
  fechaProceso?: string;
}

export interface DocumentoElectronico {
  id: string;
  tipoDocumento: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  emisor: {
    tipoDocumento: string;
    numeroDocumento: string;
    razonSocial: string;
  };
  receptor: {
    tipoDocumento: string;
    numeroDocumento: string;
    razonSocial: string;
  };
  moneda: string;
  totalGravadas: number;
  totalExoneradas: number;
  totalInafectas: number;
  totalImpuestos: number;
  totalDescuentos: number;
  importeTotal: number;
  xmlContent?: string;
}

export interface ValidacionDocumento {
  valido: boolean;
  errores: string[];
  advertencias: string[];
  numeroDocumento: string;
  tipoDocumento: string;
}

export interface ConsultaEstado {
  empresaId: string;
  tipoDocumento: string;
  serie: string;
  numero: string;
}

export interface LibroContableFiscal {
  periodo: string;
  tipoLibro: string;
  contenido: any[];
  formato: 'XML' | 'TXT' | 'JSON';
}