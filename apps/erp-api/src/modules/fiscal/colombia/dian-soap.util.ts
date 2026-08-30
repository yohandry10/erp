import * as crypto from 'crypto';
import * as forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';
import { parseColombiaNit } from '../../paises/initial-country';

export const DIAN_SOAP_NAMESPACES = {
  soap: 'http://www.w3.org/2003/05/soap-envelope',
  wcf: 'http://wcf.dian.colombia',
  wsa: 'http://www.w3.org/2005/08/addressing',
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  excC14n: 'http://www.w3.org/2001/10/xml-exc-c14n#',
} as const;

export const DIAN_SOAP_ACTION_BASE =
  'http://wcf.dian.colombia/IWcfDianCustomerServices';

export type DianSoapOperation =
  | 'SendTestSetAsync'
  | 'SendBillAsync'
  | 'SendBillSync'
  | 'GetStatus'
  | 'GetStatusZip'
  | 'GetStatusEvent'
  | 'GetXmlByDocumentKey'
  | 'GetNumberingRange'
  | 'SendEventUpdateStatus';

export interface DianSoapSigningConfig {
  certificatePfx: Buffer;
  certificatePassword: string;
  expectedNit: string;
}

export interface DianSoapEnvelopeInput extends DianSoapSigningConfig {
  endpoint: string;
  operation: DianSoapOperation;
  bodyXml: string;
  now?: Date;
  messageId?: string;
}

export interface ParsedDianSoap {
  root: unknown;
  /** XML original para validar estructura y namespaces antes de decisiones fiscales. */
  rawXml?: string;
  fault?: {
    code: string;
    reason: string;
    detail?: string;
  };
}

const MAX_SOAP_RESPONSE_BYTES = 10 * 1024 * 1024;
const WSSE_BASE64_ENCODING =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';

export function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function dianSoapAction(operation: DianSoapOperation): string {
  return `${DIAN_SOAP_ACTION_BASE}/${operation}`;
}

/**
 * Construye el mensaje WSHttpBinding que publica el WSDL oficial de DIAN.
 * La policy vigente es TransportBinding + X509 supporting token, Timestamp y
 * la cabecera WS-Addressing `To` firmada. No se inventa UsernameToken: el WSDL
 * exige el certificado X.509 del facturador.
 */
