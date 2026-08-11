import { PlanillasService } from './planillas.service';
import { ConflictException } from '@nestjs/common';

type Country = 'PE' | 'AR' | 'CO';

const countryConcepts: Record<Country, string[]> = {
  PE: ['001', '002', '006', '007', '008', '101', '102', '103', '104', '105', '201'],
  AR: ['AR001', 'AR002', 'AR003', 'AR004', 'AR005', 'AR006', 'AR101', 'AR102', 'AR103', 'AR104', 'AR105', 'AR201', 'AR202', 'AR203'],
  CO: ['CO001', 'CO002', 'CO003', 'CO004', 'CO005', 'CO006', 'CO007', 'CO008', 'CO009', 'CO101', 'CO102', 'CO103', 'CO104', 'CO105', 'CO201', 'CO202', 'CO203', 'CO204', 'CO205', 'CO206', 'CO207', 'CO208', 'CO209', 'CO210'],
};

const thenableQuery = (result: any) => {
  const query: any = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    eq: jest.fn(() => query),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

describe('PlanillasService approval persistence', () => {
  it('crea siempre en borrador y descarta campos de ciclo/totales enviados por el cliente', async () => {
    const select = jest.fn().mockResolvedValue({
      data: [{ id: 'plan-1', estado: 'borrador' }],
      error: null,
    });
    const insert = jest.fn().mockReturnValue({ select });
    const service = new PlanillasService(
      { getClient: () => ({ from: () => ({ insert }) }) } as any,
      {} as any,
    );

    await expect(service.crearPlanilla({
      periodo: '2026-08',
      estado: 'pagada',
      estado_pago: 'pagado',
      total_neto: 9999,
      total_pagado: 9999,
      asientos_generados: 'true',
      metodo_pago: 'efectivo',
      observaciones: 'Alta segura',
    }, 'tenant-1')).resolves.toMatchObject({ id: 'plan-1' });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: 'tenant-1',
      periodo: '2026-08',
      estado: 'borrador',
      estado_pago: 'pendiente',
      total_neto: 0,
      total_pagado: 0,
      asientos_generados: 'false',
      metadata: { observaciones: 'Alta segura' },
    }));
    const payload = insert.mock.calls[0][0];
    expect(payload.metodo_pago).toBeUndefined();
  });

  it('delega el alias PUT a la RPC que aprueba y deja el devengo durable', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        success: true,
        eventId: '44444444-4444-4444-8444-444444444444',
        idempotent: false,
      },
      error: null,
    });
    const service = new PlanillasService(
      { getClient: () => ({ rpc }) } as any,
      {} as any,
    );

    await expect(service.updatePlanilla(
      'plan-1',
      { estado: 'aprobada' },
      'tenant-1',
      'user-1',
    )).resolves.toMatchObject({ success: true, data: { eventId: expect.any(String) } });
    expect(rpc).toHaveBeenCalledWith('aprobar_planilla_tx', {
      p_tenant_id: 'tenant-1',
      p_planilla_id: 'plan-1',
      p_usuario_id: 'user-1',
    });
  });

  it('rechaza saltos de estado distintos del alias de aprobación', async () => {
    const service = new PlanillasService({} as any, {} as any);
    await expect(service.updatePlanilla('plan-1', { estado: 'pagada' }, 'tenant-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('retira pagos parciales del alias legado y delega el conjunto completo', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { success: true, totalPagado: 2640, empleadosPagados: 2 },
      error: null,
    });
    const detallesQuery = thenableQuery({
      data: [{ id: 'detalle-1' }, { id: 'detalle-2' }],
      error: null,
    });
    const service = new PlanillasService(
      {
        getClient: () => ({
          from: jest.fn(() => detallesQuery),
          rpc,
        }),
      } as any,
      {} as any,
    );

    await expect(service.pagarEmpleadosSeleccionados(
      'plan-1',
      { empleados_ids: ['detalle-1'], metodo_pago: 'transferencia' },
      'tenant-1',
      'user-1',
    )).rejects.toBeInstanceOf(ConflictException);
    expect(rpc).not.toHaveBeenCalled();

    await expect(service.pagarEmpleadosSeleccionados(
      'plan-1',
      { empleados_ids: [], metodo_pago: 'transferencia' },
      'tenant-1',
      'user-1',
    )).rejects.toBeInstanceOf(ConflictException);
    expect(rpc).not.toHaveBeenCalled();

    await expect(service.pagarEmpleadosSeleccionados(
      'plan-1',
      { empleados_ids: ['detalle-1', 'detalle-2'], metodo_pago: 'transferencia' },
      'tenant-1',
      'user-1',
    )).resolves.toMatchObject({ success: true, data: { empleadosPagados: 2 } });
    expect(rpc).toHaveBeenCalledWith('pagar_planilla_completa_tx', {
      p_tenant_id: 'tenant-1',
      p_planilla_id: 'plan-1',
      p_metodo_pago: 'transferencia',
      p_usuario_id: 'user-1',
    });
  });

  it('delega /pagos/:id/procesar a la planilla vinculada', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { success: true, totalPagado: 900, empleadosPagados: 1 },
      error: null,
    });
    const pagoQuery: any = {
      select: jest.fn(() => pagoQuery),
      eq: jest.fn(() => pagoQuery),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: 'pago-1',
          planilla_id: 'plan-1',
          metodo_pago: 'transferencia',
        },
        error: null,
      }),
    };
    const service = new PlanillasService(
      { getClient: () => ({ from: () => pagoQuery, rpc }) } as any,
      {} as any,
    );

    await expect(service.procesarPagoLegado('pago-1', 'tenant-1', 'user-1'))
      .resolves.toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith('pagar_planilla_completa_tx', expect.objectContaining({
      p_planilla_id: 'plan-1',
      p_metodo_pago: 'transferencia',
      p_usuario_id: 'user-1',
    }));
  });
});

