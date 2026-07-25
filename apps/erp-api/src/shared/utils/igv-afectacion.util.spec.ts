import {
  AFECTACION_IGV,
  calcularDesgloseIgv,
  categoriaDeAfectacion,
  esGravado,
} from './igv-afectacion.util';

describe('afectación del IGV (Catálogo 07 SUNAT)', () => {
  describe('categoriaDeAfectacion', () => {
    it('clasifica los códigos onerosos principales', () => {
      expect(categoriaDeAfectacion(AFECTACION_IGV.GRAVADO)).toBe('GRAVADO');
      expect(categoriaDeAfectacion(AFECTACION_IGV.EXONERADO)).toBe('EXONERADO');
      expect(categoriaDeAfectacion(AFECTACION_IGV.INAFECTO)).toBe('INAFECTO');
      expect(categoriaDeAfectacion(AFECTACION_IGV.EXPORTACION)).toBe('EXPORTACION');
    });

    it('agrupa las operaciones gratuitas con su categoría', () => {
      expect(categoriaDeAfectacion('11')).toBe('GRAVADO');
      expect(categoriaDeAfectacion('21')).toBe('EXONERADO');
      expect(categoriaDeAfectacion('31')).toBe('INAFECTO');
    });

    it('asume gravado cuando el dato falta o es desconocido (no subdeclara IGV)', () => {
      expect(categoriaDeAfectacion(undefined)).toBe('GRAVADO');
      expect(categoriaDeAfectacion(null)).toBe('GRAVADO');
      expect(categoriaDeAfectacion('')).toBe('GRAVADO');
      expect(esGravado(undefined)).toBe(true);
    });
  });

  describe('calcularDesgloseIgv', () => {
    it('aplica IGV solo sobre la base gravada', () => {
      const desglose = calcularDesgloseIgv(
        [
          { baseImponible: 100, afectacionIgv: AFECTACION_IGV.GRAVADO },
          { baseImponible: 50, afectacionIgv: AFECTACION_IGV.EXONERADO },
          { baseImponible: 25, afectacionIgv: AFECTACION_IGV.INAFECTO },
        ],
        0.18,
      );

      expect(desglose.gravadas).toBe(100);
      expect(desglose.exoneradas).toBe(50);
      expect(desglose.inafectas).toBe(25);
      expect(desglose.igv).toBe(18);
      expect(desglose.total).toBe(193);
    });

    it('no cobra IGV cuando nada está gravado', () => {
      const desglose = calcularDesgloseIgv(
        [
          { baseImponible: 80, afectacionIgv: AFECTACION_IGV.EXONERADO },
          { baseImponible: 20, afectacionIgv: AFECTACION_IGV.INAFECTO },
        ],
        0.18,
      );

      expect(desglose.igv).toBe(0);
      expect(desglose.total).toBe(100);
    });

    it('mantiene el comportamiento actual cuando todo es gravado', () => {
      const desglose = calcularDesgloseIgv([{ baseImponible: 899 }], 0.18);

      expect(desglose.gravadas).toBe(899);
      expect(desglose.exoneradas).toBe(0);
      expect(desglose.igv).toBe(161.82);
      expect(desglose.total).toBe(1060.82);
    });

    it('redondea a 2 decimales como exige SUNAT', () => {
      const desglose = calcularDesgloseIgv(
        [
          { baseImponible: 33.333 },
          { baseImponible: 33.333 },
          { baseImponible: 33.334 },
        ],
        0.18,
      );

      expect(desglose.gravadas).toBe(100);
      expect(desglose.igv).toBe(18);
    });

    it('tolera listas vacías y valores no numéricos', () => {
      expect(calcularDesgloseIgv([], 0.18).total).toBe(0);
      expect(
        calcularDesgloseIgv([{ baseImponible: Number.NaN }, { baseImponible: 10 }], 0.18).gravadas,
      ).toBe(10);
    });

    it('separa exportación de las demás categorías', () => {
      const desglose = calcularDesgloseIgv(
        [{ baseImponible: 500, afectacionIgv: AFECTACION_IGV.EXPORTACION }],
        0.18,
      );

      expect(desglose.exportacion).toBe(500);
      expect(desglose.igv).toBe(0);
      expect(desglose.total).toBe(500);
    });
  });
});
