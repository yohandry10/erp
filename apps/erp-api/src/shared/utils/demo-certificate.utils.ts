import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as forge from 'node-forge';
import * as path from 'path';
import { parseCertificateBuffer } from './certificate.utils';
import { verificarTitularidadCertificado } from './certificado-ruc-peru.util';

const DEFAULT_DEMO_PFX_PATH = 'certs/demo.pfx';
// Credencial interna del fixture generado durante el build. No es un secreto
// operativo ni debe poder desincronizarse mediante variables de Render.
export const DEMO_PFX_PASSWORD = '12345678910';
export const DEMO_PE_RUC = '20123456786';

export interface DemoCertificateContext {
  is_demo?: boolean | null;
  pais?: string | null;
  ruc?: string | null;
  sunat_environment?: string | null;
  certificado_pfx?: unknown;
  certificado_password?: unknown;
}

export interface RuntimeDemoCertificate {
  pfxPath: string;
  pfxPassword: string;
  pfxBuffer: Buffer;
  validFrom: Date;
  validTo: Date;
}

/**
 * El fixture fiscal sólo pertenece a la experiencia demo peruana. Una cuenta
 * real, una configuración parcial o cualquier entorno productivo deben seguir
 * fallando cerrado y exigir el certificado del contribuyente.
 */
export function canUseRuntimeDemoCertificate(
  context: DemoCertificateContext | null | undefined,
): boolean {
  const country = String(context?.pais ?? '').trim().toUpperCase();
  const ruc = String(context?.ruc ?? '').trim();
  const environment = String(context?.sunat_environment ?? '').trim().toLowerCase();

  return (
    context?.is_demo === true &&
    country === 'PE' &&
    ruc === DEMO_PE_RUC &&
    environment === 'homologacion' &&
    !context?.certificado_pfx &&
    !context?.certificado_password
  );
}

export function resolveRuntimeDemoCertificatePath(configuredPath: string): string | null {
  if (path.isAbsolute(configuredPath)) {
    return fs.existsSync(configuredPath) ? configuredPath : null;
  }

  const candidates = [
    path.resolve(process.cwd(), configuredPath),
    path.resolve(process.cwd(), '..', '..', configuredPath),
    path.resolve(__dirname, '..', '..', '..', '..', '..', configuredPath),
    path.resolve(__dirname, '..', '..', '..', '..', '..', '..', configuredPath),
  ];

  return [...new Set(candidates)].find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function assertRuntimeDemoCertificateValidity(
  validity: { validFrom: Date; validTo: Date },
  now = new Date(),
): void {
  if (validity.validFrom.getTime() > now.getTime()) {
    throw new Error('El certificado fiscal simulado todavía no está vigente');
  }
  if (validity.validTo.getTime() <= now.getTime()) {
    throw new Error('El certificado fiscal simulado está vencido');
  }
}

/**
 * El preflight debe demostrar que el contenedor PKCS#12 sirve realmente para
 * firmar: no basta con que incluya un certBag legible. Comprueba la presencia
 * de la clave privada y verifica criptográficamente que corresponde a la clave
 * pública del certificado.
 */
export function assertRuntimeDemoCertificateKeyPair(
  pfxBuffer: Buffer,
  pfxPassword: string,
): void {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pfxPassword || '');
  const certificate = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ]?.[0]?.cert;
  const privateKey =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]?.[0]?.key ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;

  if (!certificate || !privateKey) {
    throw new Error('El certificado fiscal simulado debe incluir certificado y clave privada');
  }

  const probe = 'erp-demo-runtime-certificate-key-pair';
  const signingDigest = forge.md.sha256.create();
  signingDigest.update(probe, 'utf8');
  const signature = (privateKey as forge.pki.rsa.PrivateKey).sign(signingDigest);
  const verificationDigest = forge.md.sha256.create();
  verificationDigest.update(probe, 'utf8');
  let keyMatches = false;
  try {
    keyMatches = (certificate.publicKey as forge.pki.rsa.PublicKey).verify(
      verificationDigest.digest().bytes(),
      signature,
    );
  } catch {
    // Una firma producida con otra clave puede fallar durante el decode PKCS#1
    // antes de devolver false. Para el contrato del preflight ambos resultados
    // significan exactamente lo mismo: el par no corresponde.
    keyMatches = false;
  }

  if (!keyMatches) {
    throw new Error(
      'La clave privada del certificado fiscal simulado no corresponde al certificado',
    );
  }
}

/** Carga el PFX sintético generado durante el build; nunca consulta PFX_PATH. */
export function loadRuntimeDemoCertificate(
  configService: Pick<ConfigService, 'get'>,
): RuntimeDemoCertificate {
  const configuredPath =
    configService.get<string>('DEMO_PFX_PATH')?.trim() || DEFAULT_DEMO_PFX_PATH;
  const pfxPassword = DEMO_PFX_PASSWORD;
  const pfxPath = resolveRuntimeDemoCertificatePath(configuredPath);

  if (!pfxPath) {
    throw new Error(`No se encontró el certificado fiscal simulado: ${configuredPath}`);
  }

  const pfxBuffer = fs.readFileSync(pfxPath);
  if (!pfxBuffer.length) {
    throw new Error('El certificado fiscal simulado está vacío');
  }

  const metadata = parseCertificateBuffer(pfxBuffer, pfxPassword);
  assertRuntimeDemoCertificateKeyPair(pfxBuffer, pfxPassword);
  assertRuntimeDemoCertificateValidity(metadata);
  const ownership = verificarTitularidadCertificado(metadata.subject, DEMO_PE_RUC);
  if (!ownership.coincide) {
    throw new Error(
      `El certificado fiscal simulado no pertenece al RUC demo ${DEMO_PE_RUC}: ${ownership.error}`,
    );
  }

  return {
    pfxPath,
    pfxPassword,
    pfxBuffer,
    validFrom: metadata.validFrom,
    validTo: metadata.validTo,
  };
}
