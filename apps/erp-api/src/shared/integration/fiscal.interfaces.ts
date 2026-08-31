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

/**
 * Contexto fiscal DIAN sellado antes de construir el UBL. La clave técnica
 * pertenece al rango de numeración y no es el PIN del software. Se mantiene
 * sólo en memoria durante la preparación; la evidencia persistida guarda
 * únicamente su huella.
 */
export interface DianGenerationContext {
  environmentId: '1' | '2';
  software: {
    id: string;
    pin: string;
  };
  authorization?: {
    number: string;
    prefix: string;
    rangeFrom: number;
    rangeTo: number;
    validFrom: string;
    validTo: string;
    technicalKey: string;
  };
  taxes?: {
    iva: number;
    inc: number;
    ica: number;
  };
  operationCode?: string;
}

/**
 * Intención interna para validar la autorización oficial de una factura antes
 * de consumir un correlativo. No contiene ni acepta TechnicalKey, PIN o PFX;
 * esos secretos se resuelven exclusivamente dentro de DianFiscalService.
 */
export interface DianInvoiceAuthorizationIntent {
  documentType: '01';
  series: string;
  issueDate: string;
  issuerIdentity: {
    contractVersion: 529;
    taxId: string;
    certificateSha256: string;
    signingConfigSha256: string;
  };
  taxes: {
    iva: number;
    inc: number;
    ica: number;
  };
}

export type DianReceiverTaxProfile =
  | {
      profile: 'CONSUMIDOR_FINAL';
      taxLevelCode: 'R-99-PN';
      taxLevelListName: '49';
      taxSchemeId: 'ZY';
      taxSchemeName: 'No causa';
    }
  | {
      profile: 'ADQUIRIENTE_NIT_B2B';
      taxLevelCode: 'O-99';
      taxLevelListName: '04';
      taxSchemeId: '01';
      taxSchemeName: 'IVA';
    };

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
    condicionIva?: string;
  };
  receptor: {
    tipoDocumento: string;
    numeroDocumento: string;
    razonSocial: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    codigoUbigeo?: string;
    codigoDepartamento?: string;
    condicionIva?: string;
    /** Perfil tributario DIAN persistido del adquirente; no se infiere del NIT. */
    dianTaxProfile?: DianReceiverTaxProfile;
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
  plazoPagoDias?: number;
  medioPago?: string;
  /**
   * Procedencia explícita de fixtures fiscales. Los defaults de homologación
   * sólo pueden usarse cuando una demo identificada llega por esta frontera.
   */
  fiscalContext?: {
    isDemo: boolean;
    fixtureSource?: string;
    simulated?: boolean;
    /** Identidad congelada de emisor/config para notas DIAN 91/92. */
    dianIssuerIdentity?: {
      contractVersion: 529;
      taxId: string;
      certificateSha256: string;
      signingConfigSha256: string;
    };
    /** Claim interno para sellar XML/CUFE antes del I/O externo. */
    deliveryOperation?: {
      tenantId: string;
      operationId: string;
      claimToken: string;
    };
  };
  /** Se completa desde GetNumberingRange; nunca se acepta desde el navegador. */
  dianContext?: DianGenerationContext;
  /** Modalidad ARCA autorizada. Sólo se admite si existe evidencia fiscal. */
  arcaAuthorizationVariant?: 'NORMAL' | 'A_CBU' | 'A_RETENCION';
  items: Array<{
    descripcion: string;
    cantidad: number;
    unidadMedida?: string;
    precioUnitario: number;
    valorVenta: number;
    igv?: number;
    tasaIgv?: number;
    codigoProducto?: string;
    /** Categoría tributaria DIAN sellada desde la afectación del producto. */
    dianTaxCategory?: 'GRAVADO' | 'EXENTO' | 'EXCLUIDO';
  }>;
  documentoReferencia?: {
    numero: string;
    fecha: Date | string;
    tipo?: string;
    serie?: string;
    /** CUFE/CUDE autoritativo del CPE origen; nunca se deriva de `cpe.hash`. */
    uuid?: string;
    uuidSchemeName?: 'CUFE-SHA384' | 'CUDE-SHA384';
  };
  /** Motivo DIAN persistido de una nota 91/92. */
  dianDiscrepancy?: {
    responseCode: string;
    description: string;
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
  /** Contrato explícito DIAN: GetStatus y GetStatusZip no son intercambiables. */
  dianQueryKind?: 'CUFE_CUDE' | 'ZIP_TRACK_ID';
}

export interface LibroContableFiscal {
  periodo: string;
  tipoLibro: string;
  contenido: any[];
  formato: 'XML' | 'TXT' | 'JSON';
}
