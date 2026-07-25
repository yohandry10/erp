import { SunatFiscalService } from './sunat-fiscal.service';
import * as path from 'path';

describe('SunatFiscalService SUNAT SOAP alignment', () => {
  const createConfigService = (overrides: Record<string, string | undefined> = {}) => {
    const values = {
      SUNAT_ENVIRONMENT: 'homologacion',
      SUNAT_USERNAME: '20123456789MODDATOS',
      SUNAT_PASSWORD: 'MODDATOS',
      EMPRESA_RUC: '20123456789',
      CERTIFICATE_PATH: path.resolve(process.cwd(), '..', '..', 'certs', 'demo.pfx'),
      CERTIFICATE_PASSWORD: '12345678910',
      REQUIRE_REAL_FISCAL_CERTIFICATE: 'false',
      ...overrides,
    };

    return {
      get: jest.fn((key: string) => values[key as keyof typeof values]),
    };
  };

  it('usa el endpoint beta oficial para CPE en homologacion', () => {
    const service = new SunatFiscalService(createConfigService() as any);

    const endpoint = (service as any).resolveSunatEndpoint('cpe');

    expect(endpoint).toMatchObject({
      hostname: 'e-beta.sunat.gob.pe',
      path: '/ol-ti-itcpfegem-beta/billService',
    });
  });

  it('consulta CDR productivo por getStatusCdr en billConsultService', () => {
    const service = new SunatFiscalService(
      createConfigService({
        SUNAT_ENVIRONMENT: 'produccion',
        REQUIRE_REAL_FISCAL_CERTIFICATE: 'false',
        SUNAT_CERT_RUC_MISMATCH_CONFIRMED: 'true',
        SUNAT_CERT_RUC_MISMATCH_REASON: 'test fixture uses demo certificate',
      }) as any,
    );

    const endpoint = (service as any).resolveSunatEndpoint('query');
    const request = (service as any).buildStatusCdrRequest('20123456789', '01', 'F001', '1');

    expect(endpoint).toMatchObject({
      hostname: 'e-factura.sunat.gob.pe',
      path: '/ol-it-wsconscpegem/billConsultService',
    });
    expect(request).toContain('<ser:getStatusCdr>');
    expect(request).not.toContain('<ser:getStatus>');
  });

  it('usa solo WS-Security para SUNAT directo y HTTP Basic solo para endpoints externos', () => {
    const service = new SunatFiscalService(createConfigService() as any);

    expect((service as any).shouldUseHttpBasicAuth('e-factura.sunat.gob.pe')).toBe(false);
    expect((service as any).shouldUseHttpBasicAuth('e-beta.sunat.gob.pe')).toBe(false);
    expect((service as any).shouldUseHttpBasicAuth('ose.example.com')).toBe(true);
  });

  it('prefiere credenciales SUNAT explicitas sobre aliases OSE legacy', () => {
    const service = new SunatFiscalService(
      createConfigService({
        SUNAT_USERNAME: '20123456789ERPFE001',
        SUNAT_PASSWORD: 'sunat-secret',
        OSE_USUARIO: 'legacy-user',
        OSE_PASSWORD: 'legacy-secret',
      }) as any,
    );

    expect((service as any).config.usuario).toBe('20123456789ERPFE001');
    expect((service as any).config.password).toBe('sunat-secret');
  });

  it('no advierte facturas menores a S/ 700 y exige RUC del receptor', async () => {
    const service = new SunatFiscalService(createConfigService() as any);

    const result = await service.validarDocumento({
      id: 'doc-1',
      tipoDocumento: '01',
      serie: 'F001',
      numero: '1',
      fechaEmision: '2026-06-17',
      emisor: {
        tipoDocumento: '6',
        numeroDocumento: '20123456789',
        razonSocial: 'Emisor SAC',
      },
      receptor: {
        tipoDocumento: '1',
        numeroDocumento: '12345678',
        razonSocial: 'Cliente Persona',
      },
      moneda: 'PEN',
      subtotal: 100,
      totalImpuestos: 18,
      importeTotal: 118,
      items: [],
    });

    expect(result.advertencias).not.toContain('Factura con monto menor a S/ 700.00');
    expect(result.errores).toContain('Factura requiere RUC del receptor de 11 dígitos');
  });

  it('valida identificacion del adquirente en boletas mayores a S/ 700 sin exigir GRE', async () => {
    const service = new SunatFiscalService(createConfigService() as any);

    const result = await service.validarDocumento({
      id: 'doc-2',
      tipoDocumento: '03',
      serie: 'B001',
      numero: '1',
      fechaEmision: '2026-06-17',
      emisor: {
        tipoDocumento: '6',
        numeroDocumento: '20123456789',
        razonSocial: 'Emisor SAC',
      },
      receptor: {
        tipoDocumento: '1',
        numeroDocumento: '',
        razonSocial: '',
      },
      moneda: 'PEN',
      subtotal: 700,
      totalImpuestos: 126.01,
      importeTotal: 826.01,
      items: [],
    });

    expect(result.errores).toContain(
      'Boleta mayor a S/ 700 requiere apellidos y nombres o razón social, y número de documento del adquirente o usuario',
    );
    expect(result.errores.join(' ')).not.toMatch(/GRE|Guía de Remisión/i);
  });
});
