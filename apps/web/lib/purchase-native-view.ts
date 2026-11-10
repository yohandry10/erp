export type PurchaseStats = {
  version: 2
  base: 'IMPORTES_ORIGINALES_SIN_CONVERSION'
  porMoneda: Array<{ moneda: string; totalCompras: string; montoTotalMes: string; comprasDelMes: number }>
  comprasDelMes: number
  ordenesActivas: number
  proveedoresActivos: number
  ordenesVencidas: number
}

const currency = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value)
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const amount = (value: unknown) => ['string', 'number'].includes(typeof value)
  && /^\d+(?:\.\d{1,2})?$/.test(String(value)) && Number.isFinite(Number(value)) && Number(value) < 1e12
const unavailable = () => new Error('No se pudo verificar el resumen de compras. Reintenta para consultar los importes actuales.')

export function readPurchaseStatsPayload(response: any): PurchaseStats {
  const data = response?.data
  if (response?.success !== true || data?.version !== 2 || data?.base !== 'IMPORTES_ORIGINALES_SIN_CONVERSION'
    || !Array.isArray(data.porMoneda) || ![data.comprasDelMes, data.ordenesActivas, data.proveedoresActivos, data.ordenesVencidas].every(count)) throw unavailable()
  const seen = new Set<string>()
  let monthlyCount = 0
  for (const group of data.porMoneda) {
    if (!currency(group?.moneda) || seen.has(group.moneda) || !count(group.comprasDelMes)
      || ![group.totalCompras, group.montoTotalMes].every(value => typeof value === 'string' && /^\d+\.\d{2}$/.test(value) && amount(value))
      || Number(group.montoTotalMes) > Number(group.totalCompras)) throw unavailable()
    seen.add(group.moneda)
    monthlyCount += group.comprasDelMes
  }
  if (!count(monthlyCount) || monthlyCount !== data.comprasDelMes) throw unavailable()
  return data
}

export function formatPurchaseMoney(value: unknown, selectedCurrency: unknown, locale: string, display: 'symbol' | 'code' = 'symbol'): string {
  if (!currency(selectedCurrency) || !amount(value)) return 'Importe no disponible'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: selectedCurrency, currencyDisplay: display, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))
}
