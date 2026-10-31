import { multiplicarMoneda } from '@/lib/format-utils'

type PricedLine = { producto_id: string; cantidad: number; precio_unitario: number; subtotal: number }

/** Una respuesta incompleta nunca autoriza guardar importes de catálogo. */
export function reviewCommercialPrices<T extends PricedLine>(lines: T[], response: unknown): { lines: T[]; changed: boolean } {
  const rows = response && typeof response === 'object' && 'data' in response
    ? (response as { data: unknown }).data : response
  if (!Array.isArray(rows) || rows.length !== lines.length) {
    throw new Error('No se pudieron verificar todos los precios vigentes. Reintenta antes de guardar.')
  }
  const byProduct = new Map<string, { price: number; quantity: number }>()
  for (const row of rows) {
    const id = String(row?.producto_id ?? '')
    const price = Number(row?.precio_unitario)
    const quantity = Number(row?.cantidad)
    if (!id || row?.precio_unitario == null || !Number.isFinite(price) || price < 0
      || !Number.isFinite(quantity) || byProduct.has(id)) {
      throw new Error('La respuesta de precios está incompleta. Reintenta antes de guardar.')
    }
    byProduct.set(id, { price, quantity })
  }
  let changed = false
  const reviewed = lines.map(line => {
    const resolved = byProduct.get(line.producto_id)
    if (!resolved || resolved.quantity !== line.cantidad) {
      throw new Error('La respuesta de precios no corresponde a este formulario. Reintenta antes de guardar.')
    }
    if (line.precio_unitario !== resolved.price) changed = true
    return { ...line, precio_unitario: resolved.price, subtotal: multiplicarMoneda(line.cantidad, resolved.price) }
  })
  return { lines: reviewed, changed }
}
