import { CashReportsService } from './cash-reports.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { ServiceUnavailableException } from '@nestjs/common';

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

describe('CashReportsService - arqueo congelado de reportes', () => {
  const frozen = {
    cierre_administrativo: false, monto_esperado_nominal: 102.52,
    redondeo_efectivo_documentado: .02, redondeo_efectivo_cantidad: 1,
    monto_esperado_fisico: 102.50, monto_contado: 82.50,
    diferencia_operativa: -20, diferencia_nominal: -20.02,
  };
  const session = (close = frozen) => ({ estado: 'CERRADA', moneda: 'PEN', id: 'sesion-1', close_result: close,
    monto_esperado: 999, monto_contado: 0, diferencia: -999 });
  const build = () => new CashReportsService({} as any, {} as any, {} as any);
  const stubReport = (service: CashReportsService, sesion: any) => jest.spyOn(service, 'obtenerDatosReporteCierre').mockResolvedValue({
    sesion, movimientos: [], retiros: [], cambios_turno: [], totales_por_tipo: {},
    resumen_fiscal: { base_imponible: .52, igv: 0, total: .52, cantidad_boletas: 0, cantidad_facturas: 0, cantidad_notas_credito: 0 },
    resumen_metodos_pago: { efectivo: .52, tarjeta: 0, transferencia: 0, otros: 0, cantidad_efectivo: 1, cantidad_tarjeta: 0, cantidad_transferencia: 0, cantidad_otros: 0 },
  });
  it('mantiene nominal, redondeo y faltante del snapshot aunque las columnas actuales difieran', () => {
    const service = build();
    expect((service as any).arqueoPersistido(session())).toEqual({ administrativo: false, nominal: 102.52,
      redondeo: .02, cantidad: 1, esperado: 102.50, contado: 82.50, operativa: -20, diferenciaNominal: -20.02 });
    expect((service as any).lineasArqueoPersistido(session(), 'PEN')).toContain('Diferencia operativa: PEN -20.00 (Faltante)');
  });
  it('no vuelve a descontar el redondeo y rechaza importes de cierre inconsistentes', () => {
    expect(() => (build() as any).arqueoPersistido(session({ ...frozen, diferencia_operativa: -20.02 }))).toThrow(ServiceUnavailableException);
  });
  it('un cierre administrativo no imprime un conteo o diferencia normalizados como reales', () => {
    const lines = (build() as any).lineasArqueoPersistido(session({ ...frozen, cierre_administrativo: true }), 'PEN');
    expect(lines).toContain('Efectivo contado: sin arqueo (cierre administrativo)');
    expect(lines).toContain('Diferencia operativa: no verificada');
    expect(lines).toContain('Diferencia nominal: no verificada');
  });
  it('un cierre anterior sin nominal/redondeo congelados los conserva como desconocidos', () => {
    const old = { estado: 'CERRADA', monto_esperado: 102.5, monto_contado: 82.5, diferencia: -20 };
    expect((build() as any).lineasArqueoPersistido(old, 'PEN')).toContain('Redondeo efectivo documentado: no disponible');
    expect((build() as any).arqueoPersistido(old).nominal).toBeNull();
  });
  it('CSV separa ocho campos de arqueo con los valores congelados', async () => {
    const service = build(); stubReport(service, session());
    const csv = await service.generarCorteCSV('sesion-1', 'tenant-1');
    for (const [field, amount] of [['Saldo nominal','102.52'],['Redondeo efectivo documentado','0.02'],['Efectivo esperado','102.50'],['Efectivo contado','82.50'],['Diferencia operativa','-20.00'],['Diferencia nominal','-20.02']]) {
      expect(csv).toContain(`"ARQUEO","${field}","${amount}"`);
    }
    expect(csv.split('\n').filter(row => row.startsWith('"ARQUEO"'))).toHaveLength(8);
  });
  it('CSV administrativo no afirma arqueo físico', async () => {
    const service = build(); stubReport(service, session({ ...frozen, cierre_administrativo: true }));
    const csv = await service.generarCorteCSV('sesion-1', 'tenant-1');
    expect(csv).toContain('"ARQUEO","Efectivo contado","SIN ARQUEO"');
    expect(csv).toContain('"ARQUEO","Diferencia operativa","NO VERIFICADA"');
  });
  it('una fuente no numérica bloquea la exportación en vez de convertirse en cero', () => {
    expect(() => (build() as any).arqueoPersistido(session({ ...frozen, monto_esperado_nominal: false } as any))).toThrow(ServiceUnavailableException);
  });
});
