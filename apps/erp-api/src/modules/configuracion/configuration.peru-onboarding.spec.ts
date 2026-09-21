import * as forge from 'node-forge';
import { ConfigurationService } from './configuration.service';
import { ConfigurationController } from './configuration.controller';

describe('Alta Perú: certificado del cliente y RUC en edición', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const previousRuc = '20123456786';
  const clientRuc = '20100047218';
  const password = 'pfx-local-no-productivo';
  let certificateBase64: string;

  function pfx(from = Date.now() - 60_000, until = Date.now() + 86400000) {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(from);
    cert.validity.notAfter = new Date(until);
    const subject = [{ name: 'commonName', value: `PRUEBA LOCAL ${clientRuc}` }];
    cert.setSubject(subject);
    cert.setIssuer(subject);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(
      keys.privateKey, [cert], password, { algorithm: '3des' },
    )).getBytes(), 'binary').toString('base64');
  }

  beforeAll(() => { certificateBase64 = pfx(); });

  function setup() {
    let stored: Record<string, unknown> = { pais: 'PE', ruc: previousRuc };
    const query: any = {
      select: jest.fn(() => query), eq: jest.fn(() => query),
      maybeSingle: jest.fn(async () => ({ data: stored, error: null })),
      single: jest.fn(async () => ({ data: stored, error: null })),
    };
    const rpc = jest.fn(async (_name: string, args: any) => {
      stored = { ...stored, ...args.p_patch };
      return { data: { configuracion: stored }, error: null };
    });
    const service = new ConfigurationService(
      { getClient: () => ({ from: () => query, rpc }) } as any,
      {} as any,
      { get: (key: string) => key === 'CERT_ENCRYPTION_KEY' ? 'clave-cifrado-local-onboarding-32-bytes' : undefined } as any,
    );
    const controller = new ConfigurationController(service, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, controller, rpc, current: () => stored };
  }

  it('la validación previa usa el RUC nuevo sin escribir la configuración', async () => {
    const { controller, rpc, current } = setup();
    await expect(controller.validateWizardCertificate(undefined, {
      certificateBase64, certificatePassword: password, ruc: clientRuc,
    }, tenantId)).resolves.toMatchObject({ success: true, data: { rucEmisor: clientRuc, perteneceAlEmisor: true } });
    expect(rpc).not.toHaveBeenCalled();
    expect(current().ruc).toBe(previousRuc);
  });

  it('rechaza un certificado de otro RUC antes del guardado', async () => {
    const { controller, rpc } = setup();
    await expect(controller.validateWizardCertificate(undefined, {
      certificateBase64, certificatePassword: password, ruc: previousRuc,
    }, tenantId)).rejects.toThrow(/certificado/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rechaza contraseña incorrecta sin escribir ni anunciar aceptación', async () => {
    const { controller, rpc } = setup();
    await expect(controller.validateWizardCertificate(undefined, {
      certificateBase64, certificatePassword: 'incorrecta', ruc: clientRuc,
    }, tenantId)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['vencido', 'futuro'])('rechaza un PFX %s', async kind => {
    const { controller, rpc } = setup();
    const now = Date.now();
    const invalid = kind === 'vencido' ? pfx(now - 86400000, now - 60000) : pfx(now + 86400000, now + 172800000);
    await expect(controller.validateWizardCertificate(undefined, {
      certificateBase64: invalid, certificatePassword: password, ruc: clientRuc,
    }, tenantId)).rejects.toThrow(/vigente/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('completar vuelve a validar y entrega únicamente el PFX y contraseña cifrados al writer', async () => {
    const { service, rpc } = setup();
    const config = { pais: 'PE', pais_id: 1, ruc: clientRuc, razonSocial: 'Cliente local', direccion: 'Dirección local',
      certificateBase64, certificatePassword: password, sunat_environment: 'homologacion' };
    await service.completeWizard(tenantId, config, '22222222-2222-4222-8222-222222222222', 'alta-local');
    expect(rpc).toHaveBeenCalledWith('completar_wizard_config_tx', expect.objectContaining({
      p_tenant_id: tenantId, p_patch: expect.objectContaining({ ruc: clientRuc, configuracion_completa: true }),
    }));
    const serialized = JSON.stringify(rpc.mock.calls);
    expect(serialized).not.toContain(certificateBase64);
    expect(serialized).not.toContain(password);

    rpc.mockClear();
    await expect(service.completeWizard(tenantId, { ...config, ruc: previousRuc },
      '22222222-2222-4222-8222-222222222222', 'otro-intento')).rejects.toThrow(/certificado/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
