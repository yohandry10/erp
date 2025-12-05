import { CashReportsService } from './cash-reports.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

const createSupabaseMock = () => {
  const inserts: Record<string, any[]> = {};
  const mockClient: any = {
    currentTable: '',
    inserted: inserts,
    from(table: string) {
      this.currentTable = table;
      inserts[table] = inserts[table] || [];
      return this;
    },
    insert(payload: any) {
      inserts[this.currentTable].push(payload);
      return this;
    },
    select() {
      return this;
    },
    single: jest.fn(async function () {
      return { data: { id: `id-${this.currentTable}-${inserts[this.currentTable].length}` }, error: null };
    }),
  };

  return {
    client: mockClient,
    inserts,
  };
};

describe('CashReportsService - registrarAsientoCierre', () => {
  it('genera asiento y detalles balanceados para cierre de caja', async () => {
    const { client, inserts } = createSupabaseMock();
    const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
    const service = new CashReportsService(
      supabaseService,
      {} as any,
      {} as any,
    );

    // Stub dependencias internas usadas por registrarAsientoCierre
    const resumenFiscal = { base_imponible: 164, igv: 36, total: 200 };
    service['obtenerDatosReporteCierre'] = jest.fn().mockResolvedValue({
      sesion: { cajero_id: 'user-1', abierto_por: 'user-1', moneda: 'PEN' },
      resumen_fiscal: resumenFiscal,
      resumen_metodos_pago: {
        efectivo: 100,
        tarjeta: 50,
        transferencia: 50,
        otros: 0,
        cantidad_efectivo: 1,
        cantidad_tarjeta: 1,
        cantidad_transferencia: 1,
        cantidad_otros: 0,
      },
    });

    service['obtenerCuentasPorCodigo'] = jest.fn().mockResolvedValue({
      '10111': 'cta-efectivo',
      '10411': 'cta-tarjeta',
      '10412': 'cta-transfer',
      '7011': 'cta-ventas',
      '40111': 'cta-igv',
    });

    await service.registrarAsientoCierre('tenant-1', 'sesion-1');

    const asientoRaw = inserts['asientos_contables']?.[0];
    const asiento = Array.isArray(asientoRaw) ? asientoRaw[0] : asientoRaw;
    expect(asiento).toBeTruthy();
    expect(asiento.total_debe).toBeCloseTo(200);
    expect(asiento.total_haber).toBeCloseTo(200);
    expect(asiento.referencia).toBe('SESION:sesion-1');

    const detallesRaw = inserts['detalle_asientos']?.[0];
    const detalles = Array.isArray(detallesRaw) ? detallesRaw : [detallesRaw];
    expect(detalles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cuenta_id: 'cta-efectivo', debe: 100, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cta-tarjeta', debe: 50, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cta-transfer', debe: 50, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cta-ventas', debe: 0, haber: 164 }),
        expect.objectContaining({ cuenta_id: 'cta-igv', debe: 0, haber: 36 }),
      ]),
    );
  });
});
