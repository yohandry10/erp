import { cuadranImportes, diferenciaImportes, sumarImportes, tieneSaldo } from './cuadre-contable.util';

/**
 * El cuadre contable no admite margen.
 *
 * `crear_asiento_con_detalles_tx` rechaza con `v_total_debe <> v_total_haber`,
 * exacto. Los informes decían «cuadrado» con `Math.abs(diferencia) < 0.01`, y el
 * verificador de asientos rechazaba con `> 0.01`, de modo que un descuadre de
 * exactamente un céntimo pasaba la verificación y se registraba como «verificado
 * correctamente».
 *
 * Hoy no dispara: los 179 asientos de producción cuadran y ninguno se aparta
 * menos de un céntimo. Pero eso dice que todavía no ha pasado, no que la
 * comprobación funcione.
 */
describe('cuadre contable', () => {
  describe('cuadranImportes', () => {
    it('acepta dos importes iguales', () => {
      expect(cuadranImportes(1234.56, 1234.56)).toBe(true);
    });

    it('rechaza un descuadre de exactamente un céntimo, que era el agujero', () => {
      expect(cuadranImportes(1234.56, 1234.57)).toBe(false);
      // Lo que hacía la comprobación anterior con ese mismo caso:
      expect(Math.abs(1234.56 - 1234.57) > 0.01).toBe(false);
    });

    it('redondea a céntimos antes de comparar, igual que el writer', () => {
      // El writer hace `round(sum(debe),2) <> round(sum(haber),2)`: redondea y
      // luego compara. Esto hace lo mismo, así que una diferencia por debajo del
      // céntimo se va en el redondeo en los dos lados. No es una tolerancia: es
      // que a nivel de céntimo son el mismo importe, y el céntimo es la unidad
      // en la que se lleva el libro.
      expect(cuadranImportes(100, 100.004)).toBe(true);
      // Lo que sí se rechaza es un céntimo entero, que antes pasaba.
      expect(cuadranImportes(100, 100.01)).toBe(false);
    });

    it('trata null y undefined como cero', () => {
      expect(cuadranImportes(null, 0)).toBe(true);
      expect(cuadranImportes(undefined, 0.01)).toBe(false);
    });
  });

  describe('sumarImportes', () => {
    it('no arrastra la deriva de la coma flotante', () => {
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(sumarImportes([0.1, 0.2])).toBe(0.3);
    });

    it('suma una lista larga sin desviarse', () => {
      const importes = Array.from({ length: 1000 }, () => 0.07);
      expect(sumarImportes(importes)).toBe(70);
      // La suma directa sí se desvía, que es lo que la tolerancia absorbía.
      expect(importes.reduce((s, v) => s + v, 0)).not.toBe(70);
    });

    it('acepta cadenas, que es como llegan los numeric de Postgres', () => {
      expect(sumarImportes(['1.10', '2.20', null])).toBe(3.3);
    });
  });

  describe('diferenciaImportes', () => {
    it('da la diferencia al céntimo', () => {
      expect(diferenciaImportes(100.1, 100)).toBe(0.1);
      expect(diferenciaImportes(0.3, 0.1 + 0.2)).toBe(0);
    });
  });

  describe('tieneSaldo', () => {
    it('un céntimo es saldo', () => {
      expect(tieneSaldo(0.01)).toBe(true);
      expect(tieneSaldo(-0.01)).toBe(true);
      // Lo que hacía el filtro anterior con ese mismo caso:
      expect(Math.abs(0.01) > 0.01).toBe(false);
    });

    it('cero no lo es', () => {
      expect(tieneSaldo(0)).toBe(false);
      expect(tieneSaldo(null)).toBe(false);
    });
  });
});
