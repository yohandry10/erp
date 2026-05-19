import * as fs from 'fs';
import * as path from 'path';
import { XmlSigner } from '@erp-suite/crypto';

describe('XmlSigner runtime package resolution', () => {
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
});