function buildHarness(country: Country) {
  const planilla = { estado: 'borrador', periodo: '2026-08' };
  const employee = {
    id: `employee-${country}`,
    nombres: 'Empleado',
    apellidos: country,
    numero_documento: country === 'AR' ? '27301234568' : country === 'CO' ? '52345678' : '12345678',
    estado: 'activo',
    fecha_ingreso: '2024-01-01',
    tiene_hijos: false,
    contratos: [{
      estado: 'vigente',
      fecha_inicio: '2024-01-01',
      sueldo_bruto: country === 'AR' ? 1_000_000 : country === 'CO' ? 2_500_000 : 2_000,
      regimen_pensionario: 'ONP',
    }],
  };
  let employeePlanillaPayload: any;
  let calculationRpcPayload: any;

  const client = {
    rpc: jest.fn((name: string, payload: any) => {
      if (name !== 'guardar_calculo_planilla_tx') {
        throw new Error(`RPC no contemplado por la prueba: ${name}`);
      }
      calculationRpcPayload = payload;
      employeePlanillaPayload = payload.p_empleados?.[0];
      return Promise.resolve({ data: { success: true, total_empleados: 1 }, error: null });
    }),
    from: jest.fn((table: string) => {
      if (table === 'planillas') {
        const query = thenableQuery({ error: null });
        query.single = jest.fn().mockResolvedValue({ data: planilla, error: null });
        return query;
      }
      if (table === 'empleados') {
        return thenableQuery({ data: [employee], error: null });
      }
      if (table === 'empleado_planilla') {
        return {
          insert: jest.fn((payload: any) => {
            employeePlanillaPayload = payload;
            return { select: jest.fn().mockResolvedValue({ data: [{ id: 'employee-payroll-1' }], error: null }) };
          }),
        };
      }
      if (table === 'empleado_planilla_conceptos') {
        return { insert: jest.fn().mockResolvedValue({ error: null }) };
      }
      throw new Error(`Tabla no contemplada por la prueba: ${table}`);
    }),
  };
  const eventBus = { emitPlanillaCalculada: jest.fn() };
  const countryService = {
    obtenerContexto: jest.fn().mockResolvedValue({ codigo: country }),
  };
  const service = new PlanillasService(
    { getClient: jest.fn(() => client) } as any,
    eventBus as any,
    countryService as any,
  );

  jest.spyOn(service, 'getConceptos').mockResolvedValue({
    success: true,
    data: countryConcepts[country].map((codigo) => ({ id: `concept-${codigo}`, codigo })),
  });
  jest.spyOn(service as any, 'obtenerNormativaPeruPeriodo').mockResolvedValue(null);
  jest.spyOn(service as any, 'obtenerNormativaArgentinaPeriodo').mockResolvedValue(null);
  jest.spyOn(service as any, 'obtenerNormativaColombiaPeriodo').mockResolvedValue(null);
  jest.spyOn(service as any, 'obtenerDiasVacacionesDelPeriodo').mockResolvedValue(new Map());

  return {
    service,
    countryService,
    eventBus,
    getEmployeePayload: () => employeePlanillaPayload,
    getCalculationRpcPayload: () => calculationRpcPayload,
  };
}

describe('PlanillasService — despacho normativo por país', () => {
  it.each([
    ['PE', 2_000, 260, 1_740],
    ['AR', 1_000_000, 170_000, 830_000],
    ['CO', 2_749_095, 200_000, 2_549_095],
  ] as const)(
    'resuelve el tenant %s, usa su motor y persiste sus totales',
    async (country, expectedIncome, expectedDiscount, expectedNet) => {
      const harness = buildHarness(country);

      const result = await harness.service.calcularPlanillaMensual('payroll-1', `tenant-${country}`);

      expect(harness.countryService.obtenerContexto).toHaveBeenCalledWith(`tenant-${country}`);
      expect(result).toEqual(expect.objectContaining({
        success: true,
        totalEmpleados: 1,
        totalIngresos: expectedIncome,
        totalDescuentos: expectedDiscount,
        totalNeto: expectedNet,
      }));
      expect(harness.getEmployeePayload()).toEqual(expect.objectContaining({
        total_ingresos: expectedIncome,
        total_descuentos: expectedDiscount,
        neto_pagar: expectedNet,
      }));
      expect(harness.getCalculationRpcPayload()).toEqual(expect.objectContaining({
        p_tenant_id: `tenant-${country}`,
        p_planilla_id: 'payroll-1',
        p_empleados: expect.any(Array),
      }));
      expect(harness.eventBus.emitPlanillaCalculada).toHaveBeenCalledWith(
        expect.objectContaining({ totalIngresos: expectedIncome, totalNeto: expectedNet }),
      );
    },
  );
});
