import { ConfigService } from '@nestjs/config';
import { DESKTOP_APP_ORIGINS, SecurityService } from './security.service';

// El API de producción sólo acepta los orígenes declarados. El escritorio
// instalado no tiene dominio: presenta siempre el mismo origen local.
describe('CORS · orígenes web declarados y escritorio instalado', () => {
  const entorno = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = entorno; });
  const config = (allowed?: string) =>
    new SecurityService({ get: (key: string) => (key === 'ALLOWED_ORIGINS' ? allowed : undefined) } as unknown as ConfigService).getCorsConfig();

  it('en producción admite los orígenes declarados y el del escritorio, sin duplicarlo', () => {
    process.env.NODE_ENV = 'production';
    expect(config('https://app.example.test, https://otra.example.test').origin).toEqual([
      'https://app.example.test', 'https://otra.example.test', 'http://tauri.localhost',
    ]);
    expect(config('https://app.example.test,http://tauri.localhost').origin).toEqual([
      'https://app.example.test', 'http://tauri.localhost',
    ]);
  });

  it('no abre comodines ni otros esquemas del escritorio', () => {
    process.env.NODE_ENV = 'production';
    const origin = config('https://app.example.test').origin as string[];
    expect(DESKTOP_APP_ORIGINS).toEqual(['http://tauri.localhost']);
    for (const ajeno of ['*', 'https://tauri.localhost', 'tauri://localhost', 'http://tauri.localhost:8080', 'http://evil.tauri.localhost']) {
      expect(origin).not.toContain(ajeno);
    }
  });

  it('producción sigue exigiendo orígenes web explícitos', () => {
    process.env.NODE_ENV = 'production';
    expect(() => config('')).toThrow('ALLOWED_ORIGINS');
    expect(() => config(undefined)).toThrow('ALLOWED_ORIGINS');
  });
});
