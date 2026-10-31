import { CxpService } from './cxp/cxp.service';
import { TesoreriaService } from './tesoreria/tesoreria.service';
import { limpiarCachePaisTenant } from '../../shared/utils/fecha-tenant.util';

// Render corre en UTC: a las 20:00 de Lima del 19 el servidor ya está en el 20.
// Estas lecturas deben seguir usando el día del contribuyente (Lima). La zona del
// proceso no se puede cambiar desde la prueba: CI corre en UTC y localmente se
// ejecuta con TZ=UTC (en zona Lima pasaría también con el código defectuoso).
const AHORA = new Date('2026-10-20T01:00:00.000Z');
const HOY_LIMA = '2026-10-19';

/** Cliente simulado: registra filtros y devuelve filas por tabla. */
function clienteSimulado(filas: Record<string, any[]>) {
  const filtros: Array<[string, string, unknown]> = [];
  const from = (tabla: string) => {
    const resultado = () => Promise.resolve({
      data: tabla === 'empresa_config' ? { pais: 'PE' } : filas[tabla] ?? [],
      error: null,
      count: (filas[tabla] ?? []).length,
    });
    const builder: any = {};
    for (const metodo of ['select', 'eq', 'in', 'gt', 'gte', 'lte', 'lt', 'neq', 'order', 'range', 'limit']) {
      builder[metodo] = (columna: string, valor: unknown) => {
        filtros.push([tabla, `${metodo}:${columna}`, valor]);
        return builder;
      };
    }
    builder.maybeSingle = resultado;
    builder.single = resultado;
    builder.then = (ok: any, ko: any) => resultado().then(ok, ko);
    return builder;
  };
  return { cliente: { from }, filtros };
}

describe('Fechas de CxP y tesorería en el día del contribuyente con el servidor en UTC', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: AHORA, doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => limpiarCachePaisTenant());

  const deuda = (id: string, fecha_vencimiento: string) => ({
    id, proveedor_id: 'prov-1', numero_documento: id, fecha_emision: '2026-10-01', fecha_vencimiento,
    subtotal: 100, igv: 18, total: 118, saldo: 118, moneda: 'PEN', estado: 'PENDIENTE', proveedor: { razon_social: 'Proveedor' },
  });

  it('próximos vencimientos parten de hoy en Lima e incluyen la deuda de hoy con 0 días', async () => {
    const { cliente, filtros } = clienteSimulado({ cuentas_por_pagar: [deuda('hoy', HOY_LIMA)] });
    const service = new CxpService({ getClient: () => cliente } as any, {} as any, {} as any);

    const resultado: any = await service.obtenerProximosVencimientos('tenant-1', { dias: 7 } as any);

    expect(filtros).toContainEqual(['cuentas_por_pagar', 'gte:fecha_vencimiento', HOY_LIMA]);
    expect(filtros).toContainEqual(['cuentas_por_pagar', 'lte:fecha_vencimiento', '2026-10-26']);
    expect(resultado.data.fecha_consulta).toBe(HOY_LIMA);
    expect(resultado.data.vencimientos[0].dias_hasta_vencimiento).toBe(0);
  });

  it('la antigüedad cuenta 0 días para la deuda de hoy y 1 para la de ayer', async () => {
    const { cliente } = clienteSimulado({ cuentas_por_pagar: [deuda('hoy', HOY_LIMA), deuda('ayer', '2026-10-18')] });
    const service = new CxpService({ getClient: () => cliente } as any, {} as any, {} as any);

    const resultado: any = await service.obtenerAgingCxp('tenant-1');
    const dias = Object.fromEntries(resultado.data.detalle.map((fila: any) => [fila.numero_documento, fila.dias_vencidos]));

    expect(dias).toEqual({ hoy: 0, ayer: 1 });
  });

  it('la programación de tesorería no marca vencida la deuda de hoy', async () => {
    const { cliente } = clienteSimulado({ cuentas_por_pagar: [deuda('hoy', HOY_LIMA), deuda('ayer', '2026-10-18')] });
    const service = new TesoreriaService({ getClient: () => cliente } as any, {} as any, {} as any);

    const resultado: any = await service.obtenerProgramacionPagos('tenant-1', {} as any);
    const urgencia = Object.fromEntries(resultado.data.map((fila: any) => [fila.id, [fila.urgencia, fila.dias_hasta_vencimiento]]));

    expect(urgencia).toEqual({ hoy: ['HOY', 0], ayer: ['VENCIDA', -1] });
  });

  it('el flujo de caja proyectado empieza hoy en Lima', async () => {
    const { cliente } = clienteSimulado({ cuentas_bancarias: [] });
    const service = new TesoreriaService({ getClient: () => cliente } as any, {} as any, {} as any);

    const resultado: any = await service.obtenerFlujoCaja('tenant-1', {} as any);

    expect(resultado.data.periodo.fecha_desde).toBe(HOY_LIMA);
  });
});
