import Decimal from 'decimal.js';

/**
 * Cuadre contable, sin tolerancia y sin coma flotante.
 *
 * Los writers atómicos exigen que un asiento cuadre **exacto**:
 * `IF v_total_debe <> v_total_haber THEN RAISE`, sobre importes ya redondeados a
 * céntimos. Los informes, en cambio, declaraban «cuadrado» con
 * `Math.abs(diferencia) < 0.01`, y el verificador de asientos rechazaba sólo con
 * `> 0.01`, es decir que dejaba pasar un descuadre de **exactamente un céntimo**.
 * Una comprobación con un agujero del tamaño de lo que comprueba no comprueba
 * nada.
 *
 * Esa tolerancia estaba absorbiendo nuestra propia aritmética —sumar `number`
 * deriva del orden de 1e-13— en vez de medir el dato, que es el mismo defecto ya
 * corregido en la validación de retenciones. Sumando en Decimal la deriva
 * desaparece y la tolerancia deja de hacer falta: si dos importes no cuadran, es
 * porque de verdad no cuadran.
 */
export function sumarImportes(valores: Array<number | string | null | undefined>): number {
  return valores
    .reduce<Decimal>((total, v) => total.plus(new Decimal(v ?? 0)), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();
}

/**
 * Dos importes cuadran cuando son iguales al céntimo. Sin margen.
 */
export function cuadranImportes(a: number | string | null | undefined, b: number | string | null | undefined): boolean {
  return new Decimal(a ?? 0).toDecimalPlaces(2).equals(new Decimal(b ?? 0).toDecimalPlaces(2));
}

/**
 * Diferencia entre dos importes, al céntimo.
 */
export function diferenciaImportes(a: number | string | null | undefined, b: number | string | null | undefined): number {
  const d = new Decimal(a ?? 0).minus(new Decimal(b ?? 0)).toDecimalPlaces(2).toNumber();
  // Decimal devuelve -0 cuando la diferencia es cero por el lado negativo, y -0
  // se cuela en un `toBe(0)` y en cualquier comparación estricta con Object.is.
  return d === 0 ? 0 : d;
}

/**
 * Una cuenta tiene saldo si es distinto de cero al céntimo.
 *
 * Se contaban con `Math.abs(saldo) > 0.01`, que deja fuera una cuenta con
 * exactamente un céntimo: un céntimo es saldo.
 */
export function tieneSaldo(valor: number | string | null | undefined): boolean {
  return !new Decimal(valor ?? 0).toDecimalPlaces(2).isZero();
}
