import * as path from 'path';
import { apiEnvFilePath, resolveApiEnvFilePath } from './env-files';

describe('apiEnvFilePath', () => {
  it('no carga archivos remotos durante tests', () => {
    expect(apiEnvFilePath).toEqual([]);
  });

  it('no contiene rutas .env o .env.local', () => {
    expect(apiEnvFilePath.some((file) => /(^|\/)\.env(?:\.local)?$/.test(file))).toBe(false);
  });

  it('resuelve .env.production desde la raíz del workspace', () => {
    const cwd = path.resolve('C:/workspace/erp');

    expect(resolveApiEnvFilePath(cwd, 'production')).toContain(
      path.resolve(cwd, '.env.production'),
    );
  });

  it('resuelve la raíz del workspace cuando pnpm inicia desde apps/erp-api', () => {
    const packageCwd = path.resolve('C:/workspace/erp/apps/erp-api');

    expect(resolveApiEnvFilePath(packageCwd, 'production')).toContain(
      path.resolve(packageCwd, '../../.env.production'),
    );
  });
});
