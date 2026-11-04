import { sunatOperation } from '../../shared/utils/sunat-operation.util';

export interface SunatQrInput {
  tipo_operacion?: unknown;
  tipoOperacion?: unknown;
  metadata?: Record<string, unknown>;
  ruc_emisor?: unknown;
  tipo_documento?: unknown;
  serie?: unknown;
  numero?: unknown;
  total_igv?: unknown;
  total_venta?: unknown;
  fecha_emision?: unknown;
  created_at?: unknown;
  tipo_documento_receptor?: unknown;
  documento_receptor?: unknown;
  valor_resumen?: unknown;
  hash_firma?: unknown;
  hash?: unknown;
  hash_code?: unknown;
  codigo_hash?: unknown;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function requireValue(value: unknown, field: string): string {
  const normalized = clean(value);
  if (!normalized) {
    throw new Error(`No se puede generar el QR SUNAT: falta ${field}`);
  }
  return normalized;
}

function resolveSummaryValue(data: SunatQrInput): string {
  for (const candidate of [
    data.valor_resumen,
    data.hash_firma,
    data.hash,
    data.hash_code,
    data.codigo_hash,
  ]) {
    const normalized = clean(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function formatAmount(value: unknown, field: string): string {
  const normalized = requireValue(value, field);
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`No se puede generar el QR SUNAT: ${field} no es un importe válido`);
  }
  return numeric.toFixed(2);
}

function formatIssueDate(value: unknown, fallback?: unknown): string {
  const raw = requireValue(value || fallback, 'fecha de emisión');

  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return isoDate;
    }
    throw new Error('No se puede generar el QR SUNAT: fecha de emisión inválida');
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  throw new Error('No se puede generar el QR SUNAT: fecha de emisión inválida');
}

function validateSunatQrIdentity(data: SunatQrInput): void {
  const ruc = requireValue(data.ruc_emisor, 'RUC del emisor');
  if (!/^\d{11}$/.test(ruc)) {
    throw new Error('No se puede generar el QR SUNAT: RUC del emisor inválido');
  }

  const type = requireValue(data.tipo_documento, 'tipo de documento');
  if (!/^(?:01|03|07|08)$/.test(type)) {
    throw new Error('No se puede generar el QR SUNAT: tipo de documento no soportado');
  }

  const series = requireValue(data.serie, 'serie').toUpperCase();
  if (!/^[FB][A-Z0-9]{3}$/.test(series)) {
    throw new Error('No se puede generar el QR SUNAT: serie inválida');
  }

  const number = requireValue(data.numero, 'número');
  if (!/^\d{1,8}$/.test(number)) {
    throw new Error('No se puede generar el QR SUNAT: número inválido');
  }

  const receiverType = clean(data.tipo_documento_receptor);
  const receiverDocument = clean(data.documento_receptor);
  if ((receiverType && !receiverDocument) || (!receiverType && receiverDocument)) {
    throw new Error('No se puede generar el QR SUNAT: documento del receptor incompleto');
  }

  // Las facturas de exportación conservan la identidad del no domiciliado;
  // la exigencia de RUC corresponde a las ventas internas.
  const exportReceiver = sunatOperation(data) === '0200'
    && ['1', '4', '7'].includes(receiverType)
    && /^[0-9A-Z]{6,20}$/i.test(receiverDocument)
    && (receiverType !== '1' || /^\d{8}$/.test(receiverDocument));
  if (series.startsWith('F') && !exportReceiver && (receiverType !== '6' || !/^\d{11}$/.test(receiverDocument))) {
    throw new Error('No se puede generar el QR SUNAT: la serie F requiere RUC válido del receptor');
  }

  // SUNAT incluye el valor resumen (DigestValue) en la medida que exista. Su
  // ausencia no invalida por sí sola los demás datos obligatorios del QR; el
  // décimo campo se conserva vacío para mantener el orden oficial.
}

export function buildSunatQrContent(data: SunatQrInput): string {
  // Las muestras e importaciones históricas conservan nombres de documento.
  // Traducir sólo estos cuatro alias para representar el QR no modifica la
  // fila ni omite las validaciones fiscales de identidad, serie e importes.
  const legacyTypes: Record<string, string> = {
    FACTURA: '01', BOLETA: '03', NOTA_CREDITO: '07', NOTA_DEBITO: '08',
  };
  const storedType = clean(data.tipo_documento);
  const documentType = Object.prototype.hasOwnProperty.call(legacyTypes, storedType)
    ? legacyTypes[storedType] : storedType;
  // La factura histórica de la demo guarda el RUC, pero omite su código 6.
  // Sólo ese alias interno inequívoco permite reconstruir la clasificación;
  // documentos nuevos, exportaciones e identidades ambiguas siguen fallando.
  const receiverType = clean(data.tipo_documento_receptor) || (
    storedType === 'FACTURA'
      && clean(data.serie).toUpperCase().startsWith('F')
      && /^\d{11}$/.test(clean(data.documento_receptor))
      && sunatOperation(data) !== '0200'
      ? '6' : ''
  );
  validateSunatQrIdentity({ ...data, tipo_documento: documentType, tipo_documento_receptor: receiverType });

  return [
    clean(data.ruc_emisor),
    documentType,
    clean(data.serie).toUpperCase(),
    clean(data.numero),
    formatAmount(data.total_igv, 'IGV'),
    formatAmount(data.total_venta, 'importe total'),
    formatIssueDate(data.fecha_emision, data.created_at),
    receiverType,
    clean(data.documento_receptor),
    resolveSummaryValue(data),
  ].join('|');
}

export async function buildSunatQrDataUrl(data: SunatQrInput): Promise<string> {
  const QRCode = await import('qrcode');

  return QRCode.toDataURL(buildSunatQrContent(data), {
    errorCorrectionLevel: 'Q',
    type: 'image/png',
    width: 200,
    // Dos módulos conservan al menos 1 mm de zona clara al imprimir el QR de
    // 42 mm incluso con payloads SUNAT largos.
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}
