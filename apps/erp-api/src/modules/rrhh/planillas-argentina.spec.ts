import {
  calcularLiquidacionArgentina,
  calcularPlanillaArgentina,
  calcularSacArgentina,
  diasVacacionesArgentina,
  mesesComputablesSacArgentina,
  validarCuilArgentina,
} from './planillas-argentina.util';

describe('RRHH Argentina', () => {
  describe('CUIL', () => {
    it('valida el dígito verificador', () => {
      expect(validarCuilArgentina('20-12345678-6')).toBe(true);
      expect(validarCuilArgentina('20-12345678-7')).toBe(false);
    });
  });

  describe('SAC', () => {
    it('liquida 50% de la mejor remuneración del semestre', () => {
      expect(calcularSacArgentina(1_200_000, 6)).toBe(600_000);
    });

    it('prorratea por meses computables', () => {
      expect(calcularSacArgentina(1_200_000, 3)).toBe(300_000);
      expect(mesesComputablesSacArgentina('2026-06', '2026-04-01')).toBe(3);
      expect(mesesComputablesSacArgentina('2026-05', '2026-01-01')).toBeNull();
    });
  });

  describe('vacaciones', () => {
    it('aplica la escala de antigüedad LCT', () => {
      expect(diasVacacionesArgentina(0)).toBe(14);
      expect(diasVacacionesArgentina(5)).toBe(14);
      expect(diasVacacionesArgentina(6)).toBe(21);
      expect(diasVacacionesArgentina(11)).toBe(28);
      expect(diasVacacionesArgentina(21)).toBe(35);
    });
  });

  describe('planilla mensual', () => {
    it('calcula aportes argentinos, contribución patronal, ART y ARS', () => {
      const calculo = calcularPlanillaArgentina({
        sueldoMensual: 1_000_000,
        periodo: '2026-05',
        fechaIngreso: '2024-01-01',
        artTasa: 0.03,
        sindicatoAporteTasa: 0.02,
      });

      expect(calculo.totalIngresos).toBe(1_000_000);
      expect(calculo.totalDescuentos).toBe(190_000);
      expect(calculo.totalAportes).toBe(210_000);
      expect(calculo.netoPagar).toBe(810_000);
      expect(calculo.conceptos.map((concepto) => concepto.codigo)).toEqual(
        expect.arrayContaining(['AR001', 'AR101', 'AR102', 'AR103', 'AR104', 'AR201', 'AR202']),
      );
      expect(calculo.conceptos.map((concepto) => concepto.codigo)).not.toEqual(
        expect.arrayContaining(['101', '104', '201']),
      );
    });

    it('paga el plus vacacional con divisor 25', () => {
      const calculo = calcularPlanillaArgentina({
        sueldoMensual: 750_000,
        periodo: '2026-02',
        fechaIngreso: '2020-01-01',
        diasVacaciones: 10,
      });
      expect(calculo.totalIngresos).toBe(800_000);
    });
  });

  describe('liquidación final', () => {
    it('aplica art. 245 vigente, vacaciones, SAC, preaviso e integración', () => {
      const calculo = calcularLiquidacionArgentina({
        fechaIngreso: '2020-01-01',
        fechaTerminacion: '2026-07-15',
        sueldoMensual: 1_000_000,
        mejorRemuneracionNormalHabitual: 1_200_000,
        topeConvenio: 900_000,
        motivoTerminacion: 'despido_sin_causa',
        preavisoOmitido: true,
      });

      expect(calculo.baseIndemnizacion).toBe(900_000);
      expect(calculo.aniosIndemnizables).toBe(7);
      expect(calculo.indemnizacionAntiguedad).toBe(6_300_000);
      expect(calculo.preaviso).toBe(2_000_000);
      expect(calculo.diasIntegracion).toBe(16);
      expect(calculo.total).toBeGreaterThan(calculo.indemnizacionAntiguedad);
    });

    it('respeta un fondo de cese configurado por convenio', () => {
      const calculo = calcularLiquidacionArgentina({
        fechaIngreso: '2020-01-01',
        fechaTerminacion: '2026-07-15',
        sueldoMensual: 1_000_000,
        motivoTerminacion: 'despido_sin_causa',
        fondoCeseReemplazaIndemnizacion: true,
      });
      expect(calculo.indemnizacionAntiguedad).toBe(0);
      expect(calculo.fondoCeseAplicado).toBe(true);
    });
  });
});