export function buildSignedDianSoapEnvelope(input: DianSoapEnvelopeInput): string {
  const endpoint = String(input.endpoint || '').trim();
  if (!/^https:\/\/vpfe(?:-hab)?\.dian\.gov\.co\/WcfDianCustomerServices\.svc$/u.test(endpoint)) {
    throw new Error('Endpoint SOAP DIAN no permitido');
  }
  if (!input.bodyXml || /<\?(?:xml)|<!DOCTYPE|<!ENTITY/i.test(input.bodyXml)) {
    throw new Error('Cuerpo SOAP DIAN inválido');
  }

  const material = readPfxSigningMaterial(input);
  const nonce = (input.messageId || crypto.randomUUID()).replace(/[^A-Za-z0-9]/g, '');
  const toId = `id-${nonce}`;
  const tokenId = `X509-${nonce}`;
  const timestampId = `TS-${nonce}`;
  const signatureId = `SIG-${nonce}`;
  const keyInfoId = `KI-${nonce}`;
  const action = dianSoapAction(input.operation);
  const createdAt = input.now ? new Date(input.now) : new Date();
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Fecha SOAP DIAN inválida');
  const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);

  // Al declarar aquí todos los prefijos incluidos, el octeto firmado coincide
  // exactamente con Exclusive C14N y no depende del contexto de un serializador.
  const canonicalTo = `<wsa:To xmlns:soap="${DIAN_SOAP_NAMESPACES.soap}" xmlns:wcf="${DIAN_SOAP_NAMESPACES.wcf}" xmlns:wsa="${DIAN_SOAP_NAMESPACES.wsa}" xmlns:wsu="${DIAN_SOAP_NAMESPACES.wsu}" wsu:Id="${toId}">${escapeXml(endpoint)}</wsa:To>`;
  const digestValue = crypto.createHash('sha256').update(canonicalTo, 'utf8').digest('base64');

  const signedInfo = `<ds:SignedInfo xmlns:ds="${DIAN_SOAP_NAMESPACES.ds}" xmlns:soap="${DIAN_SOAP_NAMESPACES.soap}" xmlns:wcf="${DIAN_SOAP_NAMESPACES.wcf}" xmlns:wsa="${DIAN_SOAP_NAMESPACES.wsa}"><ds:CanonicalizationMethod Algorithm="${DIAN_SOAP_NAMESPACES.excC14n}"><ec:InclusiveNamespaces xmlns:ec="${DIAN_SOAP_NAMESPACES.excC14n}" PrefixList="wsa soap wcf"></ec:InclusiveNamespaces></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod><ds:Reference URI="#${toId}"><ds:Transforms><ds:Transform Algorithm="${DIAN_SOAP_NAMESPACES.excC14n}"><ec:InclusiveNamespaces xmlns:ec="${DIAN_SOAP_NAMESPACES.excC14n}" PrefixList="soap wcf"></ec:InclusiveNamespaces></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod><ds:DigestValue>${digestValue}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
  const signatureValue = crypto
    .createSign('RSA-SHA256')
    .update(signedInfo, 'utf8')
    .end()
    .sign(material.privateKeyPem, 'base64');

  return `<soap:Envelope xmlns:soap="${DIAN_SOAP_NAMESPACES.soap}" xmlns:wcf="${DIAN_SOAP_NAMESPACES.wcf}"><soap:Header xmlns:wsa="${DIAN_SOAP_NAMESPACES.wsa}"><wsse:Security xmlns:wsse="${DIAN_SOAP_NAMESPACES.wsse}" xmlns:wsu="${DIAN_SOAP_NAMESPACES.wsu}" soap:mustUnderstand="true"><wsu:Timestamp wsu:Id="${timestampId}"><wsu:Created>${createdAt.toISOString()}</wsu:Created><wsu:Expires>${expiresAt.toISOString()}</wsu:Expires></wsu:Timestamp><wsse:BinarySecurityToken EncodingType="${WSSE_BASE64_ENCODING}" ValueType="http://docs.oasis-open.org/wss/oasis-wss-x509-token-profile-1.0#X509v3" wsu:Id="${tokenId}">${material.certificateDerBase64}</wsse:BinarySecurityToken><ds:Signature xmlns:ds="${DIAN_SOAP_NAMESPACES.ds}" Id="${signatureId}">${signedInfo}<ds:SignatureValue>${signatureValue}</ds:SignatureValue><ds:KeyInfo Id="${keyInfoId}"><wsse:SecurityTokenReference><wsse:KeyIdentifier EncodingType="${WSSE_BASE64_ENCODING}" ValueType="http://docs.oasis-open.org/wss/oasis-wss-x509-token-profile-1.1#ThumbprintSHA1">${material.thumbprintSha1}</wsse:KeyIdentifier></wsse:SecurityTokenReference></ds:KeyInfo></ds:Signature></wsse:Security><wsa:Action soap:mustUnderstand="true">${action}</wsa:Action><wsa:MessageID>urn:uuid:${escapeXml(input.messageId || crypto.randomUUID())}</wsa:MessageID><wsa:ReplyTo><wsa:Address>http://www.w3.org/2005/08/addressing/anonymous</wsa:Address></wsa:ReplyTo>${canonicalTo}</soap:Header><soap:Body>${input.bodyXml}</soap:Body></soap:Envelope>`;
}

export function parseDianSoapResponse(xml: unknown): ParsedDianSoap {
  const text = typeof xml === 'string' ? xml : Buffer.isBuffer(xml) ? xml.toString('utf8') : '';
  if (!text.trim()) throw new Error('DIAN devolvió una respuesta SOAP vacía');
  if (Buffer.byteLength(text, 'utf8') > MAX_SOAP_RESPONSE_BYTES) {
    throw new Error('Respuesta SOAP DIAN excede el límite permitido');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error('Respuesta SOAP DIAN contiene una declaración XML no permitida');
  }
  if (!text.includes(DIAN_SOAP_NAMESPACES.soap)) {
    throw new Error('La respuesta no usa SOAP 1.2');
  }

  let root: unknown;
  try {
    root = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: true,
      processEntities: false,
      isArray: (_name, path) => /(?:ErrorMessage|string|DianResponse|NumberRangeResponse)$/u.test(String(path)),
    }).parse(text);
  } catch {
    throw new Error('DIAN devolvió XML SOAP malformado');
  }

  const faultNode = findFirstByKey(root, 'Fault');
  if (faultNode && typeof faultNode === 'object') {
    const code = scalar(findFirstByKey(faultNode, 'Value')) || 'SOAP_FAULT';
    const reason = scalar(findFirstByKey(faultNode, 'Text')) || 'DIAN rechazó el mensaje SOAP';
    const detail = scalar(findFirstByKey(faultNode, 'Detail'));
    return { root, rawXml: text, fault: { code, reason, ...(detail ? { detail } : {}) } };
  }
  if (!findFirstByKey(root, 'Envelope') || !findFirstByKey(root, 'Body')) {
    throw new Error('La respuesta no es un sobre SOAP DIAN');
  }
  return { root, rawXml: text };
}

