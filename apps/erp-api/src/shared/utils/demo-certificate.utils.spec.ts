import {
  assertRuntimeDemoCertificateKeyPair,
  assertRuntimeDemoCertificateValidity,
  canUseRuntimeDemoCertificate,
  DEMO_PE_RUC,
  loadRuntimeDemoCertificate,
} from './demo-certificate.utils';
import * as forge from 'node-forge';
import { parseCertificateBuffer } from './certificate.utils';
import { verificarTitularidadCertificado } from './certificado-ruc-peru.util';

describe('demo-certificate.utils', () => {
  const pfxPassword = 'fixture-password';

  const createCertificate = (keyPair: forge.pki.KeyPair): forge.pki.Certificate => {
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keyPair.publicKey;
    certificate.serialNumber = Math.floor(Math.random() * 1_000_000).toString(16);
    certificate.validity.notBefore = new Date('2025-01-01T00:00:00.000Z');
    certificate.validity.notAfter = new Date('2035-01-01T00:00:00.000Z');
    const subject = [
      { name: 'countryName', value: 'PE' },
      { name: 'organizationName', value: `DEMO RUC ${DEMO_PE_RUC}` },
      { name: 'commonName', value: `DEMO ${DEMO_PE_RUC}` },
    ];
    certificate.setSubject(subject);
    certificate.setIssuer(subject);
    certificate.sign(keyPair.privateKey, forge.md.sha256.create());
    return certificate;
  };

  const serializePfx = (
    privateKey: forge.pki.PrivateKey | null,
    certificate: forge.pki.Certificate,
  ): Buffer => {
    const asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], pfxPassword, {
      algorithm: '3des',
    });
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
  };

  const demoPe = {
    is_demo: true,
    pais: 'PE',
    ruc: DEMO_PE_RUC,
    sunat_environment: 'homologacion',
    certificado_pfx: null,
    certificado_password: null,
  };

  it('habilita el fixture únicamente para una demo PE no productiva y vacía', () => {
    expect(canUseRuntimeDemoCertificate(demoPe)).toBe(true);
    expect(canUseRuntimeDemoCertificate({ ...demoPe, is_demo: false })).toBe(false);
    expect(canUseRuntimeDemoCertificate({ ...demoPe, pais: 'CO' })).toBe(false);
    expect(canUseRuntimeDemoCertificate({ ...demoPe, ruc: '20123456789' })).toBe(false);
    expect(
      canUseRuntimeDemoCertificate({ ...demoPe, sunat_environment: 'produccion' }),
    ).toBe(false);
    expect(
      canUseRuntimeDemoCertificate({ ...demoPe, sunat_environment: 'sandbox' }),
    ).toBe(false);
    expect(
      canUseRuntimeDemoCertificate({ ...demoPe, certificado_password: 'parcial' }),
    ).toBe(false);
  });

  it('resuelve y carga el PFX sintético empaquetado en el workspace', () => {
    const fixture = loadRuntimeDemoCertificate({ get: () => undefined });

    expect(fixture.pfxPath).toMatch(/[\\/]certs[\\/]demo\.pfx$/);
    expect(fixture.pfxBuffer.length).toBeGreaterThan(0);
    expect(fixture.pfxPassword).toBeTruthy();
    expect(fixture.validTo.getTime()).toBeGreaterThan(Date.now());
    const metadata = parseCertificateBuffer(fixture.pfxBuffer, fixture.pfxPassword);
    expect(verificarTitularidadCertificado(metadata.subject, DEMO_PE_RUC)).toEqual(
      expect.objectContaining({ coincide: true }),
    );
  });

  it('ignora DEMO_PFX_PASS para que Render no desincronice el fixture del build', () => {
    const fixture = loadRuntimeDemoCertificate({
      get: (key: string) => (key === 'DEMO_PFX_PASS' ? 'incorrecta' : undefined),
    });

    expect(fixture.pfxPassword).toBe('12345678910');
    expect(() =>
      parseCertificateBuffer(fixture.pfxBuffer, fixture.pfxPassword),
    ).not.toThrow();
  });

  it('rechaza un PKCS#12 que sólo contiene el certificado, sin clave privada', () => {
    const keyPair = forge.pki.rsa.generateKeyPair(1024);
    const certificateOnly = serializePfx(null, createCertificate(keyPair));

    expect(() =>
      assertRuntimeDemoCertificateKeyPair(certificateOnly, pfxPassword),
    ).toThrow(/clave privada/i);
  });

  it('rechaza un PKCS#12 cuya clave privada no corresponde al certificado', () => {
    const certificatePair = forge.pki.rsa.generateKeyPair(1024);
    const unrelatedPair = forge.pki.rsa.generateKeyPair(1024);
    const mismatched = serializePfx(
      unrelatedPair.privateKey,
      createCertificate(certificatePair),
    );

    expect(() =>
      assertRuntimeDemoCertificateKeyPair(mismatched, pfxPassword),
    ).toThrow(/no corresponde/i);
  });

  it('rechaza fixtures vencidos o aún no vigentes', () => {
    const now = new Date('2026-08-25T12:00:00.000Z');

    expect(() =>
      assertRuntimeDemoCertificateValidity(
        {
          validFrom: new Date('2020-01-01T00:00:00.000Z'),
          validTo: new Date('2026-08-25T11:59:59.000Z'),
        },
        now,
      ),
    ).toThrow(/vencido/i);
    expect(() =>
      assertRuntimeDemoCertificateValidity(
        {
          validFrom: new Date('2026-08-26T00:00:00.000Z'),
          validTo: new Date('2036-01-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toThrow(/todavía no está vigente/i);
  });
});
