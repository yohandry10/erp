import { fechaHoyEnPais, fechaHoyEnPeru, rangoDelDiaEnPais, zonaHorariaDePais } from './fecha-peru.util';

/**
 * La ventana que rompia la emision: entre las 19:00 y las 24:00 de Lima, UTC ya
 * esta en el dia siguiente. Si el comprobante se fecha en UTC y el validador
 * compara contra America/Lima, el propio sistema rechaza la factura por futura.
 */
describe('fechaHoyEnPeru', () => {
  it('a las 20:00 de Lima devuelve el dia de Lima, no el de UTC', () => {
    // 2026-08-04T01:00:00Z = 2026-08-03 20:00 en Lima.
    const instante = new Date('2026-08-04T01:00:00Z');

    expect(instante.toISOString().slice(0, 10)).toBe('2026-08-04');
    expect(fechaHoyEnPeru(instante)).toBe('2026-08-03');
  });

  it('a las 08:00 de Lima coincide con UTC', () => {
    const instante = new Date('2026-08-03T13:00:00Z');

    expect(fechaHoyEnPeru(instante)).toBe('2026-08-03');
  });

  it('justo despues de medianoche en Lima ya es el dia nuevo', () => {
    // 2026-08-04T05:00:00Z = 2026-08-04 00:00 en Lima.
    const instante = new Date('2026-08-04T05:00:00Z');

    expect(fechaHoyEnPeru(instante)).toBe('2026-08-04');
  });

  it('devuelve siempre el formato YYYY-MM-DD que espera SUNAT', () => {
    expect(fechaHoyEnPeru()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * El alcance operativo no es sólo Perú: Colombia está en UTC-5 y Argentina en
 * UTC-3, así que fechar en UTC desplaza el día en los tres países. La tabla debe
 * ser idéntica a `app.zona_horaria_pais` de la migración 370; si divergen, la
 * aplicación y la base dejan de coincidir sobre qué día es.
 */
describe('zonaHorariaDePais', () => {
  it('espeja la tabla de la migración 370', () => {
    expect(zonaHorariaDePais('PE')).toBe('America/Lima');
    expect(zonaHorariaDePais('CO')).toBe('America/Bogota');
    expect(zonaHorariaDePais('EC')).toBe('America/Guayaquil');
    expect(zonaHorariaDePais('BO')).toBe('America/La_Paz');
    expect(zonaHorariaDePais('CL')).toBe('America/Santiago');
    expect(zonaHorariaDePais('AR')).toBe('America/Argentina/Buenos_Aires');
    expect(zonaHorariaDePais('MX')).toBe('America/Mexico_City');
  });

  it('ante un país ausente o desconocido cae a Lima, igual que la base', () => {
    expect(zonaHorariaDePais(null)).toBe('America/Lima');
    expect(zonaHorariaDePais('')).toBe('America/Lima');
    expect(zonaHorariaDePais('  ')).toBe('America/Lima');
    expect(zonaHorariaDePais('XX')).toBe('America/Lima');
  });

  it('no distingue mayúsculas ni espacios', () => {
    expect(zonaHorariaDePais(' co ')).toBe('America/Bogota');
    expect(zonaHorariaDePais('ar')).toBe('America/Argentina/Buenos_Aires');
  });
});

describe('fechaHoyEnPais', () => {
  it('a las 20:00 de Bogotá devuelve el día de Bogotá, no el de UTC', () => {
    // 2026-08-04T01:00:00Z = 2026-08-03 20:00 en Bogotá (UTC-5).
    const instante = new Date('2026-08-04T01:00:00Z');
    expect(instante.toISOString().slice(0, 10)).toBe('2026-08-04');
    expect(fechaHoyEnPais('CO', instante)).toBe('2026-08-03');
  });

  it('a las 22:00 de Buenos Aires devuelve el día argentino', () => {
    // 2026-08-04T01:00:00Z = 2026-08-03 22:00 en Buenos Aires (UTC-3).
    const instante = new Date('2026-08-04T01:00:00Z');
    expect(fechaHoyEnPais('AR', instante)).toBe('2026-08-03');
  });

  it('coincide con fechaHoyEnPeru para PE', () => {
    const instante = new Date('2026-08-04T01:00:00Z');
    expect(fechaHoyEnPais('PE', instante)).toBe(fechaHoyEnPeru(instante));
  });

  it('devuelve siempre YYYY-MM-DD', () => {
    expect(fechaHoyEnPais('CO')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('rangoDelDiaEnPais', () => {
  it('el día peruano empieza a las 05:00Z y dura 24 horas', () => {
    // 2026-08-03 20:00 en Lima: el día local va de 2026-08-03T05:00Z a 08-04T05:00Z.
    const { desde, hasta } = rangoDelDiaEnPais('PE', new Date('2026-08-04T01:00:00Z'));
    expect(desde).toBe('2026-08-03T05:00:00.000Z');
    expect(hasta).toBe('2026-08-04T05:00:00.000Z');
  });

  it('el día argentino empieza a las 03:00Z', () => {
    const { desde, hasta } = rangoDelDiaEnPais('AR', new Date('2026-08-04T01:00:00Z'));
    expect(desde).toBe('2026-08-03T03:00:00.000Z');
    expect(hasta).toBe('2026-08-04T03:00:00.000Z');
  });

  it('el instante de referencia siempre cae dentro de su propio día', () => {
    for (const pais of ['PE', 'CO', 'AR', 'MX']) {
      for (const iso of ['2026-08-04T01:00:00Z', '2026-08-04T13:00:00Z', '2026-01-15T23:30:00Z']) {
        const ref = new Date(iso);
        const { desde, hasta } = rangoDelDiaEnPais(pais, ref);
        expect(new Date(desde).getTime()).toBeLessThanOrEqual(ref.getTime());
        expect(new Date(hasta).getTime()).toBeGreaterThan(ref.getTime());
      }
    }
  });
});
