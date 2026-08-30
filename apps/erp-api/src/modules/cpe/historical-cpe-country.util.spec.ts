import { resolveHistoricalCpeCountry } from './historical-cpe-country.util';

describe('resolveHistoricalCpeCountry', () => {
  it('prioriza el país inmutable del snapshot aunque el tenant haya cambiado', () => {
    expect(resolveHistoricalCpeCountry({
      pais: 'CO',
      issuer_snapshot: { country_code: 'CO' },
    }, 'PE')).toBe('CO');
  });

  it('usa cpe.pais para filas legadas y el tenant sólo como último respaldo', () => {
    expect(resolveHistoricalCpeCountry({ pais: 'AR' }, 'PE')).toBe('AR');
    expect(resolveHistoricalCpeCountry({}, 'PE')).toBe('PE');
  });

  it('falla cerrado ante una contradicción persistida', () => {
    expect(() => resolveHistoricalCpeCountry({
      pais: 'PE',
      issuer_snapshot: { country_code: 'CO' },
    }, 'PE')).toThrow('Procedencia fiscal contradictoria');
  });

  it('no degrada silenciosamente un país desconocido a Perú', () => {
    expect(() => resolveHistoricalCpeCountry({
      issuer_snapshot: { country_code: 'CL' },
    }, 'PE')).toThrow('País fiscal no soportado');
  });
});
