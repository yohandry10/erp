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
  it('no anuncia aprobación cuando el trigger devuelve la planilla como calculada', async () => {
    const query: any = {
      update: jest.fn(() => query),
      eq: jest.fn(() => query),
      select: jest.fn().mockResolvedValue({ data: [{ id: 'plan-1', estado: 'calculada' }], error: null }),
    };
    const service = new PlanillasService(
      { getClient: () => ({ from: () => query }) } as any,
      {} as any,
    );

    await expect(service.updatePlanilla('plan-1', { estado: 'aprobada' }, 'tenant-1'))
      .rejects.toBeInstanceOf(ConflictException);
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
  let planillaUpdatePayload: any;

  const client = {
    from: jest.fn((table: string) => {
      if (table === 'planillas') {
        const query = thenableQuery({ error: null });
        query.single = jest.fn().mockResolvedValue({ data: planilla, error: null });
        query.update = jest.fn((payload: any) => {
          planillaUpdatePayload = payload;
          return query;
        });
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
    getPlanillaUpdate: () => planillaUpdatePayload,
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
      expect(harness.getPlanillaUpdate()).toEqual(expect.objectContaining({
        total_ingresos: expectedIncome,
        total_descuentos: expectedDiscount,
        total_neto: expectedNet,
        estado: 'calculada',
      }));
      expect(harness.eventBus.emitPlanillaCalculada).toHaveBeenCalledWith(
        expect.objectContaining({ totalIngresos: expectedIncome, totalNeto: expectedNet }),
      );
    },
  );
});
