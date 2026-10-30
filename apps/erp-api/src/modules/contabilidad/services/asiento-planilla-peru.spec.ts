import { Test, TestingModule } from '@nestjs/testing';
import { AsientosGeneratorService } from './asientos-generator.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { PeriodosService } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('AsientosGeneratorService — planilla Perú (PCGE)', () => {
  let service: AsientosGeneratorService;
  let generarAsiento: jest.SpyInstance;
  let detalle: any[];

  const cuentas = new Map<string, any>(
    ['401', '403', '407', '411', '621', '627'].map((codigo) => [codigo, { id: `cuenta-${codigo}`, codigo }]),
  );

  beforeEach(async () => {
    detalle = [];
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      then: (resolve: any) => resolve({ data: detalle, error: null }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AsientosGeneratorService,
        { provide: SupabaseService, useValue: { getClient: jest.fn(() => ({ from: jest.fn(() => query) })) } },
        { provide: PlanCuentasService, useValue: { obtenerCuentasPorCodigos: jest.fn(async () => cuentas) } },
        { provide: PeriodosService, useValue: { validarPeriodoAbierto: jest.fn() } },
      ],
    }).compile();
    service = module.get(AsientosGeneratorService);
    generarAsiento = jest.spyOn(service as any, 'generarAsiento').mockResolvedValue({ id: 'asiento-1' });
  });

  const lineas = () => generarAsiento.mock.calls[0][3] as any[];
  const empleado = (ingresos: number, aportes: number, conceptos: Array<[string, number]>) => {
    const descuentos = conceptos.reduce((total, [, monto]) => total + monto, 0);
    return { total_ingresos: ingresos, total_descuentos: descuentos, neto_pagar: ingresos - descuentos,
      total_aportes: aportes, empleado_planilla_conceptos: conceptos.map(([codigo, monto]) => ({
        monto, conceptos_planilla: { codigo, metadata: { tipo: 'descuento' } },
      })) };
  };

  it('lleva la AFP a la 407 y EsSalud a la 403', async () => {
    detalle = [empleado(1913, 172.17, [['101', 191.3], ['102', 30], ['103', 25.86]])];
    await service.generarAsientoPlanilla({
      tenant_id: 't', fecha: '2026-10-31', pais_codigo: 'PE', planilla_id: 'p',
      sueldos: 1913, retenciones: 247.16, aportes: 172.17, neto: 1665.84,
    });
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-407', haber: 247.16 }),
      expect.objectContaining({ cuenta_id: 'cuenta-403', haber: 172.17 }),
      expect.objectContaining({ cuenta_id: 'cuenta-411', haber: 1665.84 }),
    ]));
  });

  it('separa ONP y quinta categoría', async () => {
    detalle = [empleado(1500, 135, [['104', 130], ['105', 50]]), empleado(1500, 135, [['101', 130]])];
    await service.generarAsientoPlanilla({
      tenant_id: 't', fecha: '2026-10-31', pais_codigo: 'PE', planilla_id: 'p',
      sueldos: 3000, retenciones: 310, aportes: 270, neto: 2690,
    });
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-407', haber: 130 }),
      expect.objectContaining({ cuenta_id: 'cuenta-403', haber: 400 }),
      expect.objectContaining({ cuenta_id: 'cuenta-401', haber: 50 }),
    ]));
  });

  it('reduce remuneraciones por faltas y tardanzas sin crear una deuda AFP', async () => {
    detalle = [empleado(1200, 108, [['104', 156], ['106', 10], ['107', 40]])];
    await service.generarAsientoPlanilla({ tenant_id: 't', fecha: '2026-07-31', pais_codigo: 'PE', planilla_id: 'p',
      sueldos: 1200, retenciones: 206, aportes: 108, neto: 994 });
    expect(lineas()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cuenta_id: 'cuenta-621', debe: 1150 }),
      expect.objectContaining({ cuenta_id: 'cuenta-403', haber: 264 }),
    ]));
    expect(lineas().some(row => row.cuenta_id === 'cuenta-407')).toBe(false);
    expect(lineas().reduce((total, row) => total + row.debe - row.haber, 0)).toBe(0);
  });

  it('rechaza descuentos sin conceptos y eventos que no corresponden a la planilla', async () => {
    detalle = [empleado(1200, 108, [['104', 156]])];
    const evento = { tenant_id: 't', fecha: '2026-07-31', pais_codigo: 'PE', planilla_id: 'p',
      sueldos: 1200, retenciones: 156, aportes: 108, neto: 1044 };
    await expect(service.generarAsientoPlanilla({ ...evento, sueldos: 1300, neto: 1144 })).rejects.toThrow('persistido');
    detalle[0].empleado_planilla_conceptos = [];
    await expect(service.generarAsientoPlanilla(evento)).rejects.toThrow('conceptos de descuento');
    expect(generarAsiento).not.toHaveBeenCalled();
  });
});
