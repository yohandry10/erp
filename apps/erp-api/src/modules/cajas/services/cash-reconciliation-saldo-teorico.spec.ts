import { CashReconciliationService } from './cash-reconciliation.service';

/**
 * El saldo teórico del arqueo debe salir de donde lo saca `cerrar_caja_tx`.
 *
 * El writer lo lee del `saldo_nuevo` del último movimiento por `secuencia`, y
 * sólo cae a `monto_inicio` cuando la sesión aún no tiene ninguno. Node, en
 * cambio, confiaba en la columna `sesiones_caja.monto_esperado`, que se escribe
 * al abrir la sesión y nadie actualiza después.
 *
 * Comprobado en producción sobre una demo recién creada: apertura de 100 y una
 * venta en efectivo de 74.34. Node esperaba 100 y el writer 174.34. El cajero
 * que entregaba el efectivo correcto recibía «sobrante de 74.30» —el importe de
 * las ventas del día— y se le exigía autorización de supervisor sin motivo;
 * quien entregaba sólo el fondo de apertura pasaba este filtro y sólo lo frenaba
 * el writer, ya con un mensaje distinto.
 */
describe('CashReconciliationService: saldo teórico igual al del writer', () => {
  const TENANT = 'tenant-arqueo';
  const SESION = 'sesion-arqueo';

  function construirServicio(opciones: {
    montoInicio: number;
    montoEsperadoColumna?: number | null;
    ultimoSaldoNuevo?: number | null;
    tolerancia?: number;
    redondeoDocumentado?: number;
    redondeoCantidad?: number;
  }) {
    const ordenes: string[] = [];

    const from = jest.fn((tabla: string) => {
      if (tabla === 'sesiones_caja') {
        const chain: any = {
          select: (columnas: string) => {
            chain.columnas = columnas;
            return chain;
          },
          eq: () => chain,
          single: async () => ({
            data: {
              monto_inicio: opciones.montoInicio,
              monto_esperado: opciones.montoEsperadoColumna ?? null,
              tenant_id: TENANT,
              moneda: 'PEN',
              caja_id: 'caja-arqueo',
            },
            error: null,
          }),
        };
        return chain;
      }

      if (tabla === 'movimientos_caja') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: (columna: string, opts: any) => {
            ordenes.push(`${columna}:${opts?.ascending === false ? 'desc' : 'asc'}`);
            return chain;
          },
          limit: () => chain,
          maybeSingle: async () => ({
            data:
              opciones.ultimoSaldoNuevo === null || opciones.ultimoSaldoNuevo === undefined
                ? null
                : { saldo_nuevo: opciones.ultimoSaldoNuevo },
            error: null,
          }),
        };
        return chain;
      }

      if (tabla === 'tenants') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: { pais: 'PE' }, error: null }),
        };
        return chain;
      }

      throw new Error(`Tabla no esperada en la prueba: ${tabla}`);
    });

    const rpc = jest.fn(async (funcion: string) => {
      if (funcion === 'resolver_tolerancia_cierre_caja_518') {
        return { data: opciones.tolerancia ?? 10, error: null };
      }
      if (funcion === 'resumen_redondeo_documentado_cierre_caja_518') {
        return {
          data: {
            monto: opciones.redondeoDocumentado ?? 0,
            cantidad: opciones.redondeoCantidad ?? 0,
          },
          error: null,
        };
      }
      throw new Error(`RPC no esperada en la prueba: ${funcion}`);
    });

    const supabase = { getClient: () => ({ from, rpc }) } as any;
    return { servicio: new CashReconciliationService(supabase), ordenes, rpc };
  }

  const billetes100 = { billetes: { 100: 1 }, monedas: {} } as any;

  it('usa el último saldo del libro y no la columna obsoleta', async () => {
    // Es el caso real: la columna dice 100 y el libro dice 174.34.
    const { servicio } = construirServicio({
      montoInicio: 100,
      montoEsperadoColumna: 100,
      ultimoSaldoNuevo: 174.3,
    });

    const resultado = await servicio.validarCierre(
      SESION,
      174.3,
      { billetes: { 100: 1, 50: 1, 20: 1 }, monedas: { 2: 2, 0.2: 1, 0.1: 1 } } as any,
      TENANT,
    );

    // Entregar el efectivo correcto no puede salir como diferencia.
    expect(resultado.diferencia).toBeCloseTo(0, 2);
    expect(resultado.requiere_supervisor).toBe(false);
  });

  it('marca como faltante entregar sólo el fondo de apertura', async () => {
    const { servicio } = construirServicio({
      montoInicio: 100,
      montoEsperadoColumna: 100,
      ultimoSaldoNuevo: 174.3,
    });

    const resultado = await servicio.validarCierre(SESION, 100, billetes100, TENANT);

    expect(resultado.diferencia).toBeCloseTo(-74.3, 2);
    expect(resultado.requiere_supervisor).toBe(true);
  });

  it('cae a monto_inicio cuando la sesión no tiene movimientos', async () => {
    const { servicio } = construirServicio({
      montoInicio: 100,
      montoEsperadoColumna: null,
      ultimoSaldoNuevo: null,
    });

    const resultado = await servicio.validarCierre(SESION, 100, billetes100, TENANT);

    expect(resultado.diferencia).toBeCloseTo(0, 2);
  });

  it('lee el movimiento más reciente por secuencia descendente', async () => {
    // El writer ordena por `secuencia`, no por fecha: dos movimientos del mismo
    // instante quedarían ambiguos y el saldo leído podría no ser el último.
    const { servicio, ordenes } = construirServicio({
      montoInicio: 100,
      ultimoSaldoNuevo: 174.3,
    });

    await servicio.validarCierre(SESION, 174.3, {
      billetes: { 100: 1, 50: 1, 20: 1 },
      monedas: { 2: 2, 0.2: 1, 0.1: 1 },
    } as any, TENANT);

    expect(ordenes).toContain('secuencia:desc');
  });

  it('delega la precedencia específica/global al resolver SQL con la caja de la sesión', async () => {
    const { servicio, rpc } = construirServicio({
      montoInicio: 100,
      ultimoSaldoNuevo: 100,
      tolerancia: 3.5,
    });

    const resultado = await servicio.validarCierre(SESION, 100, billetes100, TENANT);

    expect(rpc).toHaveBeenCalledWith('resolver_tolerancia_cierre_caja_518', {
      p_tenant_id: TENANT,
      p_caja_id: 'caja-arqueo',
    });
    expect(resultado.tolerancia).toBe(3.5);
  });

  it('clasifica S/ 0.04 sólo cuando el ledger documenta exactamente S/ 0.04', async () => {
    const { servicio } = construirServicio({
      montoInicio: 203.84,
      ultimoSaldoNuevo: 203.84,
      tolerancia: 0,
      redondeoDocumentado: 0.04,
      redondeoCantidad: 1,
    });

    const resultado = await servicio.validarCierre(
      SESION,
      203.8,
      {
        billetes: { 200: 1 },
        monedas: { 2: 1, 1: 1, 0.5: 1, 0.2: 1, 0.1: 1 },
      } as any,
      TENANT,
    );

    expect(resultado.diferencia).toBeCloseTo(-0.04, 2);
    expect(resultado.tipo_diferencia).toBe('REDONDEO_EFECTIVO_LEGAL');
    expect(resultado.redondeo_efectivo_legal).toBe(true);
    expect(resultado.redondeo_efectivo_documentado).toBe(0.04);
    expect(resultado.redondeo_efectivo_cantidad).toBe(1);
    expect(resultado.requiere_supervisor).toBe(false);
  });

  it('trata S/ -0.04 sin evidencia como faltante que requiere supervisor', async () => {
    const { servicio } = construirServicio({
      montoInicio: 203.84,
      ultimoSaldoNuevo: 203.84,
      tolerancia: 0,
      redondeoDocumentado: 0,
    });

    const resultado = await servicio.validarCierre(
      SESION,
      203.8,
      {
        billetes: { 200: 1 },
        monedas: { 2: 1, 1: 1, 0.5: 1, 0.2: 1, 0.1: 1 },
      } as any,
      TENANT,
    );

    expect(resultado.tipo_diferencia).toBe('FALTANTE');
    expect(resultado.redondeo_efectivo_legal).toBe(false);
    expect(resultado.requiere_supervisor).toBe(true);
  });
});
