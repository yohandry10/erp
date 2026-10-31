/** Purchase lines currently persist two decimal places. Never round user input silently. */
export function isPurchaseQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0.01 && value < 1e12
    && value === Number(value.toFixed(2))
}

export function isPurchaseUnitPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 1e12
    && value === Number(value.toFixed(2))
}
