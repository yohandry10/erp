const invalid = (): never => { throw new Error('Respuesta contable incompleta') }
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
const number = (value: unknown, money = true): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      (money && !Number.isSafeInteger(Math.round(value * 100)))) return invalid()
  return value
}
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}
function numbers<K extends string>(value: unknown, ...fields: K[]): Record<K, number> {
  const row = object(value)
  return Object.fromEntries(fields.map(field => [field, number(row[field])])) as Record<K, number>
}
function envelope(response: unknown, anio?: number, mes?: number) {
  const result = object(response)
  if (result.success !== true) return invalid()
  const data = object(result.data)
  if (anio !== undefined && mes !== undefined) {
    const period = object(data.periodo)
    if (period.anio !== anio || period.mes !== mes) return invalid()
  }
  return data
}
export function readStatementBalance(response: unknown, anio: number, mes: number) {
  const data = envelope(response, anio, mes)
  if (!Array.isArray(data.cuentas)) return invalid()
  const totals = object(data.totales)
  numbers(totals, 'debe', 'haber', 'diferencia')
  if (typeof totals.cuadrado !== 'boolean') return invalid()
  const seen = new Set<string>()
  return data.cuentas.map(value => {
    const row = object(value), cuenta = text(row.cuenta)
    if (seen.has(cuenta)) return invalid()
    seen.add(cuenta)
    return { cuenta, nombre: text(row.nombre), ...numbers(row, 'saldo_inicial', 'debe', 'haber', 'saldo_final') }
  })
}
export function readStatementResults(response: unknown, anio: number, mes: number) {
  const data = envelope(response, anio, mes)
  return {
    ingresos: numbers(data.ingresos, 'ventas', 'otros_ingresos', 'total_ingresos'),
    costos: numbers(data.costos, 'costo_ventas', 'utilidad_bruta'),
    gastos: numbers(data.gastos, 'gastos_administrativos', 'gastos_ventas', 'gastos_financieros', 'total_gastos'),
    utilidad_neta: number(data.utilidad_neta),
  }
}
export function readStatementGeneral(response: unknown, anio: number, mes: number) {
  const data = envelope(response, anio, mes), activos = object(data.activos), pasivos = object(data.pasivos)
  return {
    activos: {
      corrientes: numbers(activos.corrientes, 'efectivo', 'cuentas_por_cobrar', 'inventarios', 'otros_activos', 'total_corrientes'),
      no_corrientes: numbers(activos.no_corrientes, 'activos_fijos', 'depreciacion_acumulada', 'activos_fijos_neto', 'otros_activos', 'total_no_corrientes'),
      total_activos: number(activos.total_activos),
    },
    pasivos: {
      corrientes: numbers(pasivos.corrientes, 'cuentas_por_pagar', 'tributos_por_pagar', 'remuneraciones_por_pagar', 'otros_pasivos', 'total_corrientes'),
      no_corrientes: numbers(pasivos.no_corrientes, 'deudas_largo_plazo', 'otros_pasivos', 'total_no_corrientes'),
      total_pasivos: number(pasivos.total_pasivos),
    },
    patrimonio: numbers(data.patrimonio, 'capital', 'resultados_acumulados', 'resultado_ejercicio', 'total_patrimonio'),
  }
}
export function readStatementCashflow(response: unknown) {
  const data = envelope(response)
  return {
    ...numbers(data, 'operativo', 'inversion', 'financiamiento', 'neto'),
    detalle: numbers(data.detalle, 'utilidadNeta', 'gastosNoDesembolsables', 'variacionCxc', 'variacionInventario', 'variacionCxp', 'otrosOperativos', 'variacionInversiones', 'variacionFinanciamiento', 'variacionCaja', 'descuadre'),
  }
}
export function readStatementRatios(response: unknown) {
  const data = envelope(response)
  const fields = ['liquidez', 'pruebaAcida', 'ebitdaMargin', 'dso', 'dpo', 'dio', 'rotacionInventario'] as const
  const result = Object.fromEntries(fields.map(field => [field, number(data[field], false)])) as Record<typeof fields[number], number>
  if (!Number.isFinite(result.ebitdaMargin * 100)) return invalid()
  return result
}
