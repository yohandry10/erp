import {
  resolveArgentinaExplicitFiscalCode,
  resolveArgentinaFiscalDocument,
} from '../../shared/utils/argentina-fiscal-document.util';
import {
  fechaDeDocumentoEnPais,
  zonaHorariaDePais,
} from '../../shared/utils/fecha-peru.util';

export interface DianQrInput {
  simulated_origin?: unknown;
  fiscal_authority_evidence?: unknown;
}

export interface FiscalQrRepresentation {
  content: string;
  dataUrl: string;
}

export interface AcceptedDianEvidence {
  kind: 'CUFE' | 'CUDE';
  uniqueCode: string;
}

export interface ArcaQrOptions {
  allowMissingAuthorization?: boolean;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Resuelve el QR DIAN exclusivamente desde evidencia terminal 525. `cpe.hash`
 * sigue siendo un hash XML genérico y nunca se interpreta como CUFE/CUDE.
 * Todo registro legacy o simulado falla de forma segura sin URL oficial.
 */
export function resolveAcceptedDianEvidence(data: DianQrInput): AcceptedDianEvidence | null {
  if (data?.simulated_origin !== false) return null;
  const evidence = data?.fiscal_authority_evidence
    && typeof data.fiscal_authority_evidence === 'object'
    ? data.fiscal_authority_evidence as Record<string, unknown>
    : {};
  if (clean(evidence.status).toUpperCase() !== 'ACCEPTED') return null;
  const authority = clean(evidence.authority).toUpperCase();
  const country = clean(evidence.country_code).toUpperCase();
  const kind = clean(evidence.code_kind).toUpperCase();
  const uniqueDocumentCode = clean(evidence.unique_code).toUpperCase();
  if (authority !== 'DIAN' || country !== 'CO' || !['CUFE', 'CUDE'].includes(kind)
      || !/^[0-9A-F]{96}$/.test(uniqueDocumentCode)) {
    throw new Error('No se puede generar el QR DIAN: evidencia fiscal 525 inválida');
  }
  return { kind: kind as AcceptedDianEvidence['kind'], uniqueCode: uniqueDocumentCode };
}

export function resolveDianQrContent(data: DianQrInput): string | null {
  const evidence = resolveAcceptedDianEvidence(data);
  return evidence
    ? `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${evidence.uniqueCode}`
    : null;
}

function requireArcaValue(value: unknown, field: string): string {
  const normalized = clean(value);
  if (!normalized) throw new Error(`No se puede generar el QR ARCA: falta ${field}`);
  return normalized;
}

function resolveArcaReceiverType(value: unknown, receiverNumber: string): number {
  const normalized = clean(value).toUpperCase();
  if (normalized === 'CUIT' || normalized === '80') return 80;
  if (normalized === 'CUIL' || normalized === '86') return 86;
  if (normalized === 'CDI' || normalized === '87') return 87;
  if (normalized === 'DNI' || normalized === '96') return 96;
  if ((normalized === 'CONSUMIDOR_FINAL' || normalized === '99') && !receiverNumber) return 99;
  throw new Error('No se puede generar el QR ARCA: tipo de documento del receptor inválido');
}

function resolveArcaIssueDate(value: unknown): string {
  const raw = requireArcaValue(value, 'fecha de emisión');
  const date = fechaDeDocumentoEnPais(raw, zonaHorariaDePais('AR'));
  const parsed = date ? new Date(`${date}T00:00:00Z`) : null;
  if (!date || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('No se puede generar el QR ARCA: fecha de emisión inválida');
  }
  return date;
}

function parsePersistedArcaQr(content: string): Record<string, unknown> {
  const match = /^https:\/\/www\.(?:arca|afip)\.gob\.ar\/fe\/qr\/\?p=([A-Za-z0-9+/]+={0,2})$/.exec(content);
  if (!match) throw new Error('No se puede generar el QR ARCA: URL fiscal persistida inválida');
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('payload');
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('No se puede generar el QR ARCA: payload fiscal persistido inválido');
  }
}

