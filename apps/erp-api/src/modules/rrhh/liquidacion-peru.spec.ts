import {
  calcularCts,
  calcularGratificacionTrunca,
  calcularIndemnizacionDespido,
  calcularVacacionesTruncas,
  diasVacacionesPendientes,
  mesesDelSemestreGratificatorio,
  remuneracionComputableCts,
  semestreCts,
  tiempoComputableCts,
  tiempoDeServicios,
  parseFechaLocal,
} from './liquidacion-peru.util';

describe('tiempoDeServicios', () => {
  it('cuenta meses completos y días sueltos', () => {
    expect(tiempoDeServicios(parseFechaLocal('2025-01-15'), parseFechaLocal('2026-01-15'))).toEqual({ meses: 12, dias: 0 });
    expect(tiempoDeServicios(parseFechaLocal('2025-01-15'), parseFechaLocal('2025-07-20'))).toEqual({ meses: 6, dias: 5 });
  });

  it('no completa el mes cuando el día del cese es anterior al de ingreso', () => {
    const t = tiempoDeServicios(parseFechaLocal('2025-01-20'), parseFechaLocal('2025-07-10'));
    expect(t.meses).toBe(5);
    expect(t.dias).toBeGreaterThan(0);
  });

  it('devuelve cero si el cese no es posterior al ingreso', () => {
    expect(tiempoDeServicios(parseFechaLocal('2026-01-01'), parseFechaLocal('2025-01-01'))).toEqual({ meses: 0, dias: 0 });
  });
});

// D.S. 001-97-TR: la remuneración computable incluye un sexto de la última
// gratificación, y por cada año completo corresponde una remuneración íntegra.
// La fórmula anterior dividía entre 360 unos "días" que ya venían en dozavos, y
// pagaba la doceava parte de lo que la ley manda.
describe('CTS', () => {
  it('la remuneración computable suma un sexto de la gratificación', () => {
    expect(remuneracionComputableCts(1300)).toBe(1516.67);
    expect(remuneracionComputableCts(1300, 1300)).toBe(1516.67);
  });

  it('un año completo de servicios paga una remuneración computable íntegra', () => {
    const rc = remuneracionComputableCts(1300);
    expect(calcularCts(rc, { meses: 12, dias: 0 })).toBe(1516.67);
  });

  it('medio año paga la mitad', () => {
    const rc = remuneracionComputableCts(1300);
    expect(calcularCts(rc, { meses: 6, dias: 0 })).toBe(758.34);
  });

  it('los días sueltos se pagan en treintavos de un dozavo', () => {
    const rc = remuneracionComputableCts(1200); // 1400
    // 1400 * (1/12 + 15/360) = 116.67 + 58.33
    expect(calcularCts(rc, { meses: 1, dias: 15 })).toBe(175);
  });

  it('no paga nada sin tiempo de servicios', () => {
    expect(calcularCts(1516.67, { meses: 0, dias: 0 })).toBe(0);
  });
});

// D. Leg. 713: el récord trunco se gana por dozavos dentro del periodo vacacional
// en curso. Antes se asumían 30 días ganados desde el primer día de trabajo.
describe('vacaciones truncas', () => {
  it('con seis meses corresponde la mitad del récord, no el año entero', () => {
    expect(diasVacacionesPendientes({ meses: 6, dias: 0 })).toBe(15);
    expect(calcularVacacionesTruncas(1300, { meses: 6, dias: 0 })).toBe(650);
  });

  it('descuenta los días ya gozados', () => {
    expect(diasVacacionesPendientes({ meses: 12, dias: 0 }, 10)).toBe(20);
    // 1300 - (1300/30)*10
    expect(calcularVacacionesTruncas(1300, { meses: 12, dias: 0 }, 10)).toBe(866.67);
  });

  it('nunca devuelve importes negativos si se gozaron más días de los ganados', () => {
    expect(calcularVacacionesTruncas(1300, { meses: 3, dias: 0 }, 30)).toBe(0);
    expect(diasVacacionesPendientes({ meses: 3, dias: 0 }, 30)).toBe(0);
  });

  it('paga las vencidas de periodos cumplidos, no solo las del periodo en curso', () => {
    // Cese justo en el aniversario: el periodo en curso mide cero pero hay 30 dias ganados
    expect(diasVacacionesPendientes({ meses: 12, dias: 0 })).toBe(30);
    expect(calcularVacacionesTruncas(1300, { meses: 12, dias: 0 })).toBe(1300);
    // Dos anios sin gozar: 60 dias
    expect(diasVacacionesPendientes({ meses: 24, dias: 0 })).toBe(60);
  });
});

