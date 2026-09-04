import {
  isFiscalDemoRepresentation,
  isColombiaDemoRepresentation,
  resolveHistoricalCpeCountry,
} from './historical-cpe-country.util';

describe('resolveHistoricalCpeCountry', () => {
  it('prioriza el país inmutable del snapshot aunque el tenant haya cambiado', () => {
    expect(resolveHistoricalCpeCountry({
      pais: 'CO',
      issuer_snapshot: { country_code: 'CO' },
    }, 'PE')).toBe('CO');
  });

  it('usa cpe.pais para filas legadas y el tenant sólo como último respaldo', () => {
    expect(resolveHistoricalCpeCountry({ pais: 'AR' }, 'PE')).toBe('AR');
    expect(resolveHistoricalCpeCountry({ metadata: { pais: 'CO' } }, 'PE')).toBe('CO');
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

  it('falla cerrado si el metadata legado contradice la procedencia persistida', () => {
    expect(() => resolveHistoricalCpeCountry({
      pais: 'PE',
      metadata: { pais: 'CO' },
    })).toThrow('Procedencia fiscal contradictoria');
  });

  it('conserva la modalidad del CPE aunque el tenant ya se haya convertido a real', () => {
    expect(isColombiaDemoRepresentation({
      pais: 'CO',
      simulated_origin: true,
      issuer_snapshot: { country_code: 'CO' },
    })).toBe(true);
    expect(isColombiaDemoRepresentation({
      pais: 'CO',
      simulated_origin: false,
      issuer_snapshot: { country_code: 'CO' },
    })).toBe(false);
  });

  it('usa el país actual sólo para clasificar una fila legacy sin procedencia persistida', () => {
    expect(isColombiaDemoRepresentation({ simulated_origin: null }, 'CO')).toBe(true);
    expect(isColombiaDemoRepresentation({ simulated_origin: null }, 'PE')).toBe(false);
  });

  it('reconoce como muestra local una procedencia simulada Argentina', () => {
    expect(isFiscalDemoRepresentation({
      simulated_origin: true,
      issuer_snapshot: { country_code: 'AR' },
    })).toBe(true);
    expect(isFiscalDemoRepresentation({
      simulated_origin: false,
      issuer_snapshot: { country_code: 'AR' },
    })).toBe(false);
  });
});
