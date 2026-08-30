import {
  DIAN_OFFICIAL_ENDPOINTS,
  normalizeDianTransportEnvironment,
  resolveOfficialDianEndpoint,
} from './dian-endpoint.util';

describe('endpoint oficial DIAN', () => {
  it('normaliza los nombres persistidos sin mezclar ambientes', () => {
    expect(normalizeDianTransportEnvironment('HOMOLOGACION')).toBe('habilitacion');
    expect(normalizeDianTransportEnvironment('habilitacion')).toBe('habilitacion');
    expect(normalizeDianTransportEnvironment('PRODUCCION')).toBe('produccion');
    expect(() => normalizeDianTransportEnvironment('qa')).toThrow('Ambiente DIAN inválido');
  });

  it('sólo admite la URL exacta correspondiente al ambiente', () => {
    expect(resolveOfficialDianEndpoint({ environment: 'habilitacion' }))
      .toBe(DIAN_OFFICIAL_ENDPOINTS.habilitacion);
    expect(resolveOfficialDianEndpoint({
      environment: 'produccion', url: DIAN_OFFICIAL_ENDPOINTS.produccion,
    })).toBe(DIAN_OFFICIAL_ENDPOINTS.produccion);
    expect(() => resolveOfficialDianEndpoint({
      environment: 'produccion', url: `${DIAN_OFFICIAL_ENDPOINTS.produccion}?redirect=1`,
    })).toThrow('Endpoint DIAN no permitido');
    expect(() => resolveOfficialDianEndpoint({
      environment: 'habilitacion', url: 'http://169.254.169.254/latest/meta-data',
    })).toThrow('Endpoint DIAN no permitido');
  });
});
