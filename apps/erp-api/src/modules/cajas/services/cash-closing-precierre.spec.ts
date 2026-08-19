import { CashClosingService } from './cash-closing.service';

/**
 * Regresión 497: el prechequeo de cierre no puede ser más estricto que
 * `cerrar_caja_tx`.
 *
 * Antes exigía un `cpe_id` a toda venta de la sesión. Un ticket interno puro
 * tiene por postcondición `cpe_id` nulo y `cpe_pendiente` en false, así que esa
 * regla rechazaba precisamente la salida válida del writer canónico y dejaba la
 * caja imposible de cerrar desde la pantalla de Cajas. docs/MODULES.md lo fija:
 * "un ticket interno puro no es un CPE pendiente y no bloquea el cierre; un
 * canje fiscal reservado sí debe finalizar".
 */
describe('CashClosingService.validarPrecierre 497', () => {
  const TENANT = 'tenant-497';
  const SESION = 'sesion-497';

  type FilasPorTabla = {
    ventasPendientes?: any[];
    ventasIncompletas?: any[];
  };

  function construirServicio(filas: FilasPorTabla) {
    const llamadasVentasPos: any[] = [];

    const from = jest.fn((tabla: string) => {
      if (tabla === 'sesiones_caja') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          single: async () => ({
            data: { id: SESION, estado: 'ABIERTA', congelada: false },
            error: null,
          }),
        };
        return chain;
      }

      if (tabla === 'ventas_pos') {
        const registro: any = { filtros: [] as string[], usoOr: null as string | null };
        llamadasVentasPos.push(registro);
        const chain: any = {
          select: (cols: string) => {
            registro.columnas = cols;
            return chain;
          },
          eq: (col: string, val: unknown) => {
            registro.filtros.push(`${col}=${String(val)}`);
            return chain;
          },
          neq: (col: string, val: unknown) => {
            registro.filtros.push(`${col}!=${String(val)}`);
            return chain;
          },
          is: (col: string, val: unknown) => {
            registro.filtros.push(`${col} is ${String(val)}`);
            return chain;
          },
          or: (expr: string) => {
            registro.usoOr = expr;
            return chain;
          },
          limit: async () => {
            // La primera consulta es la de cpe_pendiente; la segunda, la de venta
            // incompleta según el contrato del writer.
            const esPrimera = llamadasVentasPos.indexOf(registro) === 0;
            return {
              data: esPrimera
                ? (filas.ventasPendientes ?? [])
                : (filas.ventasIncompletas ?? []),
              error: null,
            };
          },
        };
        return chain;
      }

      const vacio: any = {
        select: () => vacio,
        eq: () => vacio,
        maybeSingle: async () => ({ data: null, error: null }),
        then: undefined,
      };
      // `retiros_caja` se consume sin maybeSingle: se resuelve como promesa.
      return Object.assign(vacio, {
        eq: () => Object.assign(vacio, { then: undefined }),
      });
    });

    const service = new CashClosingService(
      { getClient: () => ({ from }) } as any,
      { validarIntegridad: jest.fn(async () => ({ valido: true, errores: [] })) } as any,
      {} as any,
      { obtenerMonedaTenant: jest.fn(async () => 'PEN') } as any,
      { registrarEvento: jest.fn(async () => undefined) } as any,
    );

    return { service, llamadasVentasPos };
  }

  it('no bloquea el cierre por un ticket interno puro sin CPE', async () => {
    const { service, llamadasVentasPos } = construirServicio({
      ventasPendientes: [],
      ventasIncompletas: [],
    });

    const resultado = await service.validarPrecierre(SESION, TENANT);

    expect(resultado.errores).toEqual([]);
    expect(resultado.valido).toBe(true);

    // La segunda consulta ya no filtra por `cpe_id is null`: pregunta por el
    // efecto contable, que es lo que evalúa cerrar_caja_tx.
    const segunda = llamadasVentasPos[1];
    expect(segunda.filtros).not.toContain('cpe_id is null');
    expect(segunda.usoOr).toBe(
      'accounting_event_id.is.null,atomic_result.is.null,documento_id.is.null',
    );
  });

  it('sigue bloqueando una intención fiscal reservada sin finalizar', async () => {
    const { service } = construirServicio({
      ventasPendientes: [{ id: 'v1', numero_ticket: 'B001-00000009' }],
      ventasIncompletas: [],
    });

    const resultado = await service.validarPrecierre(SESION, TENANT);

    expect(resultado.valido).toBe(false);
    expect(resultado.errores.join(' ')).toContain('pendientes de facturación');
  });

  it('bloquea una venta sin efecto contable, igual que el writer', async () => {
    const { service } = construirServicio({
      ventasPendientes: [],
      ventasIncompletas: [{ id: 'v2', numero_ticket: 'T001-00000003' }],
    });

    const resultado = await service.validarPrecierre(SESION, TENANT);

    expect(resultado.valido).toBe(false);
    expect(resultado.errores.join(' ')).toContain('incompletas');
  });

  it('excluye las ventas anuladas, como hace cerrar_caja_tx', async () => {
    const { service, llamadasVentasPos } = construirServicio({});

    await service.validarPrecierre(SESION, TENANT);

    for (const llamada of llamadasVentasPos) {
      expect(llamada.filtros).toContain('estado!=ANULADA');
    }
  });
});
