import {
  calcularPlanillaColombia,
  NORMATIVA_COLOMBIA_2026_DEFAULT,
} from './planillas-colombia.util';

describe('planillas Colombia', () => {
  it('calcula salario mínimo, auxilio, descuentos y aportes colombianos', () => {
    const result = calcularPlanillaColombia({
      sueldoMensual: NORMATIVA_COLOMBIA_2026_DEFAULT.salarioMinimo,
      arlTasa: 0.00522,
    });

    expect(result.totalIngresos).toBe(2_000_000);
    expect(result.totalDescuentos).toBe(140_072.4);
    expect(result.netoPagar).toBe(1_859_927.6);
    expect(result.conceptos.map((item) => item.codigo)).toEqual(
      expect.arrayContaining(['CO001', 'CO002', 'CO101', 'CO102', 'CO203', 'CO207', 'CO208', 'CO210']),
    );
  });

  it('no paga auxilio por encima de dos salarios mínimos', () => {
    const result = calcularPlanillaColombia({ sueldoMensual: 4_000_000 });
    expect(result.conceptos.find((item) => item.codigo === 'CO002')).toBeUndefined();
    expect(result.totalIngresos).toBe(4_000_000);
  });

  it('respeta exoneración explícita sin eliminar pensión, ARL ni caja', () => {
    const result = calcularPlanillaColombia({
      sueldoMensual: 2_500_000,
      exoneradoSaludSenaIcbf: true,
    });
    const codes = result.conceptos.map((item) => item.codigo);
    expect(codes).not.toContain('CO201');
    expect(codes).not.toContain('CO205');
    expect(codes).not.toContain('CO206');
    expect(codes).toEqual(expect.arrayContaining(['CO202', 'CO203', 'CO204']));
  });

  it('aplica jornada de 42 horas, nocturnidad y recargo dominical vigentes en agosto de 2026', () => {
    const result = calcularPlanillaColombia({
      sueldoMensual: 2_100_000,
      horasRecargoNocturno: 1,
      horasDominicalesFestivas: 1,
      horasExtrasDiurnasDominicales: 1,
      horasExtrasNocturnasDominicales: 1,
      recibeAuxilioTransporte: false,
    });

    expect(NORMATIVA_COLOMBIA_2026_DEFAULT.horasMensuales).toBe(210);
    expect(NORMATIVA_COLOMBIA_2026_DEFAULT.jornadaSemanal).toBe(42);
    expect(NORMATIVA_COLOMBIA_2026_DEFAULT.horaInicioNocturna).toBe(19);
    expect(result.conceptos).toEqual(expect.arrayContaining([
      expect.objectContaining({ codigo: 'CO005', monto: 3_500 }),
      expect.objectContaining({ codigo: 'CO007', monto: 9_000 }),
      expect.objectContaining({ codigo: 'CO008', monto: 21_500 }),
      expect.objectContaining({ codigo: 'CO009', monto: 26_500 }),
    ]));
  });

  it('calcula automáticamente el Fondo de Solidaridad y limita el IBC a 25 SMMLV', () => {
    const cuatroSmmlv = NORMATIVA_COLOMBIA_2026_DEFAULT.salarioMinimo * 4;
    const fondo = calcularPlanillaColombia({ sueldoMensual: cuatroSmmlv });
    expect(fondo.conceptos).toEqual(expect.arrayContaining([
      expect.objectContaining({ codigo: 'CO103', monto: cuatroSmmlv * 0.01 }),
    ]));

    const alto = calcularPlanillaColombia({ sueldoMensual: 100_000_000 });
    expect(alto.ibc).toBe(NORMATIVA_COLOMBIA_2026_DEFAULT.salarioMinimo * 25);
  });

  it('no aplica exoneración de salud, SENA e ICBF desde diez SMMLV', () => {
    const result = calcularPlanillaColombia({
      sueldoMensual: NORMATIVA_COLOMBIA_2026_DEFAULT.salarioMinimo * 10,
      exoneradoSaludSenaIcbf: true,
    });
    expect(result.conceptos.map((item) => item.codigo)).toEqual(
      expect.arrayContaining(['CO201', 'CO205', 'CO206']),
    );
  });
});
