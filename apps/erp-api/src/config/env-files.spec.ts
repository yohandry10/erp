import { apiEnvFilePath } from './env-files';

describe('apiEnvFilePath', () => {
  it('prioriza overrides locales antes de archivos base', () => {
    expect(apiEnvFilePath).toEqual([
      'apps/erp-api/.env.local',
      '.env.local',
      'apps/erp-api/.env',
      '.env',
    ]);
  });

  it('evita que .env productivo preceda a .env.local en desarrollo', () => {
    expect(apiEnvFilePath.indexOf('.env.local')).toBeLessThan(apiEnvFilePath.indexOf('.env'));
    expect(apiEnvFilePath.indexOf('apps/erp-api/.env.local')).toBeLessThan(
      apiEnvFilePath.indexOf('apps/erp-api/.env'),
    );
  });
});
