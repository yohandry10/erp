import * as fs from 'fs';
import * as path from 'path';
import { XmlSigner } from '@erp-suite/crypto';

describe('XmlSigner runtime package resolution', () => {
  it('genera el certificado efímero con tolerancia de reloj de 24 horas', () => {
    const before = Date.now();
    const signer = new XmlSigner({ useDemoMode: true });
    const validFrom = signer.getCertificateInfo().validFrom as Date;
    const skew = before - validFrom.getTime();

    expect(skew).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(skew).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it('carga el certificado relativo al workspace cuando la API corre desde apps/erp-api', () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..');
    const certificatePath = path.join(workspaceRoot, 'certs', 'demo.pfx');

    expect(fs.existsSync(certificatePath)).toBe(true);

    const signer = new XmlSigner({
      pfxPath: 'certs/demo.pfx',
      pfxPassword: '12345678910',
      allowDemoFallback: false,
    });

    expect(signer.getCertificateInfo()).toMatchObject({
      demoMode: false,
    });
  });

  it('firma XML UBL con Signature dentro de ext:ExtensionContent y referencia enveloped', () => {
    const signer = new XmlSigner({
      pfxPath: 'certs/demo.pfx',
      pfxPassword: '12345678910',
      allowDemoFallback: false,
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
</Invoice>`;

    const signedXml = signer.signXml(xml);

    expect(signedXml).toContain('<ds:Signature');
    expect(signedXml).toContain('Id="SignatureSP"');
    expect(signedXml).toContain('<ds:Reference URI="">');
    expect(signedXml).toContain('http://www.w3.org/2000/09/xmldsig#enveloped-signature');
    expect(signedXml).toMatch(/<ext:ExtensionContent>[\s\S]*<ds:Signature\b[\s\S]*<\/ext:ExtensionContent>/);
    expect(signedXml).toMatch(/<ds:DigestValue>[^<]{20,}<\/ds:DigestValue>/);
    expect(signedXml).toMatch(/<ds:SignatureValue>[^<]{100,}<\/ds:SignatureValue>/);
    expect(signedXml).toContain('<ds:X509Certificate>');
  });

  it('bloquea certificado productivo cuando no contiene el RUC esperado', () => {
    expect(() => new XmlSigner({
      pfxPath: 'certs/demo.pfx',
      pfxPassword: '12345678910',
      allowDemoFallback: false,
      expectedRuc: '20616053575',
      enforceRucInCertificate: true,
    })).toThrow(/no contiene el RUC esperado 20616053575/i);
  });

  it('permite certificado productivo cuando contiene el RUC esperado', () => {
    const signer = new XmlSigner({
      pfxPath: 'certs/demo.pfx',
      pfxPassword: '12345678910',
      allowDemoFallback: false,
      expectedRuc: '20123456786',
      enforceRucInCertificate: true,
    });

    expect(signer.getCertificateInfo()).toMatchObject({
      demoMode: false,
      rucMatches: true,
    });
  });

  it('solo permite mismatch de RUC con confirmacion explicita', () => {
    const signer = new XmlSigner({
      pfxPath: 'certs/demo.pfx',
      pfxPassword: '12345678910',
      allowDemoFallback: false,
      expectedRuc: '20616053575',
      enforceRucInCertificate: true,
      allowRucMismatchWithConfirmation: true,
    });

    expect(signer.getCertificateInfo()).toMatchObject({
      demoMode: false,
      rucMatches: false,
    });
  });
});
