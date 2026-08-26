import { ConfigService } from '@nestjs/config';
import * as forge from 'node-forge';
import { CpeCertificateService } from './cpe-certificate.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { DEMO_PE_RUC } from '../../shared/utils/demo-certificate.utils';

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

const montar = (
  empresa: any,
  configOverrides: Record<string, unknown> = {},
  empresaError: any = null,
) => {
  const supabase = {
    getClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: empresa, error: empresaError }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseService;

  const config = {
    get: (clave: string, porDefecto?: any) => {
      if (Object.prototype.hasOwnProperty.call(configOverrides, clave)) {
        return configOverrides[clave];
      }
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

  it('un certificado propio corrupto falla también en homologación', async () => {
    const service = montar({
      ruc: RUC,
      is_demo: true,
      pais: 'PE',
      certificado_pfx: Buffer.from('pfx corrupto'),
      certificado_password: CLAVE_PFX,
      sunat_environment: 'homologacion',
    });

    await expect(service.getXmlSigner('tenant-1')).rejects.toThrow();
  });

  it('una demo PE en homologación firma con el PFX sintético del runtime', async () => {
    const service = montar({
      ruc: DEMO_PE_RUC,
      is_demo: true,
      pais: 'PE',
      certificado_pfx: null,
      certificado_password: null,
      sunat_environment: 'homologacion',
    });

    const signer = await service.getXmlSigner('tenant-demo');

    expect(signer.getCertificateInfo()).toMatchObject({ demoMode: false });
  });

  it('firma para Argentina con CUIT y ambiente ARCA sin exigir campos SUNAT', async () => {
    const cuit = '30710158229';
    const service = montar({
      pais: 'AR',
      ruc: cuit,
      arca_cuit_representada: cuit,
      certificado_pfx: pfxValido(cuit, CLAVE_PFX),
      certificado_password: CLAVE_PFX,
      arca_environment: 'produccion',
      sunat_environment: null,
    });

    const signer = await service.getXmlSigner('tenant-ar');

    expect(signer.getCertificateInfo()).toMatchObject({ demoMode: false });
  });

  it('firma para Colombia con NIT y ambiente DIAN sin exigir RUC de 11 dígitos', async () => {
    const nit = '900123456-8';
    const service = montar({
      pais: 'CO',
      ruc: nit,
      certificado_pfx: pfxValido(nit, CLAVE_PFX),
      certificado_password: CLAVE_PFX,
      dian_environment: 'PRODUCCION',
      sunat_environment: null,
    });

    const signer = await service.getXmlSigner('tenant-co');

    expect(signer.getCertificateInfo()).toMatchObject({ demoMode: false });
  });

  it('una demo marcada como producción no puede usar el PFX sintético', async () => {
    const service = montar({
      ruc: RUC,
      is_demo: true,
      pais: 'PE',
      certificado_pfx: null,
      certificado_password: null,
      sunat_environment: 'produccion',
    });

    await expect(service.getXmlSigner('tenant-demo-produccion')).rejects.toThrow(
      /no puede usar un certificado simulado/i,
    );
  });

  it('una cuenta real sin certificado continúa bloqueada', async () => {
    const service = montar({
      ruc: RUC,
      is_demo: false,
      pais: 'PE',
      certificado_pfx: null,
      certificado_password: null,
      sunat_environment: 'homologacion',
    });

    await expect(service.getXmlSigner('tenant-real')).rejects.toThrow(
      /no hay configuración de certificado fiscal/i,
    );
  });

  it('una cuenta real nunca hereda el PFX global del proceso', async () => {
    const service = montar(
      {
        ruc: RUC,
        is_demo: false,
        pais: 'PE',
        certificado_pfx: null,
        certificado_password: null,
        sunat_environment: 'homologacion',
      },
      {
        PFX_PATH: 'certs/demo.pfx',
        PFX_PASS: '12345678910',
      },
    );

    await expect(service.getXmlSigner('tenant-real-global')).rejects.toThrow(
      /certificado propio del contribuyente/i,
    );
  });

  it('una lectura fallida nunca habilita el fixture aunque PostgREST entregue datos parciales', async () => {
    const service = montar(
      {
        ruc: DEMO_PE_RUC,
        is_demo: true,
        pais: 'PE',
        certificado_pfx: null,
        certificado_password: null,
        sunat_environment: 'homologacion',
      },
      {},
      { message: 'database unavailable' },
    );
    await expect(service.getXmlSigner('tenant-error')).rejects.toThrow(
      /database unavailable/i,
    );
  });

  it('un tenant sin RUC propio no hereda la identidad fiscal global', async () => {
    const service = montar(
      {
        ruc: null,
        certificado_pfx: pfxValido(RUC, CLAVE_PFX),
        certificado_password: CLAVE_PFX,
        sunat_environment: 'homologacion',
      },
      {
        EMPRESA_RUC: RUC,
        SUNAT_CERT_EXPECTED_RUC: RUC,
        SUNAT_CERT_RUC_MISMATCH_CONFIRMED: 'true',
      },
    );

    await expect(service.getXmlSigner('tenant-sin-ruc')).rejects.toThrow(
      /propio RUC/i,
    );
  });
});
