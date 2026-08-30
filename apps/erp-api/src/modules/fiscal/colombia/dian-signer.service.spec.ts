import { DOMParser } from '@xmldom/xmldom';
import { createHash, X509Certificate } from 'crypto';
import * as fs from 'fs';
import * as forge from 'node-forge';
import * as os from 'os';
import * as path from 'path';
import { SignedXml } from 'xml-crypto';
import {
  DIAN_SIGNATURE_POLICY_SHA256,
  DIAN_SIGNATURE_POLICY_URL,
  DianSignerService,
} from './dian-signer.service';
import { DianXmlBuilderService } from './dian-xml-builder.service';

const SIGNING_TIME = new Date('2026-08-29T15:30:00.000Z');
const PASSWORD = 'test-password';

interface AuthorityFixture {
  leafP12: Buffer;
  leafSpkiSha256: string;
  intermediatePem: string;
  rootPem: string;
}

function spkiSha256(certificate: forge.pki.Certificate): string {
  const x509 = new X509Certificate(forge.pki.certificateToPem(certificate));
  const spki = x509.publicKey.export({ type: 'spki', format: 'der' });
  if (!Buffer.isBuffer(spki)) throw new Error('TEST_SPKI_EXPORT_INVALID');
  return createHash('sha256').update(spki).digest('hex');
}

function signedLeafSpkiSha256(xml: string): string {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  const node = document.getElementsByTagNameNS(
    'http://www.w3.org/2000/09/xmldsig#', 'X509Certificate',
  )[0];
  const x509 = new X509Certificate(Buffer.from(node.textContent?.replace(/\s/g, '') ?? '', 'base64'));
  const spki = x509.publicKey.export({ type: 'spki', format: 'der' });
  if (!Buffer.isBuffer(spki)) throw new Error('TEST_SPKI_EXPORT_INVALID');
  return createHash('sha256').update(spki).digest('hex');
}

