import * as forge from 'node-forge';
import { CertificateValidityError, XmlSigner } from '@erp-suite/crypto';

describe('Vigencia del certificado en la firma fiscal', () => {
  const now = new Date('2026-09-05T12:00:00Z');
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const pfx = (from: string, to: string) => {
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(from);
    cert.validity.notAfter = new Date(to);
    const attrs = [{ name: 'commonName', value: 'TEST 20123456786' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(
      keys.privateKey, [cert], 'local-only', { algorithm: '3des' },
    )).getBytes(), 'binary');
  };

  beforeEach(() => { jest.useFakeTimers().setSystemTime(now); });
  afterEach(() => { jest.useRealTimers(); });

  it.each([
    ['2026-01-01', '2026-09-05T12:00:00Z', /vencido/],
    ['2026-09-06', '2027-01-01', /aún no está vigente/],
  ])('rechaza vigencia %s → %s sin fallback demo', (from, to, message) => {
    const options = { pfxBuffer: pfx(from as string, to as string), pfxPassword: 'local-only', allowDemoFallback: true };
    expect(() => new XmlSigner(options)).toThrow(CertificateValidityError);
    expect(() => new XmlSigner(options)).toThrow(message as RegExp);
  });

  it('acepta el inicio de vigencia y bloquea una firma si el certificado vence después de cargarlo', () => {
    const signer = new XmlSigner({
      pfxBuffer: pfx(now.toISOString(), '2026-09-06T12:00:00Z'),
      pfxPassword: 'local-only', allowDemoFallback: false,
    });
    const xml = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>F001-1</ID></Invoice>';
    expect(signer.signXml(xml)).toContain('ds:Signature');
    jest.setSystemTime(new Date('2026-09-06T12:00:00Z'));
    expect(() => signer.signXml(xml)).toThrow(/vencido/);
  });
});