function resolveArcaAuthorizationExpiry(value: unknown): string {
  const raw = requireArcaValue(value, 'vencimiento del CAE').replace(/-/g, '');
  if (!/^\d{8}$/.test(raw)) {
    throw new Error('No se puede generar el QR ARCA: vencimiento del CAE inválido');
  }
  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('No se puede generar el QR ARCA: vencimiento del CAE inválido');
  }
  return raw;
}

export function resolveArcaQrContent(
  data: Record<string, any>,
  options: ArcaQrOptions = {},
): string | null {
  const metadata = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const persistedContent = clean(
    data?.arca_qr_content || data?.qr_content || metadata.arca_qr_content
      || metadata.arca_qr_url || metadata.qrUrl || metadata.qr_url,
  );
  if (persistedContent
      && !persistedContent.startsWith('https://www.arca.gob.ar/fe/qr/?p=')
      && !persistedContent.startsWith('https://www.afip.gob.ar/fe/qr/?p=')) {
    throw new Error('No se puede generar el QR ARCA: URL fiscal persistida inválida');
  }

  if (!options.allowMissingAuthorization && clean(metadata.fiscal_country).toUpperCase() !== 'AR') {
    throw new Error('No se puede generar el QR ARCA: falta evidencia fiscal 524 del país AR');
  }
  const authorization = clean(
    options.allowMissingAuthorization
      ? metadata.arca_cae || data?.arca_cae || data?.cae || metadata.cae || data?.hash
      : metadata.arca_cae,
  );
  if (!authorization && options.allowMissingAuthorization) return null;
  if (!/^\d{14}$/.test(authorization)) {
    throw new Error('No se puede generar el QR ARCA: falta CAE válido de 14 dígitos');
  }
  if (!options.allowMissingAuthorization && clean(data?.hash) !== authorization) {
    throw new Error('No se puede generar el QR ARCA: el CAE no coincide con el hash autorizado');
  }
  if (!options.allowMissingAuthorization) {
    resolveArcaAuthorizationExpiry(metadata.arca_cae_vencimiento);
  }

  const issuerTaxId = requireArcaValue(data?.ruc_emisor || data?.cuit_emisor, 'CUIT del emisor')
    .replace(/\D/g, '');
  if (!/^\d{11}$/.test(issuerTaxId)) {
    throw new Error('No se puede generar el QR ARCA: CUIT del emisor inválido');
  }
  const pointOfSaleRaw = clean(
    metadata.arca_punto_venta || (options.allowMissingAuthorization
      ? metadata.arcaPuntoVenta || metadata.puntoVenta || data?.arca_punto_venta
        || data?.punto_venta || String(data?.serie || '').replace(/\D/g, '')
      : ''),
  );
  const pointOfSale = Number(pointOfSaleRaw);
  if (!Number.isInteger(pointOfSale) || pointOfSale < 1 || pointOfSale > 99998) {
    throw new Error('No se puede generar el QR ARCA: punto de venta inválido');
  }
  const documentNumber = Number(requireArcaValue(
    metadata.arca_cbte_numero || (options.allowMissingAuthorization ? metadata.arcaCbteNumero || data?.numero : ''),
    'número de comprobante',
  ));
  if (!Number.isSafeInteger(documentNumber) || documentNumber < 1) {
    throw new Error('No se puede generar el QR ARCA: número de comprobante inválido');
  }
  const total = Number(data?.total_venta ?? data?.total);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error('No se puede generar el QR ARCA: importe total inválido');
  }

  const rawCurrency = clean(data?.moneda || 'ARS').toUpperCase();
  const currency = rawCurrency === 'ARS' ? 'PES' : rawCurrency === 'USD' ? 'DOL' : rawCurrency;
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('No se puede generar el QR ARCA: moneda inválida');
  }
  const exchangeRate = Number(
    data?.tipo_cambio ?? data?.cotizacion_moneda
    ?? metadata.arca_cotizacion ?? metadata.cotizacion ?? metadata.ctz ?? 1,
  );
  if (
    !Number.isFinite(exchangeRate) || exchangeRate <= 0 ||
    (currency !== 'PES'
      && data?.tipo_cambio == null
      && data?.cotizacion_moneda == null
      && metadata.arca_cotizacion == null
      && metadata.cotizacion == null
      && metadata.ctz == null)
  ) {
    throw new Error('No se puede generar el QR ARCA: cotización de moneda inválida');
  }
  const receiverNumber = clean(data?.documento_receptor || data?.numero_documento_cliente).replace(/\D/g, '');
  if (receiverNumber && !/^\d{1,11}$/.test(receiverNumber)) {
    throw new Error('No se puede generar el QR ARCA: documento del receptor inválido');
  }
  const authorizationType = clean(data?.tipo_cod_aut || metadata.tipoCodAut || 'E').toUpperCase();
  if (authorizationType !== 'E') {
    throw new Error('No se puede generar el QR ARCA: CAEA no está implementado en este release');
  }

  const authorizedDocumentType = metadata.arca_cbte_tipo || metadata.arcaCbteTipo || metadata.tipoComprobante;
  const documentType = authorizedDocumentType
    ? resolveArgentinaExplicitFiscalCode(String(authorizedDocumentType).padStart(3, '0'))
    : resolveArgentinaFiscalDocument({
      documentType: data?.tipo_documento_fiscal || data?.tipo_documento,
      issuerVatCondition:
        data?.arca_condicion_iva_emisor || metadata.arca_condicion_iva_emisor
        || metadata.condicionIvaEmisor,
      receiverVatCondition:
        data?.arca_condicion_iva_receptor || metadata.arca_condicion_iva_receptor
        || metadata.condicionIvaReceptor || metadata.condicionIvaReceptorId,
    }).wsfeCode;
  const receiverType = resolveArcaReceiverType(data?.tipo_documento_receptor, receiverNumber);
  if ([1, 2, 3, 51, 52, 53].includes(documentType) && receiverType !== 80) {
    throw new Error('No se puede generar el QR ARCA: comprobante clase A exige receptor CUIT');
  }

  const persistedPayload = persistedContent ? parsePersistedArcaQr(persistedContent) : null;
  const issueDate = persistedPayload
    ? resolveArcaIssueDate(persistedPayload.fecha)
    : resolveArcaIssueDate(data?.fecha_emision || data?.created_at);
  if (persistedPayload
      && issueDate !== resolveArcaIssueDate(data?.fecha_emision || data?.created_at)) {
    throw new Error('No se puede generar el QR ARCA: la fecha autorizada no coincide con el comprobante');
  }
  const payload = {
    ver: 1,
    fecha: issueDate,
    cuit: Number(issuerTaxId),
    ptoVta: pointOfSale,
    tipoCmp: documentType,
    nroCmp: documentNumber,
    importe: Number(total.toFixed(2)),
    moneda: currency,
    ctz: exchangeRate,
    tipoDocRec: receiverType,
    nroDocRec: Number(receiverNumber || 0),
    tipoCodAut: authorizationType,
    codAut: Number(authorization),
  };
  if (persistedPayload) {
    const expectedKeys = Object.keys(payload).sort();
    const persistedKeys = Object.keys(persistedPayload).sort();
    if (expectedKeys.length !== persistedKeys.length
        || expectedKeys.some((key, index) => key !== persistedKeys[index])
        || expectedKeys.some((key) => JSON.stringify(persistedPayload[key]) !== JSON.stringify(
          payload[key as keyof typeof payload],
        ))) {
      throw new Error('No se puede generar el QR ARCA: payload autorizado inconsistente');
    }
    return persistedContent;
  }
  return `https://www.arca.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

export async function buildArcaQrRepresentation(
  data: Record<string, any>,
  options: ArcaQrOptions = {},
): Promise<FiscalQrRepresentation | null> {
  const content = resolveArcaQrContent(data, options);
  if (!content) return null;
  const QRCode = await import('qrcode');
  const dataUrl = await QRCode.toDataURL(content, {
    errorCorrectionLevel: 'Q', type: 'image/png', width: 200, margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return { content, dataUrl };
}

export async function buildDianQrRepresentation(
  data: DianQrInput,
): Promise<FiscalQrRepresentation | null> {
  const content = resolveDianQrContent(data);
  if (!content) return null;

  const QRCode = await import('qrcode');
  const dataUrl = await QRCode.toDataURL(content, {
    errorCorrectionLevel: 'Q',
    type: 'image/png',
    width: 200,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  return { content, dataUrl };
}
