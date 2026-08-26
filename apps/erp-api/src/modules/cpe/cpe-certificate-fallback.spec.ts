import * as forge from 'node-forge';
import { XmlSigner } from '@erp-suite/crypto';

/**
 * El camino que recorre el certificado del cliente: se guarda cifrado, se
 * descifra, se carga y se firma con el. Lo que se prueba aqui es que cuando algo
 * de esa cadena falla, el sistema lo diga en vez de seguir firmando con otra
 * cosa.
 */
describe('XmlSigner · certificado del cliente', () => {
  const CLAVE = 'clave-correcta';
  const RUC_EMPRESA = '20601234565';

  const fabricarPfx = (
    ruc: string,
    clave: string,
    identityOverrides: {
      issuerRuc?: string;
      serialNumber?: string;
    } = {},
  ): Buffer => {
    const par = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = par.publicKey;
    cert.serialNumber = identityOverrides.serialNumber ?? '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);
    const attrs = [
      { name: 'commonName', value: `EMPRESA ${ruc}` },
      { type: '2.5.4.5', value: ruc },
    ];
    const issuerRuc = identityOverrides.issuerRuc ?? ruc;
    cert.setSubject(attrs);
    cert.setIssuer([
      { name: 'commonName', value: `EMISOR ${issuerRuc}` },
      { type: '2.5.4.5', value: issuerRuc },
    ]);
    cert.sign(par.privateKey, forge.md.sha256.create());
    const p12 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], clave, {
      algorithm: '3des',
    });
    return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
  };

  let pfxEmpresa: Buffer;

  beforeAll(() => {
    pfxEmpresa = fabricarPfx(RUC_EMPRESA, CLAVE);
  });

  it('firma con el certificado del cliente cuando la clave es correcta', () => {
    const signer = new XmlSigner({
      pfxBuffer: pfxEmpresa,
      pfxPassword: CLAVE,
      expectedRuc: RUC_EMPRESA,
      enforceRucInCertificate: true,
    });

    expect(signer.getCertificateInfo()).toMatchObject({ demoMode: false });
  });

  it('con la clave equivocada falla, no firma con un certificado inventado', () => {
    // Si cayera a modo demo, el comprobante saldria firmado con un autofirmado
    // y el cliente creeria que uso el suyo.
    expect(
      () =>
        new XmlSigner({
          pfxBuffer: pfxEmpresa,
          pfxPassword: 'clave-equivocada',
          expectedRuc: RUC_EMPRESA,
          enforceRucInCertificate: true,
        }),
    ).toThrow();
  });

  it('con el certificado corrupto falla, no lo sustituye por uno de demo', () => {
    expect(
      () =>
        new XmlSigner({
          pfxBuffer: Buffer.from('esto no es un pkcs12'),
          pfxPassword: CLAVE,
          expectedRuc: RUC_EMPRESA,
          enforceRucInCertificate: true,
        }),
    ).toThrow();
  });

  it('en produccion el certificado de otro RUC se rechaza de verdad', () => {
    // El guardia de titularidad no sirve de nada si su excepcion la absorbe un
    // fallback: acabaria firmando en demo justo cuando debia bloquear.
    const ajeno = fabricarPfx('20600900006', CLAVE);

    expect(
      () =>
        new XmlSigner({
          pfxBuffer: ajeno,
          pfxPassword: CLAVE,
          expectedRuc: RUC_EMPRESA,
          enforceRucInCertificate: true,
        }),
    ).toThrow(/no contiene el RUC esperado/i);
  });

  it('rechaza un certificado cuando el RUC esperado aparece solo en el issuer', () => {
    const ajenoConIssuerDelTenant = fabricarPfx('20600900006', CLAVE, {
      issuerRuc: RUC_EMPRESA,
    });

    expect(
      () =>
        new XmlSigner({
          pfxBuffer: ajenoConIssuerDelTenant,
          pfxPassword: CLAVE,
          expectedRuc: RUC_EMPRESA,
          enforceRucInCertificate: true,
        }),
    ).toThrow(/no contiene el RUC esperado/i);
  });

  it('rechaza un certificado cuando el RUC esperado aparece solo en el serial del certificado', () => {
    const ajenoConSerialDelTenant = fabricarPfx('20600900006', CLAVE, {
      serialNumber: RUC_EMPRESA,
    });

    expect(
      () =>
        new XmlSigner({
          pfxBuffer: ajenoConSerialDelTenant,
          pfxPassword: CLAVE,
          expectedRuc: RUC_EMPRESA,
          enforceRucInCertificate: true,
        }),
    ).toThrow(/no contiene el RUC esperado/i);
  });

  it('el modo demo sigue disponible, pero solo si se pide a proposito', () => {
    const signer = new XmlSigner({
      pfxBuffer: Buffer.from('roto'),
      pfxPassword: 'x',
      allowDemoFallback: true,
    });

    expect(signer.getCertificateInfo()).toMatchObject({ demoMode: true });
  });
});
