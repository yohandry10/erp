import { BadRequestException, ConflictException } from '@nestjs/common';
import { aplicarCreditoEpsPlanilla } from './planillas-eps.util';
import { PlanillasService } from './planillas.service';

const ficha = { activo: true, regimen_laboral_codigo: '01', regimen_salud_codigo: '01', eps_servicios_propios_codigo: '3' };
const empleados = [{ id: 'a', rrhh_peru_fichas_laborales: [ficha] }, { id: 'b', rrhh_peru_fichas_laborales: [ficha] }];
const declaracion = { periodo_cobertura: '2026-07', monto_pagado: 1000, fecha_pago: '2026-07-15', referencia: 'FacturaEPS julio y pago', pago_oportuno: true };
const filas = (a = 108, b = 108) => [a, b].map((bruto, i) => ({ empleado_id: i ? 'b' : 'a', total_aportes: bruto,
  neto_pagar: 1000, conceptos: [{ concepto_id: 'essalud', monto: bruto }] }));
const calcular = (cambios: Record<string, any> = {}) => aplicarCreditoEpsPlanilla({ periodo: '2026-07', actorId: 'actor', empleados,
  calculos: filas(), conceptoEssaludId: 'essalud', uitOrigen: 5500, declaracion, hoy: '2026-10-07', ...cambios });

