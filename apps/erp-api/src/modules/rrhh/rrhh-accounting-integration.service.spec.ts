import { RrhhAccountingIntegrationService } from './rrhh-accounting-integration.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

type Fixtures = Record<string, any>;

const createSupabaseMock = (fixtures: Fixtures = {}) => {
  const inserts: Record<string, any[]> = {
    asientos_contables: [],
    detalle_asientos: []
  };

  const mockClient: any = {
    currentTable: '',
    lastInsert: null,
    eqFilters: {} as Record<string, any>,
    from(table: string) {
      this.currentTable = table;
      this.eqFilters = {};
      return this;
    },
    insert(payload: any) {
      this.lastInsert = payload;
      inserts[this.currentTable] = inserts[this.currentTable] || [];
      inserts[this.currentTable].push(payload);

      if (this.currentTable === 'detalle_asientos') {
        return Promise.resolve({ error: null });
      }

      return this;
    },
    select() {
      return this;
    },
    single: jest.fn(async function () {
      if (this.lastInsert && inserts[this.currentTable]?.length) {
        const payload = Array.isArray(this.lastInsert) ? this.lastInsert[0] : this.lastInsert;
        const prefix = this.currentTable === 'asientos_contables' ? 'asiento' : `id-${this.currentTable}`;
        return { data: { id: `${prefix}-${inserts[this.currentTable].length}`, ...payload }, error: null };
      }

      const data = fixtures[this.currentTable];
      return { data, error: null };
    }),
    maybeSingle: jest.fn(async function () {
      if (this.currentTable === 'plan_cuentas' && this.eqFilters.codigo) {
        return { data: null, error: null };
      }
      const data = fixtures[this.currentTable];
      return { data, error: null };
    }),
    eq(column: string, value: any) {
      this.eqFilters[column] = value;
      return this;
    }
  };

  return { client: mockClient, inserts };
};

describe('RrhhAccountingIntegrationService', () => {
  let service: RrhhAccountingIntegrationService;
  let supabaseService: jest.Mocked<SupabaseService>;
  let inserts: Record<string, any[]>;

  beforeEach(() => {
    const { client, inserts: insertStore } = createSupabaseMock();
    inserts = insertStore;

    supabaseService = {
      getClient: jest.fn(() => client)
    } as unknown as jest.Mocked<SupabaseService>;

    service = new RrhhAccountingIntegrationService(supabaseService);
  });

  it('genera asiento de planilla balanceado y guarda detalles', async () => {
    const planillaData = {
      tenantId: 'tenant-1',
      planillaId: 'plan-1',
      periodo: '2025-01',
      totalIngresos: 1000,
      totalDescuentos: 126,
      totalAportes: 200,
      totalNeto: 874,
      empleados: [
        {
          empleadoId: 'emp-1',
          nombres: 'Juan',
          apellidos: 'Perez',
          numeroDocumento: '12345678',
          ingresos: 1000,
          descuentos: 126,
          aportes: 200,
          neto: 874
        }
      ]
    };

    const asientoId = await service.generarAsientosPlanilla(planillaData);

    expect(asientoId).toBe('asiento-1');
    const asientoPayload = inserts.asientos_contables[0];
    expect(asientoPayload.total_debe).toBeCloseTo(1200);
    expect(asientoPayload.total_haber).toBeCloseTo(1200);
    expect(asientoPayload.referencia).toBe('PLANILLA-plan-1');

    const detalles = inserts.detalle_asientos[0];
    const totalDebe = detalles.reduce((sum, d) => sum + Number(d.debe || 0), 0);
    const totalHaber = detalles.reduce((sum, d) => sum + Number(d.haber || 0), 0);
    const cuenta621 = inserts.plan_cuentas.find((payload: any) => payload.codigo === '621');
    expect(totalDebe).toBeCloseTo(totalHaber);
    expect(detalles.some((d: any) => d.cuenta_id === `id-plan_cuentas-${inserts.plan_cuentas.indexOf(cuenta621) + 1}` && d.debe === 1000)).toBe(true);
  });

  it('rechaza asiento de planilla descuadrado', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    const planillaData = {
      tenantId: 'tenant-1',
      planillaId: 'plan-2',
      periodo: '2025-01',
      totalIngresos: 1000,
      totalDescuentos: 0,
      totalAportes: 0,
      totalNeto: 999,
      empleados: [
        {
          empleadoId: 'emp-1',
          nombres: 'Ana',
          apellidos: 'Diaz',
          numeroDocumento: '98765432',
          ingresos: 1000,
          descuentos: 0,
          aportes: 0,
          neto: 1000
        }
      ]
    };

    await expect(service.generarAsientosPlanilla(planillaData)).rejects.toThrow(
      /El asiento de planilla no cuadra/
    );
    expect(inserts.asientos_contables.length).toBe(0);
    expect(inserts.detalle_asientos.length).toBe(0);
    errorSpy.mockRestore();
  });

  it('genera asiento de pago de planilla con método de pago correcto', async () => {
    const planillaFixture = { id: 'plan-3', tenant_id: 'tenant-1', periodo: '2025-01', total_neto: 500 };
    const { client, inserts: insertStore } = createSupabaseMock({ planillas: planillaFixture });
    inserts = insertStore;
    supabaseService.getClient.mockReturnValue(client);
    service = new RrhhAccountingIntegrationService(supabaseService);

    const asientoId = await service.generarAsientoPagoPlanilla(planillaFixture.id, 'transferencia');

    expect(asientoId).toBe('asiento-1');
    const asiento = inserts.asientos_contables[0];
    expect(asiento.total_debe).toBe(500);
    expect(asiento.total_haber).toBe(500);

    const detalles = inserts.detalle_asientos[0];
    expect(detalles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ debe: 500, haber: 0 }),
        expect.objectContaining({ debe: 0, haber: 500 })
      ])
    );
  });

  it('genera asiento de liquidación validando cuadratura', async () => {
    const liquidacionFixture = {
      id: 'liq-1',
      monto_cts: 500,
      indemnizacion: 1000,
      total_liquidacion: 1500,
      tenant_id: 'tenant-1',
      empleados: { nombres: 'Luis', apellidos: 'Soto', numero_documento: '99887766' }
    };
    const { client, inserts: insertStore } = createSupabaseMock({ liquidaciones: liquidacionFixture });
    inserts = insertStore;
    supabaseService.getClient.mockReturnValue(client);
    service = new RrhhAccountingIntegrationService(supabaseService);

    const asientoId = await service.generarAsientoLiquidacion(liquidacionFixture.id);

    expect(asientoId).toBe('asiento-1');
    const asiento = inserts.asientos_contables[0];
    expect(asiento.total_debe).toBe(1500);
    expect(asiento.total_haber).toBe(1500);

    const detalles = inserts.detalle_asientos[0];
    const totalDebe = detalles.reduce((sum, d) => sum + Number(d.debe || 0), 0);
    const totalHaber = detalles.reduce((sum, d) => sum + Number(d.haber || 0), 0);
    expect(totalDebe).toBeCloseTo(totalHaber);
    expect(detalles.find((d: any) => d.debe === 1000)).toBeTruthy();
  });
});
