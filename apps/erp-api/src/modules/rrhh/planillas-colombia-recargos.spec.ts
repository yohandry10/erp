import { PlanillasService } from './planillas.service';
import { NORMATIVA_COLOMBIA_2026_DEFAULT } from './planillas-colombia.util';

/**
 * Regresión: el recargo nocturno y el trabajo en dominical o festivo llegaban al
 * motor siempre en cero.
 *
 * La pantalla de cálculo de planilla los capturaba en campos editables y los
 * sumaba al neto que mostraba, pero no los enviaba. El DTO tampoco los declaraba,
 * así que con `forbidNonWhitelisted` activo enviarlos habría devuelto 400. Y el
 * método del servicio los leía de `empleado.horas_recargo_nocturno`, una columna
 * que no existe en el esquema. Resultado: el trabajador veía el importe en
 * pantalla, aprobaba, y cobraba de menos un recargo que sí había trabajado.
 */
describe('recargos colombianos en el cálculo personalizado', () => {
  const service = new PlanillasService({ getClient: jest.fn() } as any, {} as any);

  const conceptos = [
    'CO001', 'CO002', 'CO003', 'CO004', 'CO005', 'CO006', 'CO007', 'CO008', 'CO009',
    'CO101', 'CO102', 'CO103', 'CO104',
    'CO201', 'CO203', 'CO205', 'CO207', 'CO208', 'CO210',
  ].map((codigo) => ({ id: `c-${codigo}`, codigo }));

  const montoDe = (r: any, codigo: string) =>
    r.conceptosDetalle.find((d: any) => d.id === `c-${codigo}`)?.monto;

  const empleadoBase = {
    id: 'emp-co',
    nombres: 'Trabajador Colombia',
    sueldo_base: 2_100_000,
    dias_trabajados: 30,
  };

  const calcular = (extra: Record<string, unknown> = {}) =>
    (service as any).calcularEmpleadoColombiaPersonalizado(
      { ...empleadoBase, ...extra },
      conceptos,
      NORMATIVA_COLOMBIA_2026_DEFAULT,
    );

  it('sin recargos no emite los conceptos correspondientes', () => {
    const r = calcular();
    expect(montoDe(r, 'CO005')).toBeUndefined();
    expect(montoDe(r, 'CO007')).toBeUndefined();
  });

  it('paga el recargo nocturno al 35 % de la hora ordinaria', () => {
    const r = calcular({ horas_recargo_nocturno: 10 });

    // valorHora = 2 100 000 / 210 = 10 000; recargo = 10 h x 10 000 x 0,35
    expect(montoDe(r, 'CO005')).toBeCloseTo(35_000, 2);
  });

  it('paga el dominical/festivo al 90 % de la hora ordinaria', () => {
    const r = calcular({ horas_dominicales_festivas: 8 });

    // 8 h x 10 000 x 0,9
    expect(montoDe(r, 'CO007')).toBeCloseTo(72_000, 2);
  });

  it('los recargos aumentan el total de ingresos y el neto', () => {
    const sinRecargos = calcular();
    const conRecargos = calcular({
      horas_recargo_nocturno: 10,
      horas_dominicales_festivas: 8,
    });

    expect(conRecargos.totalIngresos).toBeGreaterThan(sinRecargos.totalIngresos);
    expect(conRecargos.netoPagar).toBeGreaterThan(sinRecargos.netoPagar);
    expect(conRecargos.totalIngresos - sinRecargos.totalIngresos).toBeCloseTo(107_000, 2);
  });

  it('usa las mismas tasas que muestra el preview de la pantalla', () => {
    // El modal calcula recargo x 0,35 y dominical x 0,9 sobre sueldo/210. Si el
    // motor cambiara sus tasas sin que el preview lo siga, el usuario volvería a
    // aprobar un neto distinto del que se guarda.
    expect(NORMATIVA_COLOMBIA_2026_DEFAULT.recargoNocturno).toBe(0.35);
    expect(NORMATIVA_COLOMBIA_2026_DEFAULT.recargoDominicalFestivo).toBe(0.9);
    expect(NORMATIVA_COLOMBIA_2026_DEFAULT.horasMensuales).toBe(210);
  });

  it('ignora valores negativos en vez de restar del sueldo', () => {
    const r = calcular({ horas_recargo_nocturno: -5 });
    expect(montoDe(r, 'CO005')).toBeUndefined();
  });
});
