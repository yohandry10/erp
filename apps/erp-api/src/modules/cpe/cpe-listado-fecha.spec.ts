import { fechaDeDocumentoEnPais } from '../../shared/utils/fecha-peru.util';

/**
 * La fecha que enseña el listado de comprobantes tiene que ser la que declara
 * el XML.
 *
 * `cpe.fecha_emision` se guarda como fecha pura (`YYYY-MM-DD`), y el listado la
 * pasaba por `new Date(...).toLocaleDateString(..., { timeZone })`. Eso convierte
 * un **instante**, no una fecha: `new Date('2026-08-28')` es medianoche UTC, que
 * en Lima son las 19:00 del 27. Comprobado el 2026-08-28 con una boleta cuyo
 * `IssueDate` era 2026-08-28 y cuya fila del listado decía 2026-08-27.
 *
 * La conversión se había introducido por el problema contrario --a las 20:15 de
 * Lima un comprobante salía fechado al día siguiente-- así que no vale con
 * quitarla: hay que distinguir la fecha pura del instante.
 */
describe('fecha de un comprobante en el listado', () => {
  const LIMA = 'America/Lima';
  const BOGOTA = 'America/Bogota';

  it('una fecha pura no se mueve de día', () => {
    // El caso que estaba roto.
    expect(fechaDeDocumentoEnPais('2026-08-28', LIMA)).toBe('2026-08-28');
    expect(fechaDeDocumentoEnPais('2026-01-01', LIMA)).toBe('2026-01-01');
  });

  it('una fecha con medianoche literal tampoco', () => {
    // Postgres puede devolver `date` como `2026-08-28 00:00:00` sin zona.
    expect(fechaDeDocumentoEnPais('2026-08-28 00:00:00', LIMA)).toBe('2026-08-28');
    expect(fechaDeDocumentoEnPais('2026-08-28T00:00:00', LIMA)).toBe('2026-08-28');
  });

  it('un instante de la tarde sí se convierte a la zona del contribuyente', () => {
    // Lo que motivó la conversión: 20:15 en Lima son las 01:15 UTC del día
    // siguiente. Sin convertir, el comprobante salía con fecha futura.
    expect(fechaDeDocumentoEnPais('2026-08-29T01:15:00.000Z', LIMA)).toBe('2026-08-28');
    expect(fechaDeDocumentoEnPais('2026-08-28T20:41:52.325Z', LIMA)).toBe('2026-08-28');
  });

  it('respeta la zona de cada país', () => {
    // Argentina es UTC-3: el mismo instante cae en otro día que en Lima.
    expect(fechaDeDocumentoEnPais('2026-08-29T02:30:00.000Z', 'America/Lima')).toBe('2026-08-28');
    expect(fechaDeDocumentoEnPais('2026-08-29T02:30:00.000Z', 'America/Argentina/Buenos_Aires')).toBe('2026-08-28');
    expect(fechaDeDocumentoEnPais('2026-08-29T04:30:00.000Z', 'America/Argentina/Buenos_Aires')).toBe('2026-08-29');
  });

  it('en Colombia conserva la fecha civil y convierte un instante UTC a Bogotá', () => {
    expect(fechaDeDocumentoEnPais('2026-08-29', BOGOTA)).toBe('2026-08-29');
    expect(fechaDeDocumentoEnPais('2026-08-30T02:30:00.000Z', BOGOTA)).toBe('2026-08-29');
    expect(fechaDeDocumentoEnPais('2026-08-29T23:30:00-05:00', BOGOTA)).toBe('2026-08-29');
  });

  it('un valor vacío o ilegible no inventa una fecha', () => {
    expect(fechaDeDocumentoEnPais(null, LIMA)).toBe('');
    expect(fechaDeDocumentoEnPais('', LIMA)).toBe('');
    expect(fechaDeDocumentoEnPais('ayer', LIMA)).toBe('');
  });

  it('una fecha guardada como timestamptz a medianoche UTC tampoco se mueve', () => {
    // El caso real, y el que se escapó al primer arreglo: `cpe.fecha_emision`
    // es `timestamp with time zone` y guarda `2026-08-28 00:00:00+00`, que
    // PostgREST serializa con desfase explícito. La expresión anterior sólo
    // aceptaba la fecha pelada o con hora sin desfase, así que esto caía a la
    // conversión y volvía a restar un día. Verificado contra producción: el XML
    // declaraba 2026-08-28 y el listado seguía diciendo 2026-08-27.
    expect(fechaDeDocumentoEnPais('2026-08-28T00:00:00+00:00', LIMA)).toBe('2026-08-28');
    expect(fechaDeDocumentoEnPais('2026-08-28 00:00:00+00', LIMA)).toBe('2026-08-28');
    expect(fechaDeDocumentoEnPais('2026-08-28T00:00:00.000Z', LIMA)).toBe('2026-08-28');
  });

  it('pero un instante real de medianoche en otro huso sí se convierte', () => {
    // Medianoche **de Lima** es un instante, no una fecha: son las 05:00 UTC.
    // Sólo se considera «fecha» la medianoche en UTC, que es como Postgres
    // guarda una fecha pura en esta base.
    expect(fechaDeDocumentoEnPais('2026-08-29T00:00:00-05:00', LIMA)).toBe('2026-08-29');
    expect(fechaDeDocumentoEnPais('2026-08-29T02:00:00+00:00', LIMA)).toBe('2026-08-28');
  });
});
