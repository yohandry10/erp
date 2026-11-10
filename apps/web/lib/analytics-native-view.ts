export type AnalyticsData = { ventasTiempo: any; deudasClientes: any; deudasProveedores: any; ventasCategoria: any; kpisVisuales: any }
export const EMPTY_ANALYTICS_DATA: AnalyticsData = { ventasTiempo: null, deudasClientes: null, deudasProveedores: null, ventasCategoria: null, kpisVisuales: null }
const keys = ['ventasTiempo', 'deudasClientes', 'deudasProveedores', 'ventasCategoria'] as const
const validCurrency = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value)
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
const money = (value: unknown) => number(value) && Math.abs((value as number) * 100 - Math.round((value as number) * 100)) < 0.00001
const chart = (value: any) => value && Array.isArray(value.labels) && value.labels.every((label: unknown) => typeof label === 'string') && Array.isArray(value.data) && value.data.length === value.labels.length && value.data.every(money)

export function readAnalyticsPayload(result: PromiseSettledResult<any>, key: keyof AnalyticsData): any {
  if (key === 'kpisVisuales' && (result.status !== 'fulfilled' || result.value?.success !== true)) return { version: 2, moneda: null, disponible: false, motivo: 'No se pudieron verificar los indicadores. Los importes por moneda conservan su propia lectura; reintenta para recuperar los indicadores.' }
  if (result.status !== 'fulfilled' || result.value?.success !== true || result.value?.data?.version !== 2) throw new Error('No se pudo verificar Analytics. Reintenta para obtener cifras actuales.')
  const data = result.value.data
  if (key === 'kpisVisuales') {
    if (!validCurrency(data.moneda) || typeof data.disponible !== 'boolean') throw new Error('No se pudo verificar la moneda de los indicadores.')
    if (data.disponible) {
      if (![data.liquidez?.valor, data.rentabilidad?.valor, data.crecimiento?.valor].every(value => value === null || number(value))) throw new Error('Los indicadores están incompletos.')
    } else if (typeof data.motivo !== 'string' || !data.motivo) throw new Error('Los indicadores están incompletos.')
    return data
  }
  if (data.base !== 'IMPORTES_ORIGINALES_SIN_CONVERSION' || !Array.isArray(data.porMoneda)) throw new Error('La lectura por moneda está incompleta.')
  const seen = new Set<string>()
  for (const group of data.porMoneda) {
    if (!validCurrency(group?.moneda) || seen.has(group.moneda)) throw new Error('La lectura contiene monedas desconocidas o duplicadas.')
    seen.add(group.moneda)
    if (key === 'ventasTiempo') {
      if (!chart({ labels: group.labels, data: group.datasets?.[0]?.data }) || ![group.totales?.ventasActuales, group.totales?.ventasAnterior].every(money)) throw new Error('Las ventas están incompletas.')
    } else if (key === 'ventasCategoria') {
      if (!chart(group.graficoPie)) throw new Error('Las categorías están incompletas.')
    } else if (!chart(group.graficoEdadSaldos) || ![group.totales?.[key === 'deudasClientes' ? 'totalPorCobrar' : 'totalPorPagar'], group.totales?.vencido].every(money) || !number(group.totales?.porcentajeVencido)) throw new Error('La cartera está incompleta.')
  }
  return data
}

export const analyticsCurrencies = (data: AnalyticsData): string[] => [...new Set([
  ...keys.flatMap(key => data[key]?.porMoneda?.map((group: any) => group.moneda) ?? []),
  ...(validCurrency(data.kpisVisuales?.moneda) ? [data.kpisVisuales.moneda] : []),
])].sort()

export function selectAnalyticsCurrency(data: AnalyticsData, currency: string): AnalyticsData {
  const empty = { labels: [], datasets: [], totales: { ventasActuales: 0, ventasAnterior: 0, crecimiento: 'SIN DATOS' }, graficoPie: { labels: [], data: [] }, graficoEdadSaldos: { labels: ['Por vencer', '0-30 días', '31-60 días', '61-90 días', '90+ días'], data: [0, 0, 0, 0, 0] } }
  return Object.fromEntries([
    ...keys.map(key => [key, data[key] ? data[key].porMoneda.find((group: any) => group.moneda === currency) ?? { ...empty, moneda: currency, totales: { ...empty.totales, totalPorCobrar: 0, totalPorPagar: 0, vencido: 0, porcentajeVencido: 0 } } : null]),
    ['kpisVisuales', data.kpisVisuales?.moneda === currency && data.kpisVisuales.disponible ? data.kpisVisuales : null],
  ]) as AnalyticsData
}

export function analyticsCsv(data: AnalyticsData, currency: string): string {
  if (!validCurrency(currency) || !analyticsCurrencies(data).includes(currency) || keys.some(key => !data[key]) || !data.kpisVisuales) throw new Error('La lectura está incompleta. Reintenta antes de exportar.')
  const selected = selectAnalyticsCurrency(data, currency), kpi = selected.kpisVisuales
  const rows: any[][] = [['metrica', 'valor', 'moneda', 'estado', 'unidad'],
    ['ventas_actuales', selected.ventasTiempo.totales.ventasActuales, currency, 'CONFIRMADO', 'importe original'],
    ['ventas_periodo_anterior', selected.ventasTiempo.totales.ventasAnterior, currency, 'CONFIRMADO', 'importe original'],
    ['cxc_total', selected.deudasClientes.totales.totalPorCobrar, currency, 'CONFIRMADO', 'importe original'],
    ['cxc_vencido', selected.deudasClientes.totales.vencido, currency, 'CONFIRMADO', 'importe original'],
    ['cxp_total', selected.deudasProveedores.totales.totalPorPagar, currency, 'CONFIRMADO', 'importe original'],
    ['cxp_vencido', selected.deudasProveedores.totales.vencido, currency, 'CONFIRMADO', 'importe original'],
    ['liquidez', kpi?.liquidez?.valor ?? '', currency, kpi?.liquidez?.valor == null ? 'NO_DISPONIBLE' : 'APROXIMADO', 'ratio'],
    ['rentabilidad', kpi?.rentabilidad?.valor ?? '', currency, kpi?.rentabilidad?.valor == null ? 'NO_DISPONIBLE' : 'APROXIMADO', '%'],
  ]
  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
}
