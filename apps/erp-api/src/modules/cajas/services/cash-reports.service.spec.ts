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
    eq() {
      return this;
    },
    maybeSingle: jest.fn(async function () {
      return { data: null, error: null };
    }),
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
  it('NO genera asiento de ingreso en el cierre (el ingreso se contabiliza por-venta)', async () => {
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

    const resultado = await service.registrarAsientoCierre('tenant-1', 'sesion-1');

    // Rediseño: el cierre de caja ya NO contabiliza ingreso (cada venta POS lo
    // registra en su asiento por-venta). registrarAsientoCierre hace early-return
    // y no inserta ningún asiento; el cierre solo reconcilia efectivo.
    expect(resultado).toBeNull();
    expect(inserts['asientos_contables']).toBeUndefined();
    expect(inserts['detalle_asientos']).toBeUndefined();
  });
});
