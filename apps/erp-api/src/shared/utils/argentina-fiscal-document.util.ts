export type ArgentinaDocumentClass = 'A' | 'B' | 'C';
export type ArgentinaAuthorizationVariant = 'NORMAL' | 'A_CBU' | 'A_RETENCION';
export type ArgentinaDocumentNature = 'FACTURA' | 'NOTA_DEBITO' | 'NOTA_CREDITO';

export interface ArgentinaFiscalDocumentResolution {
  wsfeCode: number;
  wsfeCodeText: string;
  documentClass: ArgentinaDocumentClass;
  nature: ArgentinaDocumentNature;
  receiverVatConditionId: number;
  issuerVatCondition: 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';
  authorizationVariant: ArgentinaAuthorizationVariant;
}

const VAT_ALIASES: Record<string, { canonical: string; id: number }> = {
  '1': { canonical: 'RESPONSABLE_INSCRIPTO', id: 1 },
  RESPONSABLE_INSCRIPTO: { canonical: 'RESPONSABLE_INSCRIPTO', id: 1 },
  IVA_RESPONSABLE_INSCRIPTO: { canonical: 'RESPONSABLE_INSCRIPTO', id: 1 },
  '4': { canonical: 'EXENTO', id: 4 },
  EXENTO: { canonical: 'EXENTO', id: 4 },
  IVA_EXENTO: { canonical: 'EXENTO', id: 4 },
  '5': { canonical: 'CONSUMIDOR_FINAL', id: 5 },
  CONSUMIDOR_FINAL: { canonical: 'CONSUMIDOR_FINAL', id: 5 },
  '6': { canonical: 'MONOTRIBUTO', id: 6 },
  MONOTRIBUTO: { canonical: 'MONOTRIBUTO', id: 6 },
  MONOTRIBUTISTA: { canonical: 'MONOTRIBUTO', id: 6 },
  RESPONSABLE_MONOTRIBUTO: { canonical: 'MONOTRIBUTO', id: 6 },
  '7': { canonical: 'SUJETO_NO_CATEGORIZADO', id: 7 },
  SUJETO_NO_CATEGORIZADO: { canonical: 'SUJETO_NO_CATEGORIZADO', id: 7 },
  NO_CATEGORIZADO: { canonical: 'SUJETO_NO_CATEGORIZADO', id: 7 },
  '8': { canonical: 'PROVEEDOR_EXTERIOR', id: 8 },
  PROVEEDOR_EXTERIOR: { canonical: 'PROVEEDOR_EXTERIOR', id: 8 },
  '9': { canonical: 'CLIENTE_EXTERIOR', id: 9 },
  CLIENTE_EXTERIOR: { canonical: 'CLIENTE_EXTERIOR', id: 9 },
  '10': { canonical: 'IVA_LIBERADO', id: 10 },
  IVA_LIBERADO: { canonical: 'IVA_LIBERADO', id: 10 },
  '13': { canonical: 'MONOTRIBUTISTA_SOCIAL', id: 13 },
  MONOTRIBUTISTA_SOCIAL: { canonical: 'MONOTRIBUTISTA_SOCIAL', id: 13 },
  '15': { canonical: 'IVA_NO_ALCANZADO', id: 15 },
  IVA_NO_ALCANZADO: { canonical: 'IVA_NO_ALCANZADO', id: 15 },
  NO_RESPONSABLE: { canonical: 'IVA_NO_ALCANZADO', id: 15 },
  '16': { canonical: 'MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO', id: 16 },
  MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO: {
    canonical: 'MONOTRIBUTO_TRABAJADOR_INDEPENDIENTE_PROMOVIDO', id: 16,
  },
};

