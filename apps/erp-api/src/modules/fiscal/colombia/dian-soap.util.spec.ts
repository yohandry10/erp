import * as crypto from 'crypto';
import * as forge from 'node-forge';
import {
  buildSignedDianSoapEnvelope,
  DIAN_SOAP_NAMESPACES,
  parseDianSoapResponse,
} from './dian-soap.util';

const NIT = '8001972684';

function certificateFixture(subjectNit = NIT): {
  pfx: Buffer;
  publicKeyPem: string;
  certificateDer: Buffer;
} {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: `NIT ${subjectNit}` }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'secret', { algorithm: '3des' });
  return {
    pfx: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'),
    publicKeyPem: forge.pki.publicKeyToPem(keys.publicKey),
    certificateDer: Buffer.from(
      forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
      'binary',
    ),
  };
}

describe('DIAN SOAP WS-Security', () => {
  it('construye SOAP 1.2 con WS-Addressing, Timestamp, X509 y firma RSA-SHA256 verificable', () => {
    const certificate = certificateFixture();
    const envelope = buildSignedDianSoapEnvelope({
      endpoint: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      operation: 'GetStatus',
      bodyXml: '<wcf:GetStatus><wcf:trackId>abc</wcf:trackId></wcf:GetStatus>',
      certificatePfx: certificate.pfx,
      certificatePassword: 'secret',
      expectedNit: NIT,
      now: new Date('2026-08-29T12:00:00.000Z'),
      messageId: '11111111-2222-3333-4444-555555555555',
    });

    expect(envelope).toContain(`xmlns:soap="${DIAN_SOAP_NAMESPACES.soap}"`);
    expect(envelope).toContain('http://wcf.dian.colombia/IWcfDianCustomerServices/GetStatus');
    expect(envelope).toContain('<wsu:Created>2026-08-29T12:00:00.000Z</wsu:Created>');
    expect(envelope).toContain('<wsu:Expires>2026-08-29T12:05:00.000Z</wsu:Expires>');
    expect(envelope).toContain('#ThumbprintSHA1');
    expect(envelope).toContain('xmldsig-more#rsa-sha256');
    expect(envelope).toContain('xmlenc#sha256');
    expect(envelope).not.toContain('rsa-sha1');
    expect(envelope).not.toMatch(/<ds:DigestMethod[^>]+(?:#|\/)sha1["']/iu);
    const expectedThumbprint = Buffer.from(
      new crypto.X509Certificate(certificate.certificateDer).fingerprint.replace(/:/gu, ''),
      'hex',
    ).toString('base64');
    expect(envelope).toContain(`>${expectedThumbprint}</wsse:KeyIdentifier>`);

    const signedInfo = envelope.match(/<ds:SignedInfo\b[\s\S]*?<\/ds:SignedInfo>/u)?.[0];
    const signatureValue = envelope.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/u)?.[1];
    expect(signedInfo).toBeTruthy();
    expect(signatureValue).toBeTruthy();
    expect(crypto.verify(
      'RSA-SHA256',
      Buffer.from(signedInfo!, 'utf8'),
      certificate.publicKeyPem,
      Buffer.from(signatureValue!, 'base64'),
    )).toBe(true);
  });

  it('rechaza certificado que no pertenece al NIT antes de construir el mensaje', () => {
    const certificate = certificateFixture('8000000001');
    expect(() => buildSignedDianSoapEnvelope({
      endpoint: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      operation: 'GetStatus',
      bodyXml: '<wcf:GetStatus></wcf:GetStatus>',
      certificatePfx: certificate.pfx,
      certificatePassword: 'secret',
      expectedNit: NIT,
    })).toThrow('no pertenece al NIT');
  });

  it('acepta un NIT canónico de base de diez dígitos más DV', () => {
    const base = '1234567890';
    const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    const sum = base.split('').reverse()
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const dv = remainder === 0 || remainder === 1 ? remainder : 11 - remainder;
    const compactNit = `${base}${dv}`;
    const certificate = certificateFixture(`${base}-${dv}`);

    expect(() => buildSignedDianSoapEnvelope({
      endpoint: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      operation: 'GetStatus',
      bodyXml: '<wcf:GetStatus><wcf:trackId>abc</wcf:trackId></wcf:GetStatus>',
      certificatePfx: certificate.pfx,
      certificatePassword: 'secret',
      expectedNit: compactNit,
    })).not.toThrow();
  });

  it('rechaza endpoint alterno y cuerpos con declaraciones peligrosas', () => {
    const certificate = certificateFixture();
    const common = {
      operation: 'GetStatus' as const,
      certificatePfx: certificate.pfx,
      certificatePassword: 'secret',
      expectedNit: NIT,
    };
    expect(() => buildSignedDianSoapEnvelope({
      ...common,
      endpoint: 'https://evil.example/WcfDianCustomerServices.svc',
      bodyXml: '<wcf:GetStatus></wcf:GetStatus>',
    })).toThrow('no permitido');
    expect(() => buildSignedDianSoapEnvelope({
      ...common,
      endpoint: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
      bodyXml: '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x>&y;</x>',
    })).toThrow('Cuerpo SOAP DIAN inválido');
  });

  it('parsea SOAP Fault y rechaza XML que no sea SOAP o contenga entidades', () => {
    expect(parseDianSoapResponse(
      '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><s:Fault><s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text>InvalidSecurity</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>',
    )).toEqual(expect.objectContaining({
      fault: expect.objectContaining({ code: 's:Sender', reason: 'InvalidSecurity' }),
    }));
    expect(() => parseDianSoapResponse('<html>proxy</html>')).toThrow('SOAP 1.2');
    expect(() => parseDianSoapResponse('<!DOCTYPE x><Envelope><Body /></Envelope>')).toThrow('no permitida');
  });
});
