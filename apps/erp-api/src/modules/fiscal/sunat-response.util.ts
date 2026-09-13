import AdmZip = require('adm-zip');
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export interface SunatParsedResponse {
  success: boolean;
  codigoRespuesta: string;
  descripcionRespuesta: string;
  cdr?: string;
  observaciones?: string[];
  ticket?: string;
}

const MAX_CDR_BYTES = 5 * 1024 * 1024;

/** Lee el resultado del documento, no el éxito del transporte que contiene el ZIP. */
export function parseSunatCdr(cdrBase64: string): SunatParsedResponse | null {
  if (typeof cdrBase64 !== 'string' || cdrBase64.length > MAX_CDR_BYTES * 2) return null;
  const encoded = cdrBase64.replace(/\s/g, '');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;

  try {
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length > MAX_CDR_BYTES || buffer.toString('base64') !== encoded) return null;
    // El directorio central permite leer también ZIP con data descriptors;
    // adm-zip comprueba CRC y limita la descompresión al tamaño declarado.
    const entries = new AdmZip(buffer).getEntries();
    if (entries.length > 10) return null;
    const xmlEntries = entries.filter((entry) => !entry.isDirectory && /\.xml$/i.test(entry.entryName));
    if (xmlEntries.length !== 1) return null;
    const entry = xmlEntries[0];
    if (entry.header.encrypted || entry.header.size <= 0 || entry.header.size > MAX_CDR_BYTES) return null;
    const data = entry.getData();
    if (data.length !== entry.header.size || data.length > MAX_CDR_BYTES) return null;
    const xml = data.toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) return null;
    const parsed = new XMLParser({
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: true,
      ignoreAttributes: true,
    }).parse(xml);
    const root = parsed.ApplicationResponse;
    const response = root?.DocumentResponse?.Response;
    const code = response?.ResponseCode;
    if (typeof code !== 'string' || !/^\d{1,5}$/.test(code)) return null;
    const notes = root?.Note == null ? [] : Array.isArray(root.Note) ? root.Note : [root.Note];
    return {
      success: code === '0',
      codigoRespuesta: code,
      descripcionRespuesta: typeof response.Description === 'string' && response.Description
        ? response.Description : 'CDR SUNAT recibido',
      cdr: cdrBase64.trim(),
      observaciones: notes.filter((note: unknown): note is string => typeof note === 'string' && !!note),
    };
  } catch {
    return null;
  }
}

export function incompleteSunatCdr(): SunatParsedResponse {
  return {
    success: false,
    codigoRespuesta: '97',
    descripcionRespuesta: 'Respuesta SUNAT sin CDR válido y código de documento verificable; consultar estado antes de reenviar',
  };
}

export function parseSunatSoapResponse(xml: string): SunatParsedResponse {
  const tag = (name: string): string | undefined => new RegExp(
    `<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, 'i',
  ).exec(xml)?.[1]?.trim();
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) return incompleteSunatCdr();
  const fault = tag('faultstring');
  if (fault) {
    return {
      success: false,
      codigoRespuesta: fault.match(/\b(?:Client|Server|soap-env:Server)\.\d+\b/i)?.[0]
        ?? fault.match(/^\s*(\d{3,5})\s*$/)?.[1] ?? '99',
      descripcionRespuesta: fault,
    };
  }
  const ticket = tag('ticket');
  if (ticket) return { success: true, codigoRespuesta: '0', descripcionRespuesta: 'Ticket SUNAT recibido', ticket };

  const applicationResponse = tag('applicationResponse');
  const content = tag('content');
  const cdr = applicationResponse || content;
  const statusCode = tag('statusCode');
  const statusMessage = tag('statusMessage');
  if (cdr) {
    const parsed = parseSunatCdr(cdr);
    if (parsed) return parsed;
    // getStatus también usa content para mensajes de error, sin archivo CDR.
    if (!applicationResponse && statusCode && statusCode !== '0') {
      return { success: false, codigoRespuesta: statusCode, descripcionRespuesta: statusMessage || content };
    }
    return incompleteSunatCdr();
  }
  if (statusCode && statusCode !== '0') {
    return { success: false, codigoRespuesta: statusCode, descripcionRespuesta: statusMessage || 'Respuesta de estado SUNAT recibida' };
  }
  if (statusCode || statusMessage) return incompleteSunatCdr();
  return { success: false, codigoRespuesta: '98', descripcionRespuesta: 'Respuesta de SUNAT no reconocida' };
}
