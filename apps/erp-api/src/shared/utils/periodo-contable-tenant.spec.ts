import { limpiarCachePaisTenant, periodoContableDelTenant } from './fecha-tenant.util';

/**
 * El periodo contable es el del contribuyente, no el del servidor.
 *
 * `asientos_contables.fecha` es `timestamptz` y hereda el instante del documento
 * de origen. Con el servidor en UTC, `fecha.getMonth()` mete un comprobante
 * emitido a las 19:30 de Lima en el día siguiente; si esa noche es la del 31, en
 * el mes siguiente. Entonces el asiento se valida contra el periodo equivocado y
 * puede colarse en uno cerrado, o quedarse fuera de uno abierto.
 *
 * En producción, 23 de los 179 asientos ya tienen un día distinto en UTC que en
 * Lima. Ninguno cruza un cambio de mes: eso es suerte, no diseño.
 *
 * La distinción que hay que respetar es la de `parseDateLocal` en el frontend:
 * una fecha de calendario no es un instante. Un valor a medianoche UTC exacta
 * viene de una columna `date`, y convertirlo lo retrasaría un día sin motivo.
 */
describe('periodoContableDelTenant', () => {
  const cliente = (pais: string) => ({
    from: () => {
      const cadena: any = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () => ({ data: { pais }, error: null }),
      };
      return cadena;
    },
  });

  beforeEach(() => limpiarCachePaisTenant());

  it('un instante nocturno de Lima pertenece al día que es en Lima', async () => {
    // 31 de julio, 19:30 en Lima = 1 de agosto 00:30 UTC.
    const instante = new Date('2026-08-01T00:30:00Z');
    await expect(periodoContableDelTenant(cliente('PE'), 't-pe', instante)).resolves.toEqual({
      anio: 2026,
      mes: 7,
    });
  });

  it('el mismo instante, para un contribuyente argentino, también es julio', async () => {
    // Argentina es UTC-3: 31 de julio, 21:30.
    const instante = new Date('2026-08-01T00:30:00Z');
    await expect(periodoContableDelTenant(cliente('AR'), 't-ar', instante)).resolves.toEqual({
      anio: 2026,
      mes: 7,
    });
  });

  it('una fecha de calendario no se desplaza', async () => {
    // Medianoche UTC exacta: viene de una columna `date`. Es el 1 de agosto y
    // tiene que seguir siéndolo, no el 31 de julio.
    const calendario = new Date('2026-08-01T00:00:00Z');
    await expect(periodoContableDelTenant(cliente('PE'), 't-pe', calendario)).resolves.toEqual({
      anio: 2026,
      mes: 8,
    });
  });

  it('un instante de media mañana cae en el mismo día en las dos zonas', async () => {
    const instante = new Date('2026-08-15T14:00:00Z');
    await expect(periodoContableDelTenant(cliente('PE'), 't-pe', instante)).resolves.toEqual({
      anio: 2026,
      mes: 8,
    });
  });

  it('el cálculo anterior daba el mes equivocado para ese instante', () => {
    // Deja constancia de por qué se cambió, y sirve de control: si esto dejara de
    // ser cierto, la prueba de arriba ya no estaría demostrando nada.
    const instante = new Date('2026-08-01T00:30:00Z');
    expect(instante.getUTCMonth() + 1).toBe(8);
  });
});
