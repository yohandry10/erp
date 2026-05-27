import { sanitizePostgrestSearch } from './postgrest.util';

describe('sanitizePostgrestSearch', () => {
  it('devuelve string vacío para null/undefined/vacío', () => {
    expect(sanitizePostgrestSearch(null)).toBe('');
    expect(sanitizePostgrestSearch(undefined)).toBe('');
    expect(sanitizePostgrestSearch('')).toBe('');
    expect(sanitizePostgrestSearch('   ')).toBe('');
  });

  it('preserva alfanuméricos, espacios, guiones y guiones bajos', () => {
    expect(sanitizePostgrestSearch('hola_mundo-123')).toBe('hola_mundo-123');
    expect(sanitizePostgrestSearch('PROV 001')).toBe('PROV 001');
  });

  it('preserva acentos latinos', () => {
    expect(sanitizePostgrestSearch('María Pérez')).toBe('María Pérez');
    expect(sanitizePostgrestSearch('Niño Ñandú')).toBe('Niño Ñandú');
  });

  it('elimina caracteres reservados de PostgREST (.,()*%:)', () => {
    expect(sanitizePostgrestSearch('hola,mundo')).toBe('hola mundo');
    expect(sanitizePostgrestSearch('a.b.c')).toBe('a b c');
    expect(sanitizePostgrestSearch('test(extra)')).toBe('test extra');
    expect(sanitizePostgrestSearch('100%')).toBe('100');
    expect(sanitizePostgrestSearch('col:op')).toBe('col op');
  });

  it('neutraliza intentos de filter injection típicos', () => {
    // Intento de añadir un filtro extra cerrando el ilike e introduciendo otro
    expect(sanitizePostgrestSearch("foo,tenant_id.eq.malicioso")).toBe('foo tenant_id eq malicioso');
    // Intento de wildcard inyectado en ilike
    expect(sanitizePostgrestSearch('foo%bar')).toBe('foo bar');
    // Intento de escape de or() con paréntesis
    expect(sanitizePostgrestSearch('test*(or(x))')).toBe('test or x');
  });

  it('colapsa espacios múltiples', () => {
    expect(sanitizePostgrestSearch('hola    mundo')).toBe('hola mundo');
    expect(sanitizePostgrestSearch('a,,,b')).toBe('a b');
  });

  it('respeta el límite de longitud', () => {
    const big = 'a'.repeat(500);
    expect(sanitizePostgrestSearch(big).length).toBe(100);
    expect(sanitizePostgrestSearch(big, 20).length).toBe(20);
  });

  it('hace trim final', () => {
    expect(sanitizePostgrestSearch('   foo   ')).toBe('foo');
    expect(sanitizePostgrestSearch(',foo,')).toBe('foo');
  });
});
