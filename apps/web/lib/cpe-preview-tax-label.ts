type TaxSource = {
  tasa_igv?: unknown
  tasa_impuesto?: unknown
  tax_rate?: unknown
  items?: unknown[]
}

function rate(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined
  return value > 0 && value <= 1 ? value * 100 : value
}

/** El cociente de importes redondeados no representa la tasa tributaria. */
export function cpePreviewTaxLabel(source: TaxSource, taxName: string, defaultRate: number): string {
  const lineRates = [...new Set((source.items || []).flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    const affectation = String(item.tipo_afectacion_igv ?? item.afectacion_igv ?? '').trim()
    if (affectation && !affectation.startsWith('1')) return []
    const valueRate = rate(item.tasa_igv ?? item.tasaIgv ?? item.tasa_impuesto ?? item.tasaImpuesto)
    return valueRate === undefined ? [] : [valueRate]
  }))]
  if (lineRates.length > 1) return taxName
  const taxRate = lineRates[0] ?? rate(source.tasa_igv ?? source.tasa_impuesto ?? source.tax_rate) ?? defaultRate
  return `${taxName} (${Number(taxRate.toFixed(2))}%)`
}
