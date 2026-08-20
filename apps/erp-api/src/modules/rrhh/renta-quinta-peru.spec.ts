import {
  DIVISOR_RETENCION_POR_MES,
  anioDelPeriodo,
  calcularRetencionQuintaPeru,
  gratificacionesPendientesDelEjercicio,
  impuestoAnualQuinta,
  mesDelPeriodo,
} from './renta-quinta-peru.util';

const UIT = 5500;
const DEDUCCION = 7; // 7 UIT = 38 500

describe('Retención de quinta categoría (Perú, Art. 40 Reglamento LIR)', () => {
  describe('escala progresiva', () => {
    it('no grava por debajo de las 7 UIT deducibles', () => {
      const r = calcularRetencionQuintaPeru({
        mes: 1,
        remuneracionOrdinariaMes: 2000,
        uit: UIT,
        deduccionUit: DEDUCCION,
      });
      // 2000 x 12 = 24 000 < 38 500
      expect(r.rentaNetaProyectada).toBe(0);
      expect(r.retencionMes).toBe(0);
    });

    it('aplica los tramos por escalón y no como tasa plana', () => {
      // Renta neta = 6 UIT = 33 000. Primer tramo 5 UIT al 8 %, el resto al 14 %.
      const esperado = 5 * UIT * 0.08 + 1 * UIT * 0.14;
      expect(impuestoAnualQuinta(6 * UIT, UIT)).toBeCloseTo(esperado, 2);
    });

    it('cubre el tramo superior del 30 %', () => {
      const neta = 50 * UIT;
      const esperado =
        5 * UIT * 0.08 +
        15 * UIT * 0.14 +
        15 * UIT * 0.17 +
        10 * UIT * 0.2 +
        5 * UIT * 0.3;
      expect(impuestoAnualQuinta(neta, UIT)).toBeCloseTo(esperado, 2);
    });
  });

  describe('la gratificación ya no dispara la retención del mes', () => {
    // Regresión del bloqueador: el motor anterior tomaba el ingreso del mes
    // (sueldo + gratificación + bonificación) y lo multiplicaba por doce, lo que
    // duplicaba la renta anual proyectada justo en julio y diciembre.
    const ORDINARIA = 3200;

    it('proyecta el año igual en un mes con gratificación que en uno sin ella', () => {
      const enero = calcularRetencionQuintaPeru({
        mes: 1,
        remuneracionOrdinariaMes: ORDINARIA,
        gratificacionesPendientes: gratificacionesPendientesDelEjercicio(1, ORDINARIA),
        uit: UIT,
        deduccionUit: DEDUCCION,
      });

      // 3200 x 12 + 2 gratificaciones de 3200 x 1.09 = 38 400 + 6 976 = 45 376
      expect(enero.rentaBrutaProyectada).toBeCloseTo(45376, 2);
      expect(enero.rentaNetaProyectada).toBeCloseTo(6876, 2);
      expect(enero.impuestoAnualProyectado).toBeCloseTo(550.08, 2);
      expect(enero.retencionMes).toBeCloseTo(45.84, 2);
    });

    it('en julio retiene una fracción, no el disparo del motor anterior', () => {
      const julio = calcularRetencionQuintaPeru({
        mes: 7,
        remuneracionOrdinariaMes: ORDINARIA,
        percibidoMesesAnteriores: ORDINARIA * 6,
        gratificacionesPendientes: gratificacionesPendientesDelEjercicio(7, ORDINARIA),
        retencionesPrevias: 45.84 * 6,
        uit: UIT,
        deduccionUit: DEDUCCION,
      });

      expect(julio.divisor).toBe(8);
      // El motor anterior retenía 349.65 en este mes.
      expect(julio.retencionMes).toBeLessThan(100);
      expect(julio.retencionMes).toBeGreaterThan(0);
    });
  });

  describe('divisores del artículo 40', () => {
    it('usa el divisor que la norma fija para cada mes', () => {
      expect(DIVISOR_RETENCION_POR_MES).toEqual({
        1: 12, 2: 12, 3: 12,
        4: 9,
        5: 8, 6: 8, 7: 8,
        8: 5,
        9: 4, 10: 4, 11: 4,
        12: 1,
      });
    });

    it.each([
      [1, 12], [2, 12], [3, 12], [4, 9], [5, 8], [6, 8],
      [7, 8], [8, 5], [9, 4], [10, 4], [11, 4], [12, 1],
    ])('mes %i divide entre %i', (mes, divisor) => {
      const r = calcularRetencionQuintaPeru({
        mes,
        remuneracionOrdinariaMes: 10000,
        uit: UIT,
        deduccionUit: DEDUCCION,
      });
      expect(r.divisor).toBe(divisor);
    });

    it('de enero a marzo no descuenta retenciones previas', () => {
      const conPrevias = calcularRetencionQuintaPeru({
        mes: 3,
        remuneracionOrdinariaMes: 10000,
        retencionesPrevias: 5000,
        uit: UIT,
        deduccionUit: DEDUCCION,
      });
      const sinPrevias = calcularRetencionQuintaPeru({
        mes: 3,
        remuneracionOrdinariaMes: 10000,
        uit: UIT,
        deduccionUit: DEDUCCION,
      });
      expect(conPrevias.retencionMes).toBe(sinPrevias.retencionMes);
    });

    it('desde abril descuenta lo ya retenido antes de dividir', () => {
      const base = {
        mes: 4,
        remuneracionOrdinariaMes: 10000,
        uit: UIT,
        deduccionUit: DEDUCCION,
      };
      const sinPrevias = calcularRetencionQuintaPeru(base);
      const conPrevias = calcularRetencionQuintaPeru({ ...base, retencionesPrevias: 900 });
      expect(conPrevias.retencionMes).toBeCloseTo(sinPrevias.retencionMes - 100, 2);
    });
  });

  describe('regularización de diciembre', () => {
    it('paga el saldo íntegro para que el año cuadre con el impuesto anual', () => {
      const r = calcularRetencionQuintaPeru({
        mes: 12,
        remuneracionOrdinariaMes: 10000,
        percibidoMesesAnteriores: 110000,
        retencionesPrevias: 1000,
        uit: UIT,
        deduccionUit: DEDUCCION,
      });
      expect(r.divisor).toBe(1);
      expect(r.retencionMes).toBeCloseTo(r.impuestoAnualProyectado - 1000, 2);
    });

    it('nunca devuelve una retención negativa si ya se retuvo de más', () => {
      const r = calcularRetencionQuintaPeru({
        mes: 12,
        remuneracionOrdinariaMes: 10000,
        retencionesPrevias: 999999,
        uit: UIT,
        deduccionUit: DEDUCCION,
      });
      expect(r.retencionMes).toBe(0);
    });
  });

  describe('gratificaciones pendientes', () => {
    it('cuenta las dos del año si aún no llegó julio', () => {
      expect(gratificacionesPendientesDelEjercicio(1, 1000)).toBeCloseTo(2180, 2);
    });

    it('cuenta sólo la de diciembre después de julio', () => {
      expect(gratificacionesPendientesDelEjercicio(8, 1000)).toBeCloseTo(1090, 2);
    });

    it('incluye la del propio mes que se liquida', () => {
      expect(gratificacionesPendientesDelEjercicio(7, 1000)).toBeCloseTo(2180, 2);
      expect(gratificacionesPendientesDelEjercicio(12, 1000)).toBeCloseTo(1090, 2);
    });
  });

  describe('el total del ejercicio cuadra con el impuesto anual', () => {
    it('doce meses de sueldo estable suman el impuesto anual', () => {
      const ORDINARIA = 9000;
      let acumulado = 0;
      let ultimoImpuestoAnual = 0;

      for (let mes = 1; mes <= 12; mes += 1) {
        const r = calcularRetencionQuintaPeru({
          mes,
          remuneracionOrdinariaMes: ORDINARIA,
          percibidoMesesAnteriores:
            ORDINARIA * (mes - 1) + (mes > 7 ? ORDINARIA * 1.09 : 0),
          gratificacionesPendientes: gratificacionesPendientesDelEjercicio(mes, ORDINARIA),
          retencionesPrevias: acumulado,
          uit: UIT,
          deduccionUit: DEDUCCION,
        });
        acumulado += r.retencionMes;
        ultimoImpuestoAnual = r.impuestoAnualProyectado;
      }

      // Diciembre regulariza: el acumulado del año iguala el impuesto anual.
      expect(acumulado).toBeCloseTo(ultimoImpuestoAnual, 1);
    });
  });

  describe('lectura del periodo', () => {
    it('extrae mes y año de un periodo YYYY-MM', () => {
      expect(mesDelPeriodo('2026-07')).toBe(7);
      expect(anioDelPeriodo('2026-07')).toBe(2026);
    });

    it('devuelve null ante un periodo inválido', () => {
      for (const invalido of ['2026-13', '2026/07', '', null, undefined, 'julio']) {
        expect(mesDelPeriodo(invalido as any)).toBeNull();
      }
      expect(anioDelPeriodo('2026/07')).toBeNull();
    });
  });
});
