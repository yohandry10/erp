import { normalizeDianIdentity, normalizeDianIdentityType } from './dian-document.util';

describe('identidad DIAN canónica', () => {
  it.each([
    ['NIT', '31'], ['31', '31'], ['CC', '13'], ['CE', '22'],
    ['TI', '12'], ['PASAPORTE', '41'],
  ])('normaliza %s al catálogo %s', (input, expected) => {
    expect(normalizeDianIdentityType(input)).toBe(expected);
  });

  it('separa el DV del NIT y conserva su forma persistible sólo-dígitos', () => {
    expect(normalizeDianIdentity('31', '900123456-8')).toEqual({
      type: '31', canonicalNumber: '9001234568', xmlNumber: '900123456',
      verificationDigit: '8', schemeName: 'NIT',
    });
  });

  it('rechaza tipos implícitos o ajenos al catálogo DIAN', () => {
    expect(() => normalizeDianIdentity('0', '9001234568')).toThrow('Tipo de documento DIAN inválido');
    expect(() => normalizeDianIdentity('', '1020304050')).toThrow('Tipo de documento DIAN inválido');
  });
});