export function findFirstByKey(node: unknown, expectedKey: string): unknown {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstByKey(item, expectedKey);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = node as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, expectedKey)) return record[expectedKey];
  for (const value of Object.values(record)) {
    const found = findFirstByKey(value, expectedKey);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function findAllByKey(node: unknown, expectedKey: string, output: unknown[] = []): unknown[] {
  if (!node || typeof node !== 'object') return output;
  if (Array.isArray(node)) {
    node.forEach((item) => findAllByKey(item, expectedKey, output));
    return output;
  }
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === expectedKey) output.push(value);
    findAllByKey(value, expectedKey, output);
  }
  return output;
}

export function scalar(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record['#text'] != null) return scalar(record['#text']);
    return Object.values(record).map(scalar).filter(Boolean).join('; ');
  }
  return String(value).trim();
}

function readPfxSigningMaterial(config: DianSoapSigningConfig): {
  privateKeyPem: string;
  certificateDerBase64: string;
  thumbprintSha1: string;
} {
  if (!Buffer.isBuffer(config.certificatePfx) || config.certificatePfx.length === 0) {
    throw new Error('DIAN requiere certificado PFX para WS-Security');
  }
  const expectedNit = parseColombiaNit(config.expectedNit);
  if (!expectedNit) {
    throw new Error('NIT esperado inválido para el certificado DIAN');
  }

  let certificate: forge.pki.Certificate | undefined;
  let privateKey: forge.pki.PrivateKey | undefined;
  try {
    const p12Asn1 = forge.asn1.fromDer(config.certificatePfx.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, config.certificatePassword || '');
    const certificates = (p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ] || []).map((bag) => bag.cert).filter((item): item is forge.pki.Certificate => Boolean(item));
    const privateKeys = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] || []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
    ].map((bag) => bag.key).filter((item): item is forge.pki.PrivateKey => Boolean(item));

    for (const candidateKey of privateKeys) {
      const key = candidateKey as forge.pki.rsa.PrivateKey;
      const matchingCertificate = certificates.find((candidateCertificate) => {
        const publicKey = candidateCertificate.publicKey as forge.pki.rsa.PublicKey;
        return Boolean(key.n && key.e && publicKey.n && publicKey.e &&
          key.n.compareTo(publicKey.n) === 0 && key.e.compareTo(publicKey.e) === 0);
      });
      if (matchingCertificate) {
        privateKey = candidateKey;
        certificate = matchingCertificate;
        break;
      }
    }
  } catch {
    throw new Error('No se pudo abrir el certificado PFX de transporte DIAN');
  }
  if (!certificate || !privateKey) {
    throw new Error('El PFX DIAN no contiene certificado y clave privada');
  }
  const now = Date.now();
  if (certificate.validity.notBefore.getTime() > now || certificate.validity.notAfter.getTime() < now) {
    throw new Error('El certificado de transporte DIAN no está vigente');
  }
  const subjectValues = certificate.subject.attributes
    .map((attribute) => String(attribute.value ?? '').trim())
    .filter(Boolean);
  const subjectMatches = subjectValues.some((value) => {
    const candidates = value.match(/\d{9,10}(?:-?\d)?/g) ?? [];
    return candidates.some((candidate) => {
      const parsed = parseColombiaNit(candidate);
      if (parsed) return parsed.base === expectedNit.base;
      return candidate.replace(/\D/g, '') === expectedNit.base;
    });
  });
  if (!subjectMatches) {
    throw new Error('El certificado de transporte DIAN no pertenece al NIT configurado');
  }

  const certificateAsn1 = forge.pki.certificateToAsn1(certificate);
  const certificateDer = Buffer.from(forge.asn1.toDer(certificateAsn1).getBytes(), 'binary');
  return {
    privateKeyPem: forge.pki.privateKeyToPem(privateKey),
    certificateDerBase64: certificateDer.toString('base64'),
    thumbprintSha1: crypto.createHash('sha1').update(certificateDer).digest('base64'),
  };
}
