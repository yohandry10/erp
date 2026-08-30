import { createHash } from 'crypto';
import Decimal from 'decimal.js';

export type DianEnvironment = '1' | '2';

type DianAmount = Decimal.Value;

export interface DianDocumentUniqueCodeInput {
  numeroDocumento: string;
  fechaEmision: string;
  horaEmision: string;
  valorSinImpuestos: DianAmount;
  iva?: DianAmount;
  inc?: DianAmount;
  ica?: DianAmount;
  total: DianAmount;
  nitEmisor: string;
  numeroAdquirente: string;
  ambiente: DianEnvironment;
}

export interface DianCufeInput extends DianDocumentUniqueCodeInput {
  claveTecnica: string;
}

export interface DianCudeInput extends DianDocumentUniqueCodeInput {
  softwarePin: string;
}

export interface DianApplicationResponseCudeInput {
  numeroDocumento: string;
  fechaEmision: string;
  horaEmision: string;
  documentoEmisor: string;
  documentoReceptor: string;
  codigoRespuesta: string;
  documentoReferenciado: string;
  tipoDocumentoReferenciado: string;
  softwarePin: string;
}

export interface DianQrInput extends DianDocumentUniqueCodeInput {
  codigoUnico: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_WITH_OFFSET_PATTERN = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DOCUMENT_NUMBER_PATTERN = /^[A-Za-z0-9._-]+$/;
const RESERVED_VALUE_PATTERN = /^[\x21-\x7E]+$/;

function sha384(value: string): string {
  return createHash('sha384').update(value, 'utf8').digest('hex');
}

function required(value: string, field: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`DIAN_${field.toUpperCase()}_REQUIRED`);
  }
  return normalized;
}

function documentNumber(value: string): string {
  const normalized = required(value, 'numero_documento');
  if (!DOCUMENT_NUMBER_PATTERN.test(normalized)) {
    throw new Error('DIAN_NUMERO_DOCUMENTO_INVALID');
  }
  return normalized;
}

function fiscalIdentifier(value: string, field: string): string {
  const normalized = required(value, field).replace(/[.\-\s]/g, '');
  if (!/^[A-Za-z0-9]+$/.test(normalized)) {
    throw new Error(`DIAN_${field.toUpperCase()}_INVALID`);
  }
  return normalized;
}

function reservedValue(value: string, field: string): string {
  const normalized = required(value, field);
  if (!RESERVED_VALUE_PATTERN.test(normalized)) {
    throw new Error(`DIAN_${field.toUpperCase()}_INVALID`);
  }
  return normalized;
}

function issueDate(value: string): string {
  const normalized = required(value, 'fecha_emision');
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new Error('DIAN_FECHA_EMISION_INVALID');
  }
  return normalized;
}

function issueTime(value: string): string {
  const normalized = required(value, 'hora_emision');
  if (!TIME_WITH_OFFSET_PATTERN.test(normalized)) {
    throw new Error('DIAN_HORA_EMISION_REQUIERE_GMT');
  }
  return normalized;
}

/**
 * El Anexo FEV 1.9 exige dos decimales truncados, no redondeados, sin miles ni
 * símbolo monetario. Decimal evita que la representación binaria de Number
 * cambie la semilla fiscal.
 */
export function formatDianAmount(value: DianAmount): string {
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.isNegative()) {
    throw new Error('DIAN_AMOUNT_INVALID');
  }
  return amount.toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2);
}

function documentSeed(input: DianDocumentUniqueCodeInput, secret: string): string {
  return [
    documentNumber(input.numeroDocumento),
    issueDate(input.fechaEmision),
    issueTime(input.horaEmision),
    formatDianAmount(input.valorSinImpuestos),
    '01',
    formatDianAmount(input.iva ?? 0),
    '04',
    formatDianAmount(input.inc ?? 0),
    '03',
    formatDianAmount(input.ica ?? 0),
    formatDianAmount(input.total),
    fiscalIdentifier(input.nitEmisor, 'nit_emisor'),
    fiscalIdentifier(input.numeroAdquirente, 'numero_adquirente'),
    secret,
    input.ambiente,
  ].join('');
}

/** CUFE de factura de venta/exportación/tipo 04: SHA-384 y clave técnica. */
export function generarCufe(input: DianCufeInput): string {
  return sha384(documentSeed(input, reservedValue(input.claveTecnica, 'clave_tecnica')));
}

/** CUDE de nota crédito, nota débito o documento de transmisión: usa PIN. */
export function generarCude(input: DianCudeInput): string {
  return sha384(documentSeed(input, reservedValue(input.softwarePin, 'software_pin')));
}

/** CUDE específico de ApplicationResponse conforme al orden del Anexo 1.9. */
export function generarApplicationResponseCude(input: DianApplicationResponseCudeInput): string {
  const seed = [
    documentNumber(input.numeroDocumento),
    issueDate(input.fechaEmision),
    issueTime(input.horaEmision),
    fiscalIdentifier(input.documentoEmisor, 'documento_emisor'),
    fiscalIdentifier(input.documentoReceptor, 'documento_receptor'),
    required(input.codigoRespuesta, 'codigo_respuesta'),
    documentNumber(input.documentoReferenciado),
    required(input.tipoDocumentoReferenciado, 'tipo_documento_referenciado'),
    reservedValue(input.softwarePin, 'software_pin'),
  ].join('');
  return sha384(seed);
}

/** SoftwareSecurityCode = SHA-384(SoftwareId + SoftwarePIN + cbc:ID). */
export function generarSoftwareSecurityCode(
  softwareId: string,
  softwarePin: string,
  numeroDocumento: string,
): string {
  return sha384(
    reservedValue(softwareId, 'software_id')
      + reservedValue(softwarePin, 'software_pin')
      + documentNumber(numeroDocumento),
  );
}

export function generarDianQrUrl(codigoUnico: string, ambiente: DianEnvironment): string {
  const code = required(codigoUnico, 'codigo_unico').toLowerCase();
  if (!/^[a-f0-9]{96}$/.test(code)) {
    throw new Error('DIAN_CUFE_CUDE_INVALID');
  }
  const host = ambiente === '1' ? 'catalogo-vpfe.dian.gov.co' : 'catalogo-vpfe-hab.dian.gov.co';
  return `https://${host}/document/searchqr?documentkey=${code}`;
}

/** Contenido textual que el Anexo 1.9 exige codificar en el QR gráfico. */
export function generarDianQrPayload(input: DianQrInput): string {
  const iva = formatDianAmount(input.iva ?? 0);
  const otros = new Decimal(input.inc ?? 0).plus(input.ica ?? 0);
  return [
    `NumFac: ${documentNumber(input.numeroDocumento)}`,
    `FecFac: ${issueDate(input.fechaEmision)}`,
    `HorFac: ${issueTime(input.horaEmision)}`,
    `NitFac: ${fiscalIdentifier(input.nitEmisor, 'nit_emisor')}`,
    `DocAdq: ${fiscalIdentifier(input.numeroAdquirente, 'numero_adquirente')}`,
    `ValFac: ${formatDianAmount(input.valorSinImpuestos)}`,
    `ValIva: ${iva}`,
    `ValOtroIm: ${formatDianAmount(otros)}`,
    `ValTolFac: ${formatDianAmount(input.total)}`,
    `CUFE/CUDE: ${required(input.codigoUnico, 'codigo_unico').toLowerCase()}`,
    `QRCode: ${generarDianQrUrl(input.codigoUnico, input.ambiente)}`,
  ].join('\n');
}