function authorityFixture(): AuthorityFixture {
  const notBefore = new Date('2020-01-01T00:00:00Z');
  const notAfter = new Date('2040-01-01T00:00:00Z');
  const rootKeys = forge.pki.rsa.generateKeyPair(2048);
  const root = forge.pki.createCertificate();
  root.publicKey = rootKeys.publicKey;
  root.serialNumber = 'a001';
  root.validity.notBefore = notBefore;
  root.validity.notAfter = notAfter;
  root.setSubject([{ name: 'commonName', value: 'DIAN Test Root Authority' }]);
  root.setIssuer(root.subject.attributes);
  root.setExtensions([
    { name: 'basicConstraints', critical: true, cA: true, pathLenConstraint: 1 },
    { name: 'keyUsage', critical: true, keyCertSign: true, cRLSign: true },
  ]);
  root.sign(rootKeys.privateKey, forge.md.sha256.create());

  const intermediateKeys = forge.pki.rsa.generateKeyPair(2048);
  const intermediate = forge.pki.createCertificate();
  intermediate.publicKey = intermediateKeys.publicKey;
  intermediate.serialNumber = 'a002';
  intermediate.validity.notBefore = notBefore;
  intermediate.validity.notAfter = notAfter;
  intermediate.setSubject([{ name: 'commonName', value: 'DIAN Test Intermediate Authority' }]);
  intermediate.setIssuer(root.subject.attributes);
  intermediate.setExtensions([
    { name: 'basicConstraints', critical: true, cA: true, pathLenConstraint: 0 },
    { name: 'keyUsage', critical: true, keyCertSign: true, cRLSign: true },
  ]);
  intermediate.sign(rootKeys.privateKey, forge.md.sha256.create());

  const leafKeys = forge.pki.rsa.generateKeyPair(2048);
  const leaf = forge.pki.createCertificate();
  leaf.publicKey = leafKeys.publicKey;
  leaf.serialNumber = 'a003';
  leaf.validity.notBefore = notBefore;
  leaf.validity.notAfter = notAfter;
  leaf.setSubject([{ name: 'commonName', value: 'DIAN Response Signer Test' }]);
  leaf.setIssuer(intermediate.subject.attributes);
  leaf.setExtensions([
    { name: 'basicConstraints', critical: true, cA: false },
    { name: 'keyUsage', critical: true, digitalSignature: true, nonRepudiation: true },
  ]);
  leaf.sign(intermediateKeys.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(leafKeys.privateKey, [leaf], PASSWORD, {
    algorithm: '3des', friendlyName: 'DIAN authority leaf test',
  });
  return {
    leafP12: Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'),
    leafSpkiSha256: spkiSha256(leaf),
    intermediatePem: forge.pki.certificateToPem(intermediate),
    rootPem: forge.pki.certificateToPem(root),
  };
}

function testP12(options: { expired?: boolean; keyUsage?: boolean; sha1?: boolean } = {}): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '1234';
  certificate.validity.notBefore = options.expired
    ? new Date('2020-01-01T00:00:00Z')
    : new Date('2026-01-01T00:00:00Z');
  certificate.validity.notAfter = options.expired
    ? new Date('2021-01-01T00:00:00Z')
    : new Date('2027-01-01T00:00:00Z');
  const attributes = [
    { name: 'commonName', value: '900123456-7 DEMO DIAN' },
    { name: 'organizationName', value: 'ERP Colombia Test' },
    { name: 'countryName', value: 'CO' },
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  if (options.keyUsage !== false) {
    certificate.setExtensions([{
      name: 'keyUsage', critical: true, digitalSignature: true, nonRepudiation: true,
    }]);
  }
  certificate.sign(keys.privateKey, options.sha1 ? forge.md.sha1.create() : forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], PASSWORD, {
    algorithm: '3des', friendlyName: 'DIAN test',
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

function invoiceXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:ID>SETP990000001</cbc:ID>
  <cbc:PayableAmount currencyID="COP">119000.00</cbc:PayableAmount>
</Invoice>`;
}

describe('DianSignerService XAdES-EPES', () => {
  let service: DianSignerService;
  let p12: Buffer;
  let authority: AuthorityFixture;
  let authorityBundlePath: string;
  let tempDirectory: string;

  beforeAll(() => {
    service = new DianSignerService();
    p12 = testP12();
    authority = authorityFixture();
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dian-authority-'));
    authorityBundlePath = path.join(tempDirectory, 'authority-ca.pem');
    fs.writeFileSync(
      authorityBundlePath,
      `${authority.intermediatePem}\n${authority.rootPem}`,
      'utf8',
    );
  });

  afterAll(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('firma con tres referencias C14N y se verifica criptográficamente', async () => {
    const signed = await service.firmarXML(invoiceXml(), {
      certificateBuffer: p12,
      certificatePassword: PASSWORD,
      signatureId: 'xmldsig-dian-vector',
      signingTime: SIGNING_TIME,
    });
    expect(await service.verificarFirma(signed)).toBe(true);

    const document = new DOMParser().parseFromString(signed, 'text/xml');
    const signature = document.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#', 'Signature',
    )[0];
    expect((signature.parentNode as Element | null)?.localName).toBe('ExtensionContent');
    expect(signature.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#', 'Reference',
    )).toHaveLength(3);
    expect(signed).toContain('http://uri.etsi.org/01903#SignedProperties');
    expect(signed).toContain(DIAN_SIGNATURE_POLICY_URL);
    expect(signed).toContain(DIAN_SIGNATURE_POLICY_SHA256);
    expect(signed).toContain('<xades:SigningTime>2026-08-29T10:30:00-05:00</xades:SigningTime>');
    expect(signed).toContain('<xades:ClaimedRole>supplier</xades:ClaimedRole>');

    const certificateNode = signature.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#', 'X509Certificate',
    )[0];
    const certificatePem = `-----BEGIN CERTIFICATE-----\n${certificateNode.textContent}\n-----END CERTIFICATE-----`;
    const independent = new SignedXml({ publicCert: certificatePem });
    independent.loadSignature(signature);
    expect(independent.checkSignature(signed)).toBe(true);
  });

  it('firma el UBL DIAN real sin exponer Software PIN ni TechnicalKey', async () => {
    const xml = await new DianXmlBuilderService().generarFacturaElectronica({
      id: 'cpe-co-signed', tipoDocumento: '01', serie: 'FE', numero: '9',
      fechaEmision: '2026-08-29T10:15:00-05:00', moneda: 'COP',
      emisor: {
        tipoDocumento: '31', numeroDocumento: '9001234568', razonSocial: 'Emisor CO',
        direccion: 'Carrera 7 # 72-41', codigoUbigeo: '11001', ciudad: 'Bogotá D.C.',
        departamento: 'Bogotá D.C.', codigoDepartamento: '11',
        regimenFiscal: 'O-13', tipoContribuyente: '1',
      },
      receptor: {
        tipoDocumento: '13', numeroDocumento: '1020304050', razonSocial: 'Cliente CO',
        dianTaxProfile: {
          profile: 'CONSUMIDOR_FINAL', taxLevelCode: 'R-99-PN', taxLevelListName: '49',
          taxSchemeId: 'ZY', taxSchemeName: 'No causa',
        },
      },
      subtotal: 200, totalImpuestos: 38, importeTotal: 238, tasaImpuesto: 0.19,
      formaPago: 'CONTADO', medioPago: '10',
      items: [{
        descripcion: 'Servicio', cantidad: 2, precioUnitario: 100, valorVenta: 200,
        igv: 38, tasaIgv: 19, unidadMedida: 'NIU', codigoProducto: 'SRV-CO-01',
      }],
      dianContext: {
        environmentId: '2', software: { id: 'software-id', pin: 'software-pin-secret' },
        authorization: {
          number: '18760000001', prefix: 'FE', rangeFrom: 1, rangeTo: 5000,
          validFrom: '2026-01-01', validTo: '2027-01-01',
          technicalKey: 'technical-key-secret',
        },
        taxes: { iva: 38, inc: 0, ica: 0 },
      },
    });
    expect(xml).not.toContain('software-pin-secret');
    expect(xml).not.toContain('technical-key-secret');

    const signed = await service.firmarXML(xml, {
      certificateBuffer: p12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    });
    expect(await service.verificarFirma(signed)).toBe(true);
    expect(signed).not.toContain('software-pin-secret');
    expect(signed).not.toContain('technical-key-secret');

    const document = new DOMParser().parseFromString(signed, 'text/xml');
    const extensionContents = document.getElementsByTagNameNS(
      'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'ExtensionContent',
    );
    expect(extensionContents[0].getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#', 'Signature',
    )).toHaveLength(1);
  });

  it('firma ApplicationResponse sin reemplazar DianExtensions', async () => {
    const xml = new DianXmlBuilderService().generarApplicationResponse({
      id: 'AR0001', issueDate: '2026-08-29', issueTime: '11:30:00-05:00',
      environmentId: '2', softwareId: 'software-id', softwarePin: 'software-pin-secret',
      sender: { type: '31', number: '9001234568', name: 'Emisor CO' },
      receiver: { type: '31', number: '8001972684', name: 'DIAN' },
      responseCode: '030', responseDescription: 'Acuse de recibo',
      referencedDocumentId: 'FV125', referencedDocumentTypeCode: '01',
      referencedDocumentUuid: 'a'.repeat(96),
      issuerPerson: {
        identity: { type: '13', number: '1020304050' },
        firstName: 'Andrea', familyName: 'Gómez', jobTitle: 'Analista',
        organizationDepartment: 'Compras',
      },
    });
    await expect(service.firmarXML(xml, {
      certificateBuffer: p12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    })).rejects.toThrow('DIAN_APPLICATION_RESPONSE_SIGNER_ROLE_REQUIRED');

    const signed = await service.firmarXML(xml, {
      certificateBuffer: p12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
      signerRole: 'supplier',
    });
    expect(await service.verificarFirma(signed)).toBe(true);
    expect(signed).toContain('<sts:DianExtensions>');
    expect(signed).not.toContain('software-pin-secret');
    expect(signed).toContain('<xades:ClaimedRole>supplier</xades:ClaimedRole>');

    const document = new DOMParser().parseFromString(signed, 'text/xml');
    const extensionContents = document.getElementsByTagNameNS(
      'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'ExtensionContent',
    );
    expect(extensionContents).toHaveLength(2);
    expect(extensionContents[0].getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#', 'Signature',
    )).toHaveLength(1);
    expect(extensionContents[1].getElementsByTagNameNS(
      'dian:gov:co:facturaelectronica:Structures-2-1', 'DianExtensions',
    )).toHaveLength(1);
  });

  it.each([
    ['documento', (xml: string) => xml.replace('119000.00', '119001.00')],
    ['SignedProperties', (xml: string) => xml.replace('supplier', 'third party')],
    ['política', (xml: string) => xml.replace(DIAN_SIGNATURE_POLICY_SHA256, 'A'.repeat(44))],
    ['firma RSA', (xml: string) => xml.replace(
      /(<ds:SignatureValue>)([A-Za-z0-9+/])/,
      (_match, prefix: string, firstCharacter: string) =>
        `${prefix}${firstCharacter === 'A' ? 'B' : 'A'}`,
    )],
  ])('rechaza alteración posterior de %s', async (_name, mutate) => {
    const signed = await service.firmarXML(invoiceXml(), {
      certificateBuffer: p12, certificatePassword: PASSWORD, signingTime: SIGNING_TIME,
    });
    const mutated = mutate(signed);
    expect(mutated).not.toBe(signed);
    expect(await service.verificarFirma(mutated)).toBe(false);
  });

  it('rechaza wrapping por ID duplicado y firmas múltiples', async () => {
    const signed = await service.firmarXML(invoiceXml(), {
      certificateBuffer: p12, certificatePassword: PASSWORD, signingTime: SIGNING_TIME,
    });
    const keyId = signed.match(/<ds:KeyInfo Id="([^"]+)"/)?.[1];
    expect(keyId).toBeTruthy();
    expect(await service.verificarFirma(signed.replace(
      '</Invoice>', `<cbc:Note Id="${keyId}">wrapped</cbc:Note></Invoice>`,
    ))).toBe(false);
    const signature = signed.match(/<ds:Signature[\s\S]*<\/ds:Signature>/)?.[0] ?? '';
    expect(await service.verificarFirma(signed.replace('</Invoice>', `${signature}</Invoice>`))).toBe(false);
  });

  it('rechaza certificado vencido, SHA1 o sin KeyUsage crítico', async () => {
    await expect(service.firmarXML(invoiceXml(), {
      certificateBuffer: testP12({ expired: true }), certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    })).rejects.toThrow('DIAN_CERTIFICATE_NOT_VALID_AT_SIGNING_TIME');
    await expect(service.firmarXML(invoiceXml(), {
      certificateBuffer: testP12({ keyUsage: false }), certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    })).rejects.toThrow('DIAN_CERTIFICATE_KEY_USAGE_OR_ALGORITHM_INVALID');
    await expect(service.firmarXML(invoiceXml(), {
      certificateBuffer: testP12({ sha1: true }), certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    })).rejects.toThrow('DIAN_CERTIFICATE_KEY_USAGE_OR_ALGORITHM_INVALID');
  });

  it('rechaza XML con DTD, XML ya firmado y un Id inválido', async () => {
    const config = { certificateBuffer: p12, certificatePassword: PASSWORD, signingTime: SIGNING_TIME };
    await expect(service.firmarXML(`<!DOCTYPE Invoice>${invoiceXml()}`, config))
      .rejects.toThrow('DIAN_XML_DTD_FORBIDDEN');
    const signed = await service.firmarXML(invoiceXml(), config);
    await expect(service.firmarXML(signed, config)).rejects.toThrow('DIAN_XML_ALREADY_SIGNED');
    await expect(service.firmarXML(invoiceXml(), { ...config, signatureId: 'bad id' }))
      .rejects.toThrow('DIAN_SIGNATURE_ID_INVALID');
  });

  it('separa integridad de autofirma y confianza de autoridad', async () => {
    const signed = await service.firmarXML(invoiceXml(), {
      certificateBuffer: p12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    });
    expect(await service.verificarFirma(signed)).toBe(true);
    expect(await service.verificarFirmaAutoridad(signed, {
      allowedSpkiSha256: [signedLeafSpkiSha256(signed)],
    })).toBe(false);
  });

  it('acepta sólo hoja fijada que encadena con el bundle CA explícito', async () => {
    const signed = await service.firmarXML(invoiceXml(), {
      certificateBuffer: authority.leafP12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    });
    const inlineTrust = {
      caBundlePem: `${authority.intermediatePem}\n${authority.rootPem}`,
      allowedSpkiSha256: [authority.leafSpkiSha256],
    };
    expect(await service.verificarFirmaAutoridad(signed, inlineTrust)).toBe(true);
    expect(await service.verificarFirmaAutoridad(signed, {
      caBundlePath: authorityBundlePath,
      allowedSpkiSha256: [authority.leafSpkiSha256],
    })).toBe(true);
  });

  it('falla cerrado ante CA, intermedia o pin incompatibles', async () => {
    const signed = await service.firmarXML(invoiceXml(), {
      certificateBuffer: authority.leafP12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    });
    expect(await service.verificarFirmaAutoridad(signed, {
      caBundlePem: authority.rootPem,
      allowedSpkiSha256: [authority.leafSpkiSha256],
    })).toBe(false);
    expect(await service.verificarFirmaAutoridad(signed, {
      caBundlePem: `${authority.intermediatePem}\n${authority.rootPem}`,
      allowedSpkiSha256: ['0'.repeat(64)],
    })).toBe(false);

    const selfSigned = await service.firmarXML(invoiceXml(), {
      certificateBuffer: p12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    });
    expect(await service.verificarFirmaAutoridad(selfSigned, {
      caBundlePem: authority.rootPem,
      allowedSpkiSha256: [signedLeafSpkiSha256(selfSigned)],
    })).toBe(false);
  });

  it('rechaza configuración ambigua, ruta relativa, bundle sobredimensionado y pin malformado', async () => {
    const signed = await service.firmarXML(invoiceXml(), {
      certificateBuffer: authority.leafP12,
      certificatePassword: PASSWORD,
      signingTime: SIGNING_TIME,
    });
    expect(await service.verificarFirmaAutoridad(signed, {
      caBundlePem: authority.rootPem,
      caBundlePath: authorityBundlePath,
      allowedSpkiSha256: [authority.leafSpkiSha256],
    })).toBe(false);
    expect(await service.verificarFirmaAutoridad(signed, {
      caBundlePath: 'relative/authority-ca.pem',
      allowedSpkiSha256: [authority.leafSpkiSha256],
    })).toBe(false);
    expect(await service.verificarFirmaAutoridad(signed, {
      caBundlePem: 'x'.repeat(1024 * 1024 + 1),
      allowedSpkiSha256: [authority.leafSpkiSha256],
    })).toBe(false);
    expect(await service.verificarFirmaAutoridad(signed, {
      caBundlePem: authority.rootPem,
      allowedSpkiSha256: ['sha256/not-a-hex-pin'],
    })).toBe(false);
  });
});
