import * as forge from 'node-forge';

export interface ParsedCertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
}

function unwrapSerializedNodeBuffer(buffer: Buffer): Buffer {
  // Versiones anteriores enviaban un Buffer directamente a postgrest-js. Al
  // serializar JSON terminaba persistido como {"type":"Buffer","data":[...]}
  // dentro de bytea. Lo reconocemos para no invalidar certificados existentes.
  if (buffer[0] !== 0x7b) {
    return buffer;
  }

  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (parsed?.type === 'Buffer' && Array.isArray(parsed.data)) {
      return Buffer.from(parsed.data);
    }
  } catch {
    // No era JSON: devolver los bytes originales.
  }

  return buffer;
}

/** Serialización explícita aceptada por PostgreSQL/PostgREST para columnas bytea. */
export function toPostgresBytea(buffer: Buffer): string {
  return `\\x${buffer.toString('hex')}`;
}

/**
 * Normalizes the value retrieved from Supabase (or any source) to a Buffer.
 * Handles Buffer, base64 strings, hex strings, ArrayBuffers and JSON buffers.
 */
export function normalizeCertificateInput(input: any): Buffer | null {
  if (!input) {
    return null;
  }

  if (Buffer.isBuffer(input)) {
    return unwrapSerializedNodeBuffer(input);
  }

  if (typeof input === 'string') {
    if (!input.length) {
      return null;
    }

    try {
      if (input.startsWith('\\x')) {
        return unwrapSerializedNodeBuffer(Buffer.from(input.slice(2), 'hex'));
      }
      return unwrapSerializedNodeBuffer(Buffer.from(input, 'base64'));
    } catch {
      return null;
    }
  }

  if (input?.type === 'Buffer' && Array.isArray(input.data)) {
    return Buffer.from(input.data);
  }

  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }

  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer);
  }

  if (typeof input === 'object') {
    try {
      if (typeof input.base64 === 'string') {
        return Buffer.from(input.base64, 'base64');
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parses a PKCS#12 buffer and returns certificate metadata. Throws if the certificate
 * cannot be decoded (invalid password/corrupted data).
 */
export function parseCertificateBuffer(
  pfxBuffer: Buffer,
  password: string,
): ParsedCertificateInfo {
  if (!pfxBuffer || !pfxBuffer.length) {
    throw new Error('El certificado está vacío');
  }

  try {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '');

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];

    if (!certBag || !certBag[0] || !certBag[0].cert) {
      throw new Error('No se pudo extraer el certificado del archivo PFX');
    }

    const cert = certBag[0].cert;

    return {
      subject: cert.subject?.attributes?.map(attr => `${attr.name}=${attr.value}`).join(', ') || 'N/A',
      issuer: cert.issuer?.attributes?.map(attr => `${attr.name}=${attr.value}`).join(', ') || 'N/A',
      serialNumber: cert.serialNumber || 'N/A',
      validFrom: cert.validity?.notBefore ? new Date(cert.validity.notBefore) : new Date(),
      validTo: cert.validity?.notAfter ? new Date(cert.validity.notAfter) : new Date(),
    };
  } catch (error: any) {
    if (error?.message?.includes('Password') || error?.message?.includes('MAC')) {
      throw new Error('La contraseña del certificado es incorrecta');
    }

    throw new Error(error?.message || 'No se pudo leer el certificado digital');
  }
}
