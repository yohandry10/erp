import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { CpeCertificateService } from './cpe-certificate.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

const CLAVE_CIFRADO = 'clave-de-cifrado-de-pruebas-32-chars';

const pfxValido = (ruc: string, clave: string): Buffer => {
  const par = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);
  const attrs = [
    { name: 'commonName', value: `EMPRESA ${ruc}` },
    { type: '2.5.4.5', value: ruc },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(par.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], clave, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
};

const montar = (empresa: any) => {
  const supabase = {
    getClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: empresa, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseService;

  const config = {
    get: (clave: string, porDefecto?: any) => {
      if (clave === 'CERT_ENCRYPTION_KEY') return CLAVE_CIFRADO;
      return porDefecto;
    },
  } as unknown as ConfigService;

  return new CpeCertificateService(supabase, config);
};

/**
 * Regla de negocio del certificado, que es lo que decide si un comprobante sale
 * firmado de verdad o con un autofirmado de demostración.
 */
describe('CpeCertificateService · certificado del tenant', () => {
  const RUC = '20601234565';
  const CLAVE_PFX = 'clave-pfx';

  it('usa el certificado del tenant cuando carga bien', async () => {
    const service = montar({
      ruc: RUC,
      certificado_pfx: pfxValido(RUC, CLAVE_PFX),
      certificado_password: CLAVE_PFX,
      sunat_environment: 'produccion',
    });

    const signer = await service.getXmlSigner('tenant-1');

    expect(signer.getCertificateInfo()).toMatchObject({ demoMode: false });
  });

  it('en producción, un certificado que no carga corta la emisión', async () => {
    // Antes caia a demo en silencio: el comprobante salia firmado con un
    // autofirmado y el emisor creia haber usado el suyo.
    const service = montar({
      ruc: RUC,
      certificado_pfx: Buffer.from('pfx corrupto'),
      certificado_password: CLAVE_PFX,
      sunat_environment: 'produccion',
    });

    await expect(service.getXmlSigner('tenant-1')).rejects.toThrow();
  });

  it('en producción, el certificado de otro RUC corta la emisión', async () => {
    const service = montar({
      ruc: RUC,
      certificado_pfx: pfxValido('20600900006', CLAVE_PFX),
      certificado_password: CLAVE_PFX,
      sunat_environment: 'produccion',
    });

    await expect(service.getXmlSigner('tenant-1')).rejects.toThrow(
      /no contiene el RUC esperado/i,
    );
  });

  it('en homologación el demo sigue pudiendo emitir sin certificado real', async () => {
    const service = montar({
      ruc: RUC,
      certificado_pfx: Buffer.from('pfx corrupto'),
      certificado_password: CLAVE_PFX,
      sunat_environment: 'homologacion',
    });

    const signer = await service.getXmlSigner('tenant-1');

    expect(signer.getCertificateInfo()).toMatchObject({ demoMode: true });
  });
});
