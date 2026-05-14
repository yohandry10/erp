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
    const supabase = createSupabaseMock([
      { fecha: '2026-05-13T12:00:00.000Z', total: 120 },
      { fecha: '2026-05-13T15:00:00.000Z', total: 30 },
    ]);
    const controller = new AnalyticsController(supabase.service as any, {} as any);

    const response = await controller.getVentasTiempo('tenant-analytics', {
      fecha_desde: '2026-05-01',
      fecha_hasta: '2026-05-31',
    });

    expect(response.success).toBe(true);
    expect(response.data.totales.ventasActuales).toBe(150);
    expect(supabase.calls[0]).toMatchObject({ table: 'ventas' });
    expect(supabase.calls[0].filters).toEqual(expect.arrayContaining([
      ['eq', 'tenant_id', 'tenant-analytics'],
      ['gte', 'fecha', '2026-05-01T00:00:00.000Z'],
      ['lte', 'fecha', '2026-05-31T23:59:59.999Z'],
    ]));
  });
});
