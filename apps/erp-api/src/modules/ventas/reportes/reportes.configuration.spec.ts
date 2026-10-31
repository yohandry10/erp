import { ServiceUnavailableException } from '@nestjs/common';
import { ReportesService } from './reportes.service';

describe('ReportesService - habilitación por empresa', () => {
  function setup(config: unknown, error: unknown = null, rows: Record<string, any[]> = {}, failLaterTable?: string) {
    const eq = jest.fn();
    const from = jest.fn((table: string) => {
      let start = 0, end = Infinity;
      const filters: Array<(row: any) => boolean> = [];
      const builder: any = { select: () => builder, eq: (key: string, value: unknown) => { eq(table, key, value); if (key !== 'tenant_id') filters.push(row => row[key] === value); return builder; }, gte: () => builder, lte: () => builder,
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
        order: () => builder, range: (first: number, last: number) => { start = first; end = last; return builder; },
        maybeSingle: async () => ({ data: config, error }), then: (resolve: any) => Promise.resolve({ data: (rows[table] ?? []).filter(row => filters.every(check => check(row))).slice(start, end + 1), error: failLaterTable === table && start >= 1000 ? { message: 'private page failure' } : null }).then(resolve) };
      return builder;
    });
    return { service: new ReportesService({ getClient: () => ({ from }) } as any), from, eq };
  }
  it.each(['error', 'missing'])('falla cerrada si la configuración está %s; no consulta ni inventa métricas', async kind => {
    const { service, from } = setup(null, kind === 'error' ? { message: 'private config error' } : null);
    await expect(service.getFillRateOtif('tenant-a')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.getSunatMetricas('tenant-a')).rejects.toThrow('configuración');
    expect(from.mock.calls.every(([table]) => table === 'empresa_config')).toBe(true);
  });
  it('respeta false y objetivo cero sin consultas de negocio y filtra la empresa', async () => {
    const { service, from, eq } = setup({ habilitar_dashboards_otif: false, habilitar_dashboards_sunat: false, objetivo_otif: 0, frecuencia_actualizacion_dashboards: 1 });
    expect(await service.getFillRateOtif('tenant-a')).toMatchObject({ habilitado: false, objetivoOtif: 0, frecuenciaActualizacion: 1 });
    expect(await service.getSunatMetricas('tenant-a')).toMatchObject({ habilitado: false, frecuenciaActualizacion: 1 });
    expect(from.mock.calls.every(([table]) => table === 'empresa_config')).toBe(true);
    expect(eq).toHaveBeenCalledWith('empresa_config', 'tenant_id', 'tenant-a');
  });
  it('distingue habilitado sin pedidos de un reporte deshabilitado', async () => {
    const { service, from } = setup({ habilitar_dashboards_otif: true, objetivo_otif: 95 });
    expect(await service.getFillRateOtif('tenant-a')).toMatchObject({ habilitado: true, resumen: { pedidosAnalizados: 0 } });
    expect(from).toHaveBeenCalledWith('pedidos_venta');
  });
  it('lee despachos registrados, excluye cancelados/pendientes y calcula OTIF sólo con entrega confirmada completa y en plazo local', async () => {
    const orders = [
      { id: 'complete', estado: 'FACTURADO', tracking_estado: 'ENTREGADO', tracking_actualizado_en: '2026-10-07T02:00:00Z' },
      { id: 'partial', estado: 'DESPACHO_PARCIAL', tracking_estado: 'ENTREGADO', tracking_actualizado_en: '2026-10-02T20:00:00Z' },
      { id: 'late', estado: 'FACTURADO', tracking_estado: 'ENTREGADO', tracking_actualizado_en: '2026-10-07T20:00:00Z' },
      { id: 'unknown', estado: 'FACTURADO', tracking_estado: 'EN_TRANSITO' },
      { id: 'canceled', estado: 'CANCELADO' }, { id: 'draft', estado: 'PENDIENTE' },
    ].map(row => ({ ...row, numero: row.id, fecha: '2026-10-01' }));
    const { service, from } = setup({ habilitar_dashboards_otif: true, objetivo_otif: 95, pais: 'PE' }, null, {
      pedidos_venta: orders,
      pedidos_venta_detalle: orders.map(row => ({ id: row.id, pedido_id: row.id, cantidad: 1 })),
      pedido_despachos: orders.map(row => ({ id: row.id, pedido_id: row.id, cantidad: row.id === 'partial' ? 0.5 : 1, estado: 'REGISTRADO' })).concat([{ id: 'void', pedido_id: 'partial', cantidad: 100, estado: 'ANULADO' }]),
      pedido_backorders: [{ id: 'bo-closed', pedido_id: 'unknown', cantidad_pendiente: 2, estado: 'CANCELADO' }, { id: 'bo-open', pedido_id: 'partial', detalle_id: 'partial', cantidad_pendiente: 0.5, prioridad: 1, estado: 'PENDIENTE' }],
    });
    const report = await service.getFillRateOtif('tenant-a');
    expect(report.resumen).toMatchObject({ pedidosAnalizados: 4, totalSolicitado: 4, totalEntregado: 3.5, fillRate: 87.5, pedidosConEntregaConfirmada: 3, pedidosOtif: 1, otif: 33.33, pedidosConBackorder: 1, unidadesPendientesBackorder: 0.5 });
    expect(report.detalle.find(row => row.pedido_id === 'complete')).toMatchObject({ diasHastaEntrega: 5, dentroDeSla: true });
    expect(report.detalle.find(row => row.pedido_id === 'unknown')).toMatchObject({ diasHastaEntrega: null, dentroDeSla: null });
    expect(from).not.toHaveBeenCalledWith('movimientos_inventario');
  });
  it('no convierte despacho en entrega a tiempo cuando falta tracking o la fecha es imposible', async () => {
    const { service } = setup({ habilitar_dashboards_otif: true }, null, {
      pedidos_venta: [{ id: 'unknown', estado: 'FACTURADO', fecha: '2026-10-08', tracking_estado: 'EN_TRANSITO' }, { id: 'invalid', estado: 'FACTURADO', fecha: '2026-10-08', tracking_estado: 'ENTREGADO', tracking_actualizado_en: '2026-10-01T10:00:00Z' }],
      pedidos_venta_detalle: ['unknown', 'invalid'].map(id => ({ id, pedido_id: id, cantidad: 1 })),
      pedido_despachos: ['unknown', 'invalid'].map(id => ({ id, pedido_id: id, cantidad: 1, estado: 'REGISTRADO' })),
    });
    expect((await service.getFillRateOtif('tenant-a')).resumen).toMatchObject({ totalEntregado: 2, fillRate: 100, pedidosConEntregaConfirmada: 0, pedidosOtif: 0, otif: null });
  });
  it('recorre más de mil pedidos y líneas en bloques sin perder cantidades', async () => {
    const orders = Array.from({ length: 1001 }, (_, i) => ({ id: `p-${i}`, numero: `p-${i}`, estado: 'CONFIRMADO', fecha: '2026-10-01' }));
    const { service } = setup({ habilitar_dashboards_otif: true }, null, {
      pedidos_venta: orders, pedidos_venta_detalle: orders.map(row => ({ id: row.id, pedido_id: row.id, cantidad: 1 })),
      pedido_despachos: orders.map(row => ({ id: row.id, pedido_id: row.id, cantidad: 1, estado: 'REGISTRADO' })),
    });
    expect((await service.getFillRateOtif('tenant-a')).resumen).toMatchObject({ pedidosAnalizados: 1001, totalSolicitado: 1001, totalEntregado: 1001, fillRate: 100, otif: null });
  });
  it('rechaza un fallo de página posterior sin devolver un agregado parcial', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `p-${i}`, estado: 'CONFIRMADO' }));
    const { service } = setup({ habilitar_dashboards_otif: true }, null, { pedidos_venta: rows }, 'pedidos_venta');
    await expect(service.getFillRateOtif('tenant-a')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