// D.S. 003-97-TR art. 38: sueldo y medio por año, con tope de doce remuneraciones.
describe('indemnización por despido arbitrario', () => {
  it('paga sueldo y medio por año completo', () => {
    expect(calcularIndemnizacionDespido(2000, { meses: 24, dias: 0 })).toBe(6000);
  });

  it('liquida las fracciones en dozavos', () => {
    expect(calcularIndemnizacionDespido(1200, { meses: 6, dias: 0 })).toBe(900);
  });

  it('aplica el tope de doce remuneraciones', () => {
    // 20 años sin tope darían 30 sueldos
    expect(calcularIndemnizacionDespido(2000, { meses: 240, dias: 0 })).toBe(24000);
  });
});

// Ley 27735 art. 7 y Ley 30334.
describe('gratificación trunca', () => {
  it('paga un sexto de la remuneración por mes del semestre', () => {
    const r = calcularGratificacionTrunca(1800, 3);
    expect(r.gratificacion).toBe(900);
  });

  it('agrega la bonificación extraordinaria del 9 %', () => {
    const r = calcularGratificacionTrunca(1800, 6);
    expect(r.gratificacion).toBe(1800);
    expect(r.bonificacionExtraordinaria).toBe(162);
    expect(r.total).toBe(1962);
  });

  it('no supera el semestre aunque se pasen más meses', () => {
    expect(calcularGratificacionTrunca(1800, 9).gratificacion).toBe(1800);
  });

  it('cuenta solo los meses del semestre en curso', () => {
    // Cese en agosto: el semestre corre desde julio
    expect(mesesDelSemestreGratificatorio(parseFechaLocal('2020-01-01'), parseFechaLocal('2026-08-15'))).toBe(1);
    // Cese en junio: el semestre corre desde enero
    expect(mesesDelSemestreGratificatorio(parseFechaLocal('2020-01-01'), parseFechaLocal('2026-06-30'))).toBe(5);
  });

  it('arranca en la fecha de ingreso si entró dentro del semestre', () => {
    expect(mesesDelSemestreGratificatorio(parseFechaLocal('2026-08-01'), parseFechaLocal('2026-10-01'))).toBe(2);
  });
});

// D.S. 001-97-TR art. 21: mayo deposita el semestre noviembre-abril y noviembre
// el semestre mayo-octubre. Antes la CTS solo se calculaba al cese.
describe('deposito semestral de CTS', () => {
  it('mayo liquida el semestre noviembre-abril', () => {
    const s = semestreCts('2026-05');
    expect(s?.inicio.getFullYear()).toBe(2025);
    expect(s?.inicio.getMonth()).toBe(10); // noviembre
    expect(s?.fin.getMonth()).toBe(4);     // corta el 1 de mayo
  });

  it('noviembre liquida el semestre mayo-octubre', () => {
    const s = semestreCts('2026-11');
    expect(s?.inicio.getMonth()).toBe(4);  // mayo
    expect(s?.fin.getMonth()).toBe(10);    // corta el 1 de noviembre
  });

  it('rechaza periodos que no son de deposito', () => {
    expect(semestreCts('2026-07')).toBeNull();
    expect(semestreCts('2026-12')).toBeNull();
    expect(semestreCts('basura')).toBeNull();
  });

  it('un semestre completo computa seis meses', () => {
    expect(tiempoComputableCts('2026-05', parseFechaLocal('2020-01-01'))).toEqual({ meses: 6, dias: 0 });
  });

  it('cuenta desde el ingreso si entro con el semestre empezado', () => {
    // Ingreso el 1 de febrero: febrero, marzo y abril -> 3 meses
    expect(tiempoComputableCts('2026-05', parseFechaLocal('2026-02-01'))).toEqual({ meses: 3, dias: 0 });
  });

  it('no computa nada si ingreso despues de cerrado el semestre', () => {
    expect(tiempoComputableCts('2026-05', parseFechaLocal('2026-06-01'))).toEqual({ meses: 0, dias: 0 });
  });

  it('un semestre completo deposita media remuneracion computable', () => {
    const rc = remuneracionComputableCts(1200); // 1400
    const t = tiempoComputableCts('2026-05', parseFechaLocal('2020-01-01'))!;
    expect(calcularCts(rc, t)).toBe(700);
  });
});
