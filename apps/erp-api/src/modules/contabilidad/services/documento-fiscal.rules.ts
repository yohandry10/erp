/**
 * Qué documentos cuentan como venta o compra fiscal, y con qué signo.
 *
 * Existe porque esta regla estaba escrita dos veces y las dos copias no decían
 * lo mismo. El Registro de Ventas y el de Compras (PLE 14.1 y 8.1) filtraban por
 * tipo de documento y restaban las notas de crédito; la determinación mensual de
 * IGV no hacía ni lo uno ni lo otro. Resultado medido sobre producción el
 * 2026-08-24: para el mismo mes el libro daba S/ 1 566,05 de IGV de ventas y la
 * declaración S/ 1 570,55.
 *
 * Dos sitios que calculan el mismo impuesto con reglas distintas no es un
 * detalle: es que el contribuyente declara un número y su libro legal dice otro,
 * y eso es exactamente lo que SUNAT cruza.
 */

/** Tipos que forman el Registro de Ventas. Un TICKET interno de POS no está. */
export const TIPOS_DOCUMENTO_VENTA_FISCAL = [
  'FACTURA',
  'BOLETA',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
] as const;

/** Tipos que forman el Registro de Compras. */
export const TIPOS_DOCUMENTO_COMPRA_FISCAL = [
  'FACTURA',
  'BOLETA',
  'RECIBO_HONORARIOS',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
] as const;

/** Un documento anulado no forma parte de ningún registro. */
export const ESTADOS_NO_FISCALES = [
  'ANULADO',
  'ANULADA',
  'CANCELADO',
  'CANCELADA',
  'RECHAZADO',
  'RECHAZADA',
] as const;

/**
 * La nota de crédito **resta**. Es la mitad que faltaba en la determinación
 * mensual: sumarla en vez de restarla equivoca el IGV en el doble de su importe,
 * y en compras hacia abajo, que es la dirección que a SUNAT le interesa.
 */
export function signoFiscal(tipoDocumento: string | null | undefined): -1 | 1 {
  return normalizarTipo(tipoDocumento) === 'NOTA_CREDITO' ? -1 : 1;
}

export function esEstadoFiscal(estado: string | null | undefined): boolean {
  const normalizado = String(estado ?? '').trim().toUpperCase();
  return !(ESTADOS_NO_FISCALES as readonly string[]).includes(normalizado);
}

export function esVentaFiscal(tipoDocumento: string | null | undefined): boolean {
  return (TIPOS_DOCUMENTO_VENTA_FISCAL as readonly string[]).includes(
    normalizarTipo(tipoDocumento),
  );
}

export function esCompraFiscal(tipoDocumento: string | null | undefined): boolean {
  return (TIPOS_DOCUMENTO_COMPRA_FISCAL as readonly string[]).includes(
    normalizarTipo(tipoDocumento),
  );
}

/**
 * Acepta tanto el nombre como el código de SUNAT.
 *
 * `cpe.tipo_documento` guarda las dos formas a la vez --en producción conviven
 * 55 filas `FACTURA` y una `01`, siendo lo mismo-- así que un filtro que sólo
 * entienda una de ellas se deja fuera parte de las ventas sin avisar.
 */
export function normalizarTipo(tipoDocumento: string | null | undefined): string {
  const bruto = String(tipoDocumento ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const porCodigo: Record<string, string> = {
    '01': 'FACTURA',
    '03': 'BOLETA',
    '02': 'RECIBO_HONORARIOS',
    '07': 'NOTA_CREDITO',
    '08': 'NOTA_DEBITO',
  };
  return porCodigo[bruto] ?? bruto;
}

/**
 * Aplica el signo a un importe. Siempre sobre el valor absoluto: el importe
 * guardado de una nota de crédito es positivo --el DTO de CxP lo exige con
 * `@Min(0)`-- así que negarlo aquí es la única forma de que reste.
 */
export function importeFiscal(
  tipoDocumento: string | null | undefined,
  importe: number | null | undefined,
): number {
  return signoFiscal(tipoDocumento) * Math.abs(Number(importe ?? 0));
}
