import {
  resolveArgentinaExplicitFiscalCode,
  resolveArgentinaFiscalDocument,
} from '../../shared/utils/argentina-fiscal-document.util';

export interface ArcaPrintedFiscalInfo {
  documentType: string;
  authorizationCode: string;
  authorizationLabel: 'CAE';
  authorizationExpiry: string;
  pointOfSale: number;
  documentNumber: number;
  specialLegend: string | null;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function validCompactDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

/**
 * Resuelve sólo evidencia autorizada para la representación ARCA. Los códigos
 * E y 051..053 pueden representarse si ya fueron autorizados, aunque este
 * release no permite emitirlos por el flujo WSFEv1 genérico.
 */
export function resolveArcaPrintedFiscalInfo(
  cpe: Record<string, any>,
  config: Record<string, any>,
  allowDemo = false,
): ArcaPrintedFiscalInfo {
  const metadata = cpe.metadata && typeof cpe.metadata === 'object' ? cpe.metadata : {};
  if (!allowDemo && clean(metadata.fiscal_country).toUpperCase() !== 'AR') {
    throw new Error('Representación ARCA incompleta: falta evidencia fiscal 524 del país AR');
  }
  const rawAuthorizedType = clean(
    metadata.arca_cbte_tipo || metadata.arcaCbteTipo || metadata.tipoComprobante,
  );
  if (!allowDemo && !rawAuthorizedType) {
    throw new Error('Representación ARCA incompleta: falta tipo de comprobante autorizado');
  }
  const resolvedType = rawAuthorizedType
    ? resolveArgentinaExplicitFiscalCode(rawAuthorizedType.padStart(3, '0'))
    : resolveArgentinaFiscalDocument({
        documentType: cpe.tipo_documento,
        issuerVatCondition: metadata.arca_condicion_iva_emisor || config.arca_condicion_iva,
        receiverVatCondition:
          metadata.arca_condicion_iva_receptor || metadata.condicionIvaReceptor
          || metadata.arca_condicion_iva_receptor_id,
      }).wsfeCode;

  const authorizationCode = clean(
    allowDemo ? metadata.arca_cae || metadata.cae || cpe.cae || cpe.hash : metadata.arca_cae,
  );
  const authorizationExpiry = clean(
    metadata.arca_cae_vencimiento || metadata.caeVencimiento || cpe.cae_vencimiento,
  ).replace(/-/g, '').slice(0, 8);
  const authorizationType = clean(metadata.tipoCodAut || metadata.tipo_cod_aut || 'E').toUpperCase();
  if (!allowDemo && (!/^\d{14}$/.test(authorizationCode) || !validCompactDate(authorizationExpiry))) {
    throw new Error('Representación ARCA incompleta: falta CAE o vencimiento válido');
  }
  if (!allowDemo && clean(cpe.hash) !== authorizationCode) {
    throw new Error('Representación ARCA inconsistente: el CAE no coincide con el hash autorizado');
  }
  if (!allowDemo && authorizationType !== 'E') {
    throw new Error('Representación ARCA no soportada: CAEA no está implementado en este release');
  }

  const authorizedPoint = clean(metadata.arca_punto_venta || metadata.puntoVenta);
  const authorizedNumber = clean(metadata.arca_cbte_numero || metadata.arcaCbteNumero);
  if (!allowDemo && (!authorizedPoint || !authorizedNumber)) {
    throw new Error('Representación ARCA incompleta: falta punto o número autorizado');
  }
  const pointOfSale = Number(
    authorizedPoint || String(cpe.serie || '').replace(/\D/g, ''),
  );
  const documentNumber = Number(authorizedNumber || cpe.numero);
  if (!Number.isSafeInteger(pointOfSale) || pointOfSale < 1 || pointOfSale > 99998
      || !Number.isSafeInteger(documentNumber) || documentNumber < 1) {
    throw new Error('Representación ARCA inconsistente: punto o número fiscal inválido');
  }
  const persistedSeriesPoint = Number(String(cpe.serie || '').replace(/\D/g, ''));
  if (!allowDemo && persistedSeriesPoint !== pointOfSale) {
    throw new Error('Representación ARCA inconsistente: punto autorizado no coincide con la serie');
  }
  const persistedNumber = Number(cpe.numero);
  if (!allowDemo && persistedNumber !== documentNumber) {
    throw new Error('Representación ARCA inconsistente: número autorizado no coincide con el CPE');
  }

  return {
    documentType: String(resolvedType).padStart(3, '0'),
    authorizationCode: authorizationCode || 'MUESTRA-SIN-CAE',
    authorizationLabel: 'CAE',
    authorizationExpiry: authorizationExpiry || 'No aplica en muestra',
    pointOfSale,
    documentNumber,
    specialLegend: [51, 52, 53].includes(resolvedType)
      ? 'OPERACIÓN SUJETA A RETENCIÓN'
      : null,
  };
}
