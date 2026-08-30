import { BadRequestException } from '@nestjs/common';
import * as forge from 'node-forge';
import { ConfigurationService } from './configuration.service';

const createPfx = (nit: string, password: string): Buffer => {
  const pair = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = pair.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date();
  certificate.validity.notAfter.setFullYear(certificate.validity.notAfter.getFullYear() + 2);
  const attributes = [
    { name: 'commonName', value: `EMPRESA NIT ${nit}` },
    { type: '2.5.4.5', value: nit },
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(pair.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(pair.privateKey, [certificate], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
};

describe('ConfigurationService · titularidad del certificado DIAN', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const currentNit = '901525000-2';
  const requestedNit = '900123456-8';
  const password = 'clave-certificado-co';
  const encryptionKey = 'clave-cifrado-certificados-32-caracteres';

  function serviceWithCurrent(current: Record<string, unknown>) {
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue({ data: current, error: null }),
      single: jest.fn().mockResolvedValue({ data: current, error: null }),
    };
    const rpc = jest.fn().mockResolvedValue({ data: { configuracion: {} }, error: null });
    const service = new ConfigurationService(
      { getClient: () => ({ from: () => query, rpc }) } as any,
      { validateCertificate: jest.fn() } as any,
      {
        get: jest.fn((key: string) => key === 'CERT_ENCRYPTION_KEY'
          ? encryptionKey
          : undefined),
      } as any,
    );
    return { service, rpc };
  }

  it('contrasta el PFX con el NIT nuevo del wizard, no con el NIT viejo persistido', async () => {
    const { service } = serviceWithCurrent({ pais: 'CO', ruc: currentNit });
    const pfx = createPfx(requestedNit, password);

    await expect(service.validateCertificatePayload(
      tenantId,
      {
        certificateBase64: pfx.toString('base64'),
        certificatePassword: password,
      },
      { countryCode: 'CO', taxId: requestedNit },
    )).resolves.toEqual(expect.objectContaining({
      rucEmisor: requestedNit,
      perteneceAlEmisor: true,
      rucsEnCertificado: expect.arrayContaining(['9001234568']),
    }));
  });

  it('rechaza completar y activar DIAN con un PFX de otro NIT antes del writer', async () => {
    const { service, rpc } = serviceWithCurrent({ pais: 'CO', ruc: currentNit });
    const foreignPfx = createPfx(currentNit, password);

    await expect(service.completeWizard(
      tenantId,
      {
        pais: 'CO',
        pais_id: 2,
        ruc: requestedNit,
        razonSocial: 'Empresa Colombia S.A.S.',
        direccion: 'Carrera 7 # 12-34',
        ubigeo: '11001',
        departamento: 'Bogotá D.C.',
        provincia: 'Bogotá D.C.',
        emision_cpe_modo: 'DIAN_DIRECTO',
        dian_activo: true,
        dian_environment: 'HOMOLOGACION',
        dian_url: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
        dian_software_id: 'software-id',
        dian_software_pin: 'software-pin',
        dian_resolucion_numero: '18760000001',
        dian_resolucion_prefijo: 'SETP',
        dian_tipo_contribuyente: '1',
        dian_regimen_fiscal: 'O-13',
        certificateBase64: foreignPfx.toString('base64'),
        certificatePassword: password,
      },
      'actor-admin',
      'idem-cert-mismatch',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(rpc).not.toHaveBeenCalledWith('completar_wizard_config_tx', expect.anything());
  });

  it('impide cambiar el NIT de una DIAN activa si el PFX almacenado es del NIT anterior', async () => {
    const storedPfx = createPfx(currentNit, password);
    const { service, rpc } = serviceWithCurrent({
      pais: 'CO',
      pais_id: 2,
      ruc: currentNit,
      dian_activo: true,
      certificado_pfx: storedPfx,
      certificado_password: password,
    });

    await expect(service.updateEmpresaPatchAtomic(
      tenantId,
      { ruc: requestedNit },
      'actor-admin',
      'idem-change-nit',
      'EMPRESA',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(rpc).not.toHaveBeenCalledWith('actualizar_empresa_config_tx', expect.anything());
  });
});
