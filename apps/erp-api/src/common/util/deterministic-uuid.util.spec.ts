import { buildDeterministicUuid } from './deterministic-uuid.util';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('buildDeterministicUuid', () => {
  it('produce un uuid válido y con versión 5', () => {
    expect(buildDeterministicUuid('cierre-anual:tenant-1:2026')).toMatch(UUID_RE);
  });

  it('es estable: la misma clave devuelve siempre el mismo uuid', () => {
    const primero = buildDeterministicUuid('revaluacion:tenant-1:2026-08-31');
    const segundo = buildDeterministicUuid('revaluacion:tenant-1:2026-08-31');
    expect(primero).toBe(segundo);
  });

  it('claves distintas no colisionan', () => {
    const claves = [
      'cierre-anual:tenant-1:2026',
      'cierre-anual:tenant-1:2027',
      'cierre-anual:tenant-2:2026',
      'revaluacion:tenant-1:2026-08-31',
    ];
    expect(new Set(claves.map(buildDeterministicUuid)).size).toBe(claves.length);
  });

  it('la variante RFC 4122 queda fijada aunque el hash empiece por otro valor', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(buildDeterministicUuid(`clave-${i}`)).toMatch(UUID_RE);
    }
  });
});
