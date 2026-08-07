// Interfaces base para abstracción de servicios fiscales
export interface FiscalConfig {
  url: string;
  usuario: string;
  password: string;
  empresaId: string; // RUC para Perú, NIT para Colombia, CUIT para Argentina
  certificatePath: string;
  certificatePassword: string;
  environment: 'homologacion' | 'produccion';
  pais: 'PE' | 'CO' | 'AR';
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
  // Campos adicionales para compatibilidad
  hash?: string; // Alias de hashDocumento (CUFE para Colombia, hash CPE para Perú)
  errores?: string[]; // Lista de errores detallados
  metadata?: any; // Metadatos adicionales específicos del país
}

export interface DocumentoElectronico {
  id: string;
  tipoDocumento: string;
  serie: string;
  numero: string;
  fechaEmision: Date | string;
  fechaVencimiento?: Date | string;
  emisor: {
    tipoDocumento: string;
    numeroDocumento: string;
    razonSocial: string;
    nombreComercial?: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    codigoUbigeo?: string;
    codigoDepartamento?: string;
    regimenFiscal?: string;
    tipoContribuyente?: string;
  };
  receptor: {
    tipoDocumento: string;
    numeroDocumento: string;
    razonSocial: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    codigoUbigeo?: string;
  };
  moneda: string;
  subtotal: number;
  totalGravadas?: number;
  totalExoneradas?: number;
  totalInafectas?: number;
  totalImpuestos: number;
  totalDescuentos?: number;
  importeTotal: number;
  tasaImpuesto?: number;
  formaPago?: string;
  items: Array<{
    descripcion: string;
    cantidad: number;
    unidadMedida?: string;
    precioUnitario: number;
    valorVenta: number;
    igv?: number;
    tasaIgv?: number;
    codigoProducto?: string;
  }>;
  documentoReferencia?: {
    numero: string;
    fecha: Date | string;
    tipo?: string;
  };
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
  hash?: string; // CUFE para Colombia, hash para Perú
  numeroDocumento?: string; // Número completo del documento (serie-numero)
}

export interface LibroContableFiscal {
  periodo: string;
  tipoLibro: string;
  contenido: any[];
  formato: 'XML' | 'TXT' | 'JSON';
}
