import {
  esCompraFiscal,
  esEstadoFiscal,
  esVentaFiscal,
  importeFiscal,
  normalizarTipo,
  signoFiscal,
} from './documento-fiscal.rules';

/**
 * Estas reglas existen porque estaban escritas tres veces y ninguna copia las
 * tenía todas: el Registro de Ventas filtraba por tipo pero no restaba las notas
 * de crédito, el de Compras restaba pero no filtraba, y la determinación mensual
 * de IGV no hacía ninguna de las dos.
 */
describe('reglas del documento fiscal', () => {
  describe('la nota de crédito resta', () => {
    it('devuelve signo negativo sólo para la nota de crédito', () => {
      expect(signoFiscal('NOTA_CREDITO')).toBe(-1);
      expect(signoFiscal('07')).toBe(-1);
      expect(signoFiscal('FACTURA')).toBe(1);
      expect(signoFiscal('NOTA_DEBITO')).toBe(1);
      expect(signoFiscal(null)).toBe(1);
    });

    it('niega el importe aunque venga positivo, que es como se guarda', () => {
      // El DTO de CxP exige `@Min(0)`: una nota de crédito no puede guardarse
      // en negativo, así que el signo tiene que ponerlo esta función o no lo
      // pone nadie.
      expect(importeFiscal('NOTA_CREDITO', 18)).toBe(-18);
      expect(importeFiscal('FACTURA', 18)).toBe(18);
    });

    it('no invierte dos veces si el importe ya viniera negativo', () => {
      expect(importeFiscal('NOTA_CREDITO', -18)).toBe(-18);
    });
  });

  describe('el tipo se entiende por nombre y por código', () => {
    it('trata 01 y FACTURA como lo mismo', () => {
      // En producción `cpe.tipo_documento` guarda las dos formas a la vez.
      expect(normalizarTipo('01')).toBe('FACTURA');
      expect(normalizarTipo('factura')).toBe('FACTURA');
      expect(esVentaFiscal('01')).toBe(true);
      expect(esVentaFiscal('FACTURA')).toBe(true);
    });

    it('reconoce el recibo por honorarios sólo como compra', () => {
      expect(esCompraFiscal('02')).toBe(true);
      expect(esCompraFiscal('RECIBO_HONORARIOS')).toBe(true);
      expect(esVentaFiscal('RECIBO_HONORARIOS')).toBe(false);
    });
  });

  describe('lo que no forma parte de un registro', () => {
    it('deja fuera el ticket interno de POS', () => {
      // Un TICKET no es comprobante fiscal; estaba entrando en el cálculo de la
      // declaración porque nadie filtraba por tipo.
      expect(esVentaFiscal('TICKET')).toBe(false);
      expect(esCompraFiscal('TICKET')).toBe(false);
    });

    it('deja fuera los documentos anulados y rechazados', () => {
      expect(esEstadoFiscal('ANULADO')).toBe(false);
      expect(esEstadoFiscal('anulada')).toBe(false);
      expect(esEstadoFiscal('RECHAZADO')).toBe(false);
      expect(esEstadoFiscal('ACEPTADO')).toBe(true);
      expect(esEstadoFiscal(null)).toBe(true);
    });
  });
});
