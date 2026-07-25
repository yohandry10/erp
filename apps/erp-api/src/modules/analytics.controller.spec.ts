import { BadRequestException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

function createSupabaseMock(rows: any[]) {
  const calls: any[] = [];
  return {
    calls,
    service: {
      getClient: () => ({
        from: (table: string) => {
          const call = { table, columns: '', filters: [] as any[] };
          calls.push(call);
          const builder: any = {
            select(columns: string) {
              call.columns = columns;
              return builder;
            },
            eq(column: string, value: any) {
              call.filters.push(['eq', column, value]);
              return builder;
            },
            gte(column: string, value: any) {
              call.filters.push(['gte', column, value]);
              return builder;
            },
            lte(column: string, value: any) {
              call.filters.push(['lte', column, value]);
              return builder;
            },
            in(column: string, values: any[]) {
              call.filters.push(['in', column, values]);
              return builder;
            },
            not(column: string, op: string, value: any) {
              call.filters.push(['not', column, op, value]);
              return builder;
            },
            order() {
              return builder;
            },
            then(resolve: (value: any) => void) {
              resolve({ data: rows, error: null });
            },
          };
          return builder;
        },
      }),
    },
  };
}

describe('AnalyticsController', () => {
  it('rechaza filtros de fecha inválidos con 400 explícito', async () => {
    const supabase = createSupabaseMock([]);
    const controller = new AnalyticsController(supabase.service as any, {} as any);

    await expect(controller.getVentasTiempo('tenant-1', { fecha_desde: '2026-99-99', fecha_hasta: '2026-05-13' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getVentasTiempo('tenant-1', { periodo: 'decorativo' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('aplica tenant y rango de fechas real al endpoint de ventas en el tiempo', async () => {
    // Las ventas reales se leen de `documentos` (comprobantes emitidos), no de la
    // tabla legacy `ventas`. El helper mapea fecha_emision → fecha.
    const supabase = createSupabaseMock([
      { fecha_emision: '2026-05-13T12:00:00.000Z', total: 120 },
      { fecha_emision: '2026-05-13T15:00:00.000Z', total: 30 },
    ]);
    const controller = new AnalyticsController(supabase.service as any, {} as any);

    const response = await controller.getVentasTiempo('tenant-analytics', {
      fecha_desde: '2026-05-01',
      fecha_hasta: '2026-05-31',
    });

    expect(response.success).toBe(true);
    expect(response.data.totales.ventasActuales).toBe(150);
    expect(supabase.calls[0]).toMatchObject({ table: 'documentos' });
    expect(supabase.calls[0].filters).toEqual(expect.arrayContaining([
      ['eq', 'tenant_id', 'tenant-analytics'],
      ['in', 'tipo_documento', ['FACTURA', 'BOLETA']],
      ['gte', 'fecha_emision', '2026-05-01T00:00:00.000Z'],
      ['lte', 'fecha_emision', '2026-05-31T23:59:59.999Z'],
    ]));
  });

  it('calcula ventas por categoría con importes vendidos y no con conteo de productos', async () => {
    const rowsByTable: Record<string, any[]> = {
      documentos: [{ id: 'doc-1' }, { id: 'doc-2' }],
      documento_detalles: [
        { producto_id: 'prod-1', total_item: 118, valor_venta: 100 },
        { producto_id: 'prod-2', total_item: 59, valor_venta: 50 },
        { producto_id: 'prod-1', total_item: 23.6, valor_venta: 20 },
      ],
      productos: [
        { id: 'prod-1', categoria: 'Alimentos' },
        { id: 'prod-2', categoria: 'Oficina' },
      ],
    };
    const from = jest.fn((table: string) => {
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        neq: jest.fn(() => builder),
        in: jest.fn(() => builder),
        then: (resolve: (value: any) => void) =>
          resolve({ data: rowsByTable[table] ?? [], error: null }),
      };
      return builder;
    });
    const controller = new AnalyticsController({ getClient: () => ({ from }) } as any, {} as any);

    const response = await controller.getVentasCategoria('tenant-analytics');

    expect(response).toMatchObject({
      success: true,
      data: {
        graficoPie: {
          labels: ['Alimentos', 'Oficina'],
          data: [141.6, 59],
        },
      },
    });
    expect(from).toHaveBeenCalledWith('documento_detalles');
  });
});