function normalizeKey(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function resolveVatCondition(value: unknown, role: 'emisor' | 'receptor') {
  const key = normalizeKey(value);
  const resolved = VAT_ALIASES[key];
  if (!resolved) {
    throw new Error(`No se puede resolver el comprobante ARCA: falta condición IVA válida del ${role}`);
  }
  return resolved;
}

type ArgentinaExplicitFamily = ArgentinaDocumentClass | 'E' | 'A_RETENCION';

function resolveNature(type: unknown): { nature: ArgentinaDocumentNature; explicitClass?: ArgentinaExplicitFamily } {
  const normalized = normalizeKey(type);
  const aliases: Record<string, { nature: ArgentinaDocumentNature; explicitClass?: ArgentinaExplicitFamily }> = {
    '01': { nature: 'FACTURA' },
    '03': { nature: 'FACTURA' },
    '07': { nature: 'NOTA_CREDITO' },
    '08': { nature: 'NOTA_DEBITO' },
    '001': { nature: 'FACTURA', explicitClass: 'A' },
    '002': { nature: 'NOTA_DEBITO', explicitClass: 'A' },
    '003': { nature: 'NOTA_CREDITO', explicitClass: 'A' },
    '006': { nature: 'FACTURA', explicitClass: 'B' },
    '007': { nature: 'NOTA_DEBITO', explicitClass: 'B' },
    '008': { nature: 'NOTA_CREDITO', explicitClass: 'B' },
    '011': { nature: 'FACTURA', explicitClass: 'C' },
    '012': { nature: 'NOTA_DEBITO', explicitClass: 'C' },
    '013': { nature: 'NOTA_CREDITO', explicitClass: 'C' },
    FACTURA_A: { nature: 'FACTURA', explicitClass: 'A' },
    NOTA_DEBITO_A: { nature: 'NOTA_DEBITO', explicitClass: 'A' },
    NOTA_CREDITO_A: { nature: 'NOTA_CREDITO', explicitClass: 'A' },
    FACTURA_B: { nature: 'FACTURA', explicitClass: 'B' },
    NOTA_DEBITO_B: { nature: 'NOTA_DEBITO', explicitClass: 'B' },
    NOTA_CREDITO_B: { nature: 'NOTA_CREDITO', explicitClass: 'B' },
    FACTURA_C: { nature: 'FACTURA', explicitClass: 'C' },
    NOTA_DEBITO_C: { nature: 'NOTA_DEBITO', explicitClass: 'C' },
    NOTA_CREDITO_C: { nature: 'NOTA_CREDITO', explicitClass: 'C' },
    '019': { nature: 'FACTURA', explicitClass: 'E' },
    '020': { nature: 'NOTA_DEBITO', explicitClass: 'E' },
    '021': { nature: 'NOTA_CREDITO', explicitClass: 'E' },
    FACTURA_E: { nature: 'FACTURA', explicitClass: 'E' },
    NOTA_DEBITO_E: { nature: 'NOTA_DEBITO', explicitClass: 'E' },
    NOTA_CREDITO_E: { nature: 'NOTA_CREDITO', explicitClass: 'E' },
    // Desde 01/12/2025 estos códigos son comprobantes A sujetos a
    // retención, no una clase M. La habilitación la determina ARCA.
    '051': { nature: 'FACTURA', explicitClass: 'A_RETENCION' },
    '052': { nature: 'NOTA_DEBITO', explicitClass: 'A_RETENCION' },
    '053': { nature: 'NOTA_CREDITO', explicitClass: 'A_RETENCION' },
    FACTURA_A_RETENCION: { nature: 'FACTURA', explicitClass: 'A_RETENCION' },
    NOTA_DEBITO_A_RETENCION: { nature: 'NOTA_DEBITO', explicitClass: 'A_RETENCION' },
    NOTA_CREDITO_A_RETENCION: { nature: 'NOTA_CREDITO', explicitClass: 'A_RETENCION' },
  };
  const resolved = aliases[normalized];
  if (!resolved) throw new Error(`Tipo de comprobante ARCA no soportado: ${String(type ?? '')}`);
  return resolved;
}

const WSFE_BY_CLASS: Record<ArgentinaDocumentClass, Record<ArgentinaDocumentNature, number>> = {
  A: { FACTURA: 1, NOTA_DEBITO: 2, NOTA_CREDITO: 3 },
  B: { FACTURA: 6, NOTA_DEBITO: 7, NOTA_CREDITO: 8 },
  C: { FACTURA: 11, NOTA_DEBITO: 12, NOTA_CREDITO: 13 },
};

const A_RETENCION_CODES: Record<ArgentinaDocumentNature, number> = {
  FACTURA: 51,
  NOTA_DEBITO: 52,
  NOTA_CREDITO: 53,
};

const EXPORT_CODES: Record<ArgentinaDocumentNature, number> = {
  FACTURA: 19,
  NOTA_DEBITO: 20,
  NOTA_CREDITO: 21,
};

/** Código persistido/autorizado, útil para QR y representación histórica. */
export function resolveArgentinaExplicitFiscalCode(documentType: unknown): number {
  const type = resolveNature(documentType);
  if (!type.explicitClass) {
    throw new Error(`Tipo ARCA ambiguo sin condiciones IVA: ${String(documentType ?? '')}`);
  }
  if (type.explicitClass === 'E') return EXPORT_CODES[type.nature];
  if (type.explicitClass === 'A_RETENCION') return A_RETENCION_CODES[type.nature];
  return WSFE_BY_CLASS[type.explicitClass][type.nature];
}

export function resolveArgentinaExplicitWsfeCode(documentType: unknown): number {
  const type = resolveNature(documentType);
  if (!type.explicitClass) {
    throw new Error(
      `Tipo ARCA ambiguo sin condiciones IVA: ${String(documentType ?? '')}`,
    );
  }
  if (type.explicitClass === 'E') {
    throw new Error('Comprobante ARCA clase E requiere WSFEXv1; no puede enviarse por WSFEv1');
  }
  if (type.explicitClass === 'A_RETENCION') return A_RETENCION_CODES[type.nature];
  return WSFE_BY_CLASS[type.explicitClass][type.nature];
}

/**
 * Resuelve la clase A/B/C con las condiciones IVA, no con el código CPE PE.
 * ARCA publica que un RI emite A a RI/monotributistas y B al resto; un
 * monotributista o exento emite C. La condición del receptor además es un
 * campo obligatorio de WSFEv1 (RG 5616).
 */
export function resolveArgentinaFiscalDocument(input: {
  documentType: unknown;
  issuerVatCondition: unknown;
  receiverVatCondition: unknown;
  authorizationVariant?: unknown;
}): ArgentinaFiscalDocumentResolution {
  const issuer = resolveVatCondition(input.issuerVatCondition, 'emisor');
  if (!['RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO'].includes(issuer.canonical)) {
    throw new Error('No se puede resolver el comprobante ARCA: condición IVA del emisor no habilitada');
  }
  const receiver = resolveVatCondition(input.receiverVatCondition, 'receptor');
  const type = resolveNature(input.documentType);
  let documentClass: ArgentinaDocumentClass;
  const requestedVariant = normalizeKey(input.authorizationVariant || 'NORMAL') as ArgentinaAuthorizationVariant;
  if (!['NORMAL', 'A_CBU', 'A_RETENCION'].includes(requestedVariant)) {
    throw new Error('Modalidad de autorización ARCA no soportada');
  }
  if (requestedVariant !== 'NORMAL') {
    throw new Error(
      'Modalidad ARCA A-CBU/A-retención no habilitada: falta configuración y verificación fiscal autoritativa',
    );
  }
  if (type.explicitClass === 'E') {
    throw new Error('Comprobante ARCA clase E requiere WSFEXv1, aún no implementado');
  } else if (type.explicitClass === 'A_RETENCION') {
    if (issuer.canonical !== 'RESPONSABLE_INSCRIPTO' || ![1, 6, 13, 16].includes(receiver.id)) {
      throw new Error('Comprobante A sujeto a retención exige emisor responsable inscripto y receptor habilitado');
    }
    throw new Error('Códigos ARCA 051/052/053 no son emitibles sin habilitación A-retención autoritativa');
  } else {
    documentClass = issuer.canonical === 'RESPONSABLE_INSCRIPTO'
      ? ([1, 6, 13, 16].includes(receiver.id) ? 'A' : 'B')
      : 'C';
  }

  if (type.explicitClass && type.explicitClass !== documentClass) {
    throw new Error(
      `Tipo ARCA incompatible: la condición IVA exige clase ${documentClass} y se recibió clase ${type.explicitClass}`,
    );
  }
  const wsfeCode = WSFE_BY_CLASS[documentClass][type.nature];
  return {
    wsfeCode,
    wsfeCodeText: String(wsfeCode).padStart(3, '0'),
    documentClass,
    nature: type.nature,
    receiverVatConditionId: receiver.id,
    issuerVatCondition: issuer.canonical as ArgentinaFiscalDocumentResolution['issuerVatCondition'],
    authorizationVariant: requestedVariant,
  };
}