describe('Crédito patronal EPS auditado', () => {
  it.each(['2026-07', '2026-12'])('la planilla personalizada %s paga gratificación EPS sin gravarla con ONP/EsSalud', periodo => {
    const service = new PlanillasService({ getClient: jest.fn() } as any, {} as any);
    const conceptos = ['001', '002', '006', '007', '104', '105', '201'].map(codigo => ({ id: codigo, codigo }));
    const empleado = { id: 'a', fecha_ingreso: '2026-01-01', sueldo_base: 1200, dias_trabajados: 30,
      rrhh_peru_fichas_laborales: [ficha], contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }] };
    const calculo = (service as any).calcularEmpleadoPersonalizado(empleado, conceptos, undefined, periodo);
    const montos = Object.fromEntries(calculo.conceptosDetalle.map((c: any) => [c.id, c.monto]));
    expect(montos).toMatchObject({ '006': 1200, '007': 81, '104': 156, '201': 108 });
    expect(calculo).toMatchObject({ totalIngresos: 2481, totalDescuentos: 156, totalAportes: 108, netoPagar: 2325 });
  });
  it('la personalizada conserva proporción del semestre y asignación familiar en gratificación EPS', () => {
    const service = new PlanillasService({ getClient: jest.fn() } as any, {} as any);
    const conceptos = ['001', '002', '006', '007', '104', '105', '201'].map(codigo => ({ id: codigo, codigo }));
    const empleado = { id: 'a', fecha_ingreso: '2026-03-01', sueldo_base: 1200, dias_trabajados: 30, tiene_hijos: true,
      rrhh_peru_fichas_laborales: [ficha], contratos: [{ estado: 'vigente', regimen_pensionario: 'ONP' }] };
    const calculo = (service as any).calcularEmpleadoPersonalizado(empleado, conceptos, undefined, '2026-07');
    const montos = Object.fromEntries(calculo.conceptosDetalle.map((c: any) => [c.id, c.monto]));
    expect(montos).toMatchObject({ '006': 875.33, '007': 59.08, '104': 170.69, '201': 118.17 });
  });
  it('reduce9% bruto al neto tras25% limitado y conserva sueldo sin generar pagoEPS', () => {
    const calculos = filas();
    const snapshot = calcular({ calculos });
    expect(snapshot).toMatchObject({ aporte_essalud_bruto: 216, credito_generado: 54, credito_aplicado: 54,
      aporte_essalud_neto: 162, credito_saldo: 0, declarado_por: 'actor', monto_pagado: 1000 });
    expect(calculos.map(c => c.total_aportes)).toEqual([81, 81]);
    expect(calculos.map(c => c.neto_pagar)).toEqual([1000, 1000]);
  });
  it.each([[20, 108, 20], [10000, 9000, 1100]])('limitaimporte pagado%s ytopesUIT', (monto_pagado, aporte, esperado) => {
    const snapshot = calcular({ calculos: filas(aporte, aporte), declaracion: { ...declaracion, monto_pagado } });
    expect(snapshot!.credito_generado).toBe(esperado);
  });
  it('el reparto fraccionario suma exactamente el crédito y el aporte neto sin perdercéntimos', () => {
    const calculos = filas(108.01, 108.02);
    const snapshot = calcular({ calculos });
    expect(snapshot!.credito_aplicado).toBe(54);
    expect(calculos.reduce((s, c) => s + c.total_aportes, 0)).toBeCloseTo(162.03, 8);
  });
  it('imputa primero al trabajador EPS y conserva el aporte íntegro del trabajador EsSalud', () => {
    const calculos = filas();
    const snapshot = calcular({ empleados: [empleados[0], { id: 'b' }], calculos });
    expect(snapshot).toMatchObject({ trabajadores_cubiertos_origen: 1, aporte_essalud_origen: 108,
      credito_generado: 27, aporte_essalud_bruto: 216, aporte_essalud_neto: 189 });
    expect(calculos.map(c => c.total_aportes)).toEqual([81, 108]);
    expect(calculos.map(c => c.neto_pagar)).toEqual([1000, 1000]);
  });
  it('el arrastre excedente se aplica al aporte patronal de otros trabajadores sin aportes negativos', () => {
    const calculos = filas();
    const snapshot = calcular({ empleados: [empleados[0], { id: 'b' }], calculos,
      declaracion: { ...declaracion, credito_arrastre_declarado: 100, referencia_arrastre: 'Saldo anterior declarado' } });
    expect(snapshot).toMatchObject({ credito_generado: 27, credito_aplicado: 127, aporte_essalud_neto: 89, credito_saldo: 0 });
    expect(calculos.map(c => c.total_aportes)).toEqual([0, 89]);
  });
  it('empleados EPS sin fila calculada no generan obligación de cobertura ni inflan límites', () => {
    const calculos = filas().slice(1);
    expect(calcular({ empleados: [empleados[0], { id: 'b' }], calculos, declaracion: undefined })).toBeUndefined();
    expect(calculos[0].total_aportes).toBe(108);
  });
  it('consume saldo ERP sin inventar pago ni cobertura cuando ya no hay empleados EPS', () => {
    const calculos = filas();
    const snapshot = calcular({ empleados: [{ id: 'a' }, { id: 'b' }], calculos,
      declaracion: { ...declaracion, monto_pagado: 0, credito_arrastre_declarado: 50,
        referencia_arrastre: 'Saldo de planilla junio', planilla_arrastre_id: '12345678-1234-4123-8123-123456789012' } });
    expect(snapshot).toMatchObject({ aporte_essalud_origen: 0, trabajadores_cubiertos_origen: 0,
      monto_pagado: 0, credito_generado: 0, limite_25_por_ciento: 0, limite_10_uit: 0,
      credito_aplicado: 50, aporte_essalud_neto: 166, credito_saldo: 0 });
    expect(calculos.map(c => c.total_aportes)).toEqual([83, 83]);
  });
  it.each([undefined,'no-es-uuid'])('no acepta arrastre externo sin cubiertos y origen ERP válido %s', planilla_arrastre_id => {
    expect(() => calcular({ empleados: [{ id: 'a' }, { id: 'b' }],
      declaracion: { ...declaracion, monto_pagado: 0, credito_arrastre_declarado: 50,
        referencia_arrastre: 'Saldo sin fuente ERP', planilla_arrastre_id } })).toThrow(BadRequestException);
  });
  it('importa arrastre explícito con referencia,consumehastaaporte yconservasaldo', () => {
    const snapshot = calcular({ declaracion: { ...declaracion, credito_arrastre_declarado: 300, referencia_arrastre: 'SaldoEPS junio antesERP' } });
    expect(snapshot).toMatchObject({ credito_generado: 54, credito_aplicado: 216, aporte_essalud_neto: 0, credito_saldo: 138 });
  });
  it('pago tardío aplicaenmesdelpago ylimitaconbaseyUITdelorigendeclarado', () => {
    const snapshot = calcular({ declaracion: { ...declaracion, periodo_cobertura: '2026-06', pago_oportuno: false,
      aporte_essalud_origen: 400, trabajadores_cubiertos_origen: 2 }, uitOrigen: 5500 });
    expect(snapshot).toMatchObject({ periodo_cobertura: '2026-06', periodo_aplicacion: '2026-07', credito_generado: 100 });
  });
  it.each([
    { monto_pagado: -1 }, { monto_pagado: 1.001 }, { fecha_pago: '2026-02-30' },
    { fecha_pago: '2026-11-01' }, { referencia: '' }, { periodo_cobertura: '2026-08' },
    { credito_arrastre_declarado: 1 }, { pago_oportuno: false, fecha_pago: '2026-08-15' },
    { periodo_cobertura: '2026-06', pago_oportuno: false },
  ])('rechazadeclaraciónincoherente%j', cambio => {
    expect(() => calcular({ declaracion: { ...declaracion, ...cambio } })).toThrow(BadRequestException);
  });
  it('unempleadoEPSsinfuenteauditablenoproduceplanillapatronalincorrecta', () => {
    expect(() => calcular({ declaracion: undefined })).toThrow(ConflictException);
  });
  it('empleadosEsSalud ypaísnoEPS conservancálculosprevios', () => {
    const calculos = filas();
    expect(calcular({ empleados: [{ id: 'a' }, { id: 'b' }], calculos, declaracion: undefined })).toBeUndefined();
    expect(calculos.map(f => f.total_aportes)).toEqual([108, 108]);
  });
  it('eligelaRPCatómicaEPS y actorcon snapshotquecambiafingerprint', async () => {
    const rpc = jest.fn((_name: any, payload: any) => Promise.resolve({ data: { success: true, planillaId: payload.p_planilla_id, idempotent: false, totalEmpleados: payload.p_empleados.length,
      totalIngresos: 2000, totalDescuentos: 0, totalAportes: payload.p_empleados.reduce((sum: number, row: any) => sum + row.total_aportes, 0), totalNeto: 2000 }, error: null }));
    const service = new PlanillasService({ getClient: () => ({ rpc }) } as any, {} as any);
    const calculos = filas().map(row => ({ ...row, total_ingresos: 1000, total_descuentos: 0 })); const snapshot = calcular({ calculos });
    await (service as any).guardarCalculoPlanillaAtomico('planilla', 'tenant', calculos, 'actor', snapshot);
    expect(rpc).toHaveBeenCalledWith('guardar_calculo_planilla_eps_tx_570', expect.objectContaining({
      p_actor_id: 'actor', p_eps: snapshot, p_empleados: calculos,
    }));
  });
});
