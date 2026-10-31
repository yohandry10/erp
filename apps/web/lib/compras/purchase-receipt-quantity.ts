// Purchase order and receipt quantities use numeric(14,2), as does the UI step.
function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Cantidad de recepción inválida')
  return Math.round(value * 100)
}

export function receiptQuantityRemaining(ordered: number, received: number): number {
  return Math.max(0, cents(ordered) - cents(received)) / 100
}

export function clampReceiptQuantity(requested: number, ordered: number, received: number): number {
  return Math.max(0, Math.min(cents(requested), cents(ordered) - cents(received))) / 100
}

export function receiptQuantityTotal(quantities: number[]): number {
  return quantities.reduce((total, quantity) => total + cents(quantity), 0) / 100
}
