import * as fs from 'fs';
import * as path from 'path';
import { OseService } from './ose.service';

describe('OseService certificate path resolution', () => {
  const config = {
    OSE_URL: 'https://ose-demo.local',
    OSE_USUARIO: 'demo',
    OSE_PASSWORD: 'demo',
    EMPRESA_RUC: '20704264904',
    CERTIFICATE_PATH: 'certs/demo.pfx',
    CERTIFICATE_PASSWORD: '12345678910',
    SUNAT_ENVIRONMENT: 'homologacion',
    REQUIRE_REAL_FISCAL_CERTIFICATE: 'false',
  };

  const configService = {
    get: jest.fn((key: string) => config[key as keyof typeof config]),
  };

  const circuitBreaker = {
    registerCircuit: jest.fn(),
    execute: jest.fn(),
    getStats: jest.fn(),
    forceClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carga el certificado real relativo al workspace aunque la API ejecute desde apps/erp-api', async () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..');
    expect(fs.existsSync(path.join(workspaceRoot, 'certs', 'demo.pfx'))).toBe(true);

    const service = new OseService(configService as any, circuitBreaker as any);

    await expect(service.verificarConfiguracion()).resolves.toEqual({
      valid: true,
      errors: [],
    });
    expect(service.getConfiguracion()).toMatchObject({
      certificateExists: true,
    });
    expect((service as any).xmlSigner.getCertificateInfo()).toMatchObject({
      demoMode: false,
    });
  });
});
