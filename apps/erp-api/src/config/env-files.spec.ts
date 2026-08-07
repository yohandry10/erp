import { apiEnvFilePath } from './env-files';

describe('apiEnvFilePath', () => {
  it('no carga archivos remotos durante tests', () => {
    expect(apiEnvFilePath).toEqual([]);
  });

  it('no contiene rutas .env o .env.local', () => {
    expect(apiEnvFilePath.some((file) => /(^|\/)\.env(?:\.local)?$/.test(file))).toBe(false);
  });
});
