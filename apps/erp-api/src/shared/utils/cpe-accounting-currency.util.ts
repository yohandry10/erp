import Decimal from 'decimal.js';

/** Snapshot443: importes documentales; costo de inventario ya funcional. */
export function cpeAccountingAmounts(snapshot: {
  moneda: unknown; tipoCambio: unknown; subtotal: unknown; impuestos: unknown;
  total: unknown; ajustes?: Record<string, unknown> | null;
}) {
  const invalid = () => new Error('CPE_ACCOUNTING_CURRENCY_SNAPSHOT_INVALID');
  const money = (value: unknown): Decimal => {
    if (value == null || value === '' || typeof value === 'boolean') throw invalid();
    let amount: Decimal;
    try { amount = new Decimal(String(value)); } catch { throw invalid(); }
    if (!amount.isFinite() || amount.lt(0) || !amount.equals(amount.toDecimalPlaces(2))) throw invalid();
    return amount;
  };
  const currency = String(snapshot.moneda ?? '').trim().toUpperCase();
  let rate: Decimal;
  try { rate = new Decimal(String(snapshot.tipoCambio)); } catch { throw invalid(); }
  if (!/^[A-Z]{3}$/.test(currency) || !rate.isFinite() || rate.lte(0)
    || (currency === 'PEN' && !rate.equals(1))) throw invalid();
  const base = money(snapshot.subtotal), tax = money(snapshot.impuestos), gross = money(snapshot.total);
  if (!base.plus(tax).equals(gross)) throw invalid();
  if (snapshot.ajustes != null && (typeof snapshot.ajustes !== 'object' || Array.isArray(snapshot.ajustes))) throw invalid();
  const keys = ['retencion', 'percepcion', 'detraccion', 'anticipo'] as const;
  const adjustments = Object.fromEntries(keys.map(key => [key, money(snapshot.ajustes?.[key] ?? 0)])) as Record<typeof keys[number], Decimal>;
  const pending = gross.minus(adjustments.retencion).minus(adjustments.detraccion)
    .minus(adjustments.anticipo).plus(adjustments.percepcion);
  if (pending.lt(0)) throw invalid();
  const local = (amount: Decimal) => {
    const result = amount.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (!Number.isSafeInteger(result.mul(100).toNumber())) throw invalid();
    return result;
  };
  const target = local(gross).mul(100);
  const exact = [base, tax].map(amount => amount.mul(rate).mul(100));
  const cents = exact.map(amount => amount.floor());
  const residual = target.minus(cents[0]).minus(cents[1]).toNumber();
  if (!Number.isSafeInteger(target.toNumber()) || target.lte(0)
    || !Number.isInteger(residual) || residual < 0 || residual > 2) throw invalid();
  const order = [0, 1].sort((a, b) => exact[b].minus(cents[b]).comparedTo(exact[a].minus(cents[a])) || a - b);
  for (const index of order.slice(0, residual)) cents[index] = cents[index].plus(1);
  const converted = Object.fromEntries(keys.map(key => [key, local(adjustments[key]).toNumber()])) as Record<typeof keys[number], number>;
  const debt = local(pending);
  const debit = debt.plus(converted.retencion).plus(converted.detraccion).plus(converted.anticipo);
  const credit = target.div(100).plus(converted.percepcion);
  // No inventar diferencias de cambio ni alterar un ajuste para absorber centavos.
  // El mismo control corre antes del writer y durante el replay del outbox.
  if (!debit.equals(credit)) throw new Error('CPE_ACCOUNTING_CURRENCY_REVIEW_REQUIRED');
  return { base_imponible: cents[0].div(100).toNumber(), igv: cents[1].div(100).toNumber(),
    total: target.div(100).toNumber(), monto_pendiente: debt.toNumber(), ajustes: converted };
}
