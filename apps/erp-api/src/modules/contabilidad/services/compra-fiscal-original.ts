import { BadRequestException } from '@nestjs/common';

/** Los ajustes de CxP no reescriben el comprobante anotado en libros/impuestos. */
export function compraFiscalOriginal<T extends Record<string, any>>(row: T): T {
  const original = row.original_fiscal_amounts;
  if (!original) {
    if (row.metadata?.ultima_devolucion_id || row.metadata?.ultima_nota_credito_proveedor_id) {
      throw new BadRequestException('Reconcilie los importes originales de la compra con devoluciones antes de preparar el registro o los impuestos.');
    }
    return row;
  }
  const subtotal = Number(original.subtotal);
  const igv = Number(original.igv);
  const total = Number(original.total);
  if (![subtotal, igv, total].every(Number.isFinite) || subtotal < 0 || igv < 0 || total <= 0
    || Math.abs(subtotal + igv - total) > 0.01) {
    throw new BadRequestException('Los importes originales del comprobante de compra no son verificables.');
  }
  const cancelled = ['ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO'].includes(String(row.estado).toUpperCase());
  const settledByReturn = cancelled && ((row.metadata?.ultima_devolucion_id
    && Math.abs(Number(row.metadata.ultima_devolucion_total) - Number(row.total)) <= 0.01)
    || (row.metadata?.ultima_nota_credito_proveedor_id && row.metadata.cancelada_por_nota_credito === true));
  return { ...row, subtotal, igv, total, ...(settledByReturn ? { estado: 'REGISTRADA' } : {}) };
}
