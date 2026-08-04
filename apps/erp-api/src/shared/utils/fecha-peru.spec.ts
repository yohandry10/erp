import { fechaHoyEnPeru } from './fecha-peru.util';

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
