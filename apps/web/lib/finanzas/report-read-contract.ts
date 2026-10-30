import type { ReportRead } from '@/hooks/use-finance-report'

const invalid = () => { throw new Error('Respuesta financiera incompleta') }
const object = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value
}
const number = (value: any): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalid()
  return value
}
const count = (value: any): number => {
  if (!Number.isSafeInteger(value) || value < 0) return invalid()
  return value
}
const text = (value: any): string => {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}
const currency = (value: any): string => {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) return invalid()
  return value
}
const date = (value: any): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || Number.isNaN(Date.parse(value))) return invalid()
  return value
}
const array = (value: any): any[] => { if (!Array.isArray(value)) return invalid(); return value }
const envelope = (response: any) => { if (response?.success !== true) return invalid(); return response.data }

export function sumReportMoney(values: number[]) {
  const cents = values.reduce((sum, value) => {
    const next = sum + Math.round(number(value) * 100)
    if (!Number.isSafeInteger(next)) return invalid()
    return next
  }, 0)
  return cents / 100
}

export function groupCashflowWeeks(
  days: Array<{ fecha: string; ingresos: number; egresos: number; flujo_neto: number; saldo_final: number }>,
  from: string,
  until: string,
) {
  const dayNumber = (value: string) => Date.parse(`${date(value).slice(0, 10)}T00:00:00Z`) / 86_400_000
  const first = dayNumber(from), last = dayNumber(until)
  if (first > last) return invalid()
  const calendarDate = (value: number) => new Date(value * 86_400_000).toISOString().slice(0, 10)
  const weeks = new Map<number, {
    numero: number; fecha_inicio: string; fecha_fin: string;
    ingresos: number; egresos: number; flujo_neto: number; saldo_final: number
  }>()
  for (const day of [...days].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const current = dayNumber(day.fecha)
    if (current < first || current > last) return invalid()
    const index = Math.floor((current - first) / 7)
    const week = weeks.get(index) ?? {
      numero: index + 1, fecha_inicio: calendarDate(first + index * 7),
      fecha_fin: calendarDate(Math.min(first + index * 7 + 6, last)),
      ingresos: 0, egresos: 0, flujo_neto: 0, saldo_final: 0,
    }
    week.ingresos = sumReportMoney([week.ingresos, day.ingresos])
    week.egresos = sumReportMoney([week.egresos, day.egresos])
    week.flujo_neto = sumReportMoney([week.flujo_neto, day.flujo_neto])
    week.saldo_final = number(day.saldo_final)
    weeks.set(index, week)
  }
  return Array.from(weeks.values())
}

export function readCxpList(response: any) {
  const rows = array(envelope(response)).map(row => {
    text(row.id); text(row.proveedor_id); text(row.numero_documento); text(row.tipo_documento)
    date(row.fecha_emision); date(row.fecha_vencimiento); currency(row.moneda); number(row.total); number(row.saldo)
    if (!['PENDIENTE','PARCIAL','PAGADA','VENCIDA','ANULADA'].includes(row.estado)) return invalid()
    const provider = object(row.proveedores ?? row.proveedor)
    if (provider.id !== row.proveedor_id) return invalid()
    text(provider.razon_social); text(provider.ruc)
    return { ...row, proveedores: provider }
  })
  if (new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  return rows
}

export function readCxpProviders(response: any) {
  const rows = array(envelope(response))
  for (const row of rows) { text(row.id); text(row.razon_social); text(row.ruc) }
  if (new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  return rows
}

export function readCxpDue(response: any) {
  const data = object(envelope(response)), summary = object(data.resumen)
  date(data.fecha_consulta); date(data.fecha_limite); count(data.dias_adelante)
  const rows = array(data.vencimientos), totals: Record<string, { count: number; values: number[] }> = {}
  for (const row of rows) {
    text(row.id); text(row.numero_documento); text(row.proveedor_razon_social); date(row.fecha_vencimiento)
    const code = currency(row.moneda); number(row.saldo)
    if (!Number.isSafeInteger(row.dias_hasta_vencimiento)) return invalid()
    totals[code] ??= { count: 0, values: [] }; totals[code].count += 1; totals[code].values.push(row.saldo)
  }
  if (count(summary.cantidad_total) !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  const byCurrency = object(summary.por_moneda)
  if (Object.keys(byCurrency).length !== Object.keys(totals).length) return invalid()
  for (const [code, total] of Object.entries(totals)) {
    const reported = object(byCurrency[code])
    if (count(reported.cantidad) !== total.count || number(reported.monto) !== sumReportMoney(total.values)) return invalid()
  }
  return rows.map(row => ({ ...row, dias_restantes: row.dias_hasta_vencimiento }))
}

export async function loadCxpPage(get: ReportRead, endpoint: string) {
  // Distinct permissions can invalidate an in-flight read. Consult optional
  // catalogs first, then start the authoritative list under the current actor.
  let providers = null, due = null
  try { providers = readCxpProviders(await get('/api/compras/proveedores?activo=true')) } catch { /* section reports failure */ }
  const params = new URL(endpoint, 'http://localhost').searchParams
  const dueParams = new URLSearchParams({ dias: '7' })
  if (params.get('proveedor_id')) dueParams.set('proveedor_id', params.get('proveedor_id')!)
  try { due = readCxpDue(await get(`/api/finanzas/cxp/vencimientos?${dueParams}`)) } catch { /* section reports failure */ }
  let rows: any[] = [], total: number | null = null, pages = 1
  for (let page = 1; page <= pages; page += 1) {
    const response = await get(`${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&limit=50`)
    const pageRows = readCxpList(response), pagination = object(response.pagination)
    const reported = count(pagination.total), reportedPages = count(pagination.totalPages)
    if (count(pagination.page) !== page || count(pagination.limit) !== 50 || reportedPages !== Math.ceil(reported / 50) || (total !== null && total !== reported)) return invalid()
    total = reported; pages = reportedPages; rows = [...rows, ...pageRows]
  }
  if (rows.length !== total || new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  return { success: true, data: { rows, providers, due } }
}

export function readCxpPage(response: any) {
  const data = object(envelope(response))
  array(data.rows)
  if (data.providers !== null) array(data.providers)
  if (data.due !== null) array(data.due)
  return data as { rows: any[]; providers: any[] | null; due: any[] | null }
}

export function readAgingReport(response: any) {
  const data = object(envelope(response))
  const summary = object(data.resumen)
  for (const key of ['rango_0_30','rango_31_60','rango_61_90','rango_mas_90','total']) {
    const range = object(summary[key]); count(range.cantidad); number(range.monto)
  }
  array(data.por_proveedor)
  for (const row of array(data.detalle)) {
    text(row.id); text(row.proveedor_id); currency(row.moneda); number(row.saldo); number(row.dias_vencidos)
    text(row.proveedor_razon_social); text(row.proveedor_ruc)
    if (!['rango_0_30','rango_31_60','rango_61_90','rango_mas_90','por_vencer'].includes(row.rango)) return invalid()
    if (!Number.isSafeInteger(row.dias_vencidos) || (row.dias_vencidos <= 0) !== (row.rango === 'por_vencer')) return invalid()
  }
  if (new Set(data.detalle.map((row: any) => row.id)).size !== data.detalle.length) return invalid()
  return data
}

export function readDebtReport(response: any) {
  const data = object(envelope(response)); date(data.fecha_reporte); count(data.total_proveedores)
  const providers = array(data.proveedores)
  if (data.total_proveedores !== providers.length) return invalid()
  const aging = object(response.aging)
  array(aging.detalle)
  return providers.map(row => {
    text(row.proveedor_id); text(row.razon_social); text(row.ruc); count(row.cantidad_cxp)
    const amounts = object(row.deuda_por_moneda)
    if (!Object.keys(amounts).length) return invalid()
    for (const [code, amount] of Object.entries(amounts)) { currency(code); number(amount) }
    const byCurrency: Record<string, any> = {}
    for (const [code, amount] of Object.entries(amounts)) {
      const details = aging.detalle.filter((entry: any) => entry.proveedor_id === row.proveedor_id && entry.moneda === code)
      if (!details.length || sumReportMoney(details.map((entry: any) => entry.saldo)) !== amount) return invalid()
      const overdue = details.filter((entry: any) => entry.dias_vencidos > 0)
      byCurrency[code] = { deuda_total: amount, cantidad_cxp: details.length,
        deuda_vencida: sumReportMoney(overdue.map((entry: any) => entry.saldo)),
        deuda_por_vencer: sumReportMoney(details.filter((entry: any) => entry.dias_vencidos <= 0).map((entry: any) => entry.saldo)),
        dias_promedio_vencimiento: overdue.length ? Math.round(overdue.reduce((sum: number, entry: any) => sum + entry.dias_vencidos, 0) / overdue.length) : 0 }
    }
    return { ...row, byCurrency }
  })
}

export async function loadDebtWithAging(get: ReportRead, endpoint: string) {
  const response = await get(endpoint)
  array(object(envelope(response)).proveedores)
  const aging = readAgingReport(await get('/api/finanzas/cxp/aging'))
  return { ...response, aging }
}

export async function loadAllBankMovements(get: ReportRead, endpoint: string) {
  let rows: any[] = [], total: number | null = null, pages = 1
  for (let page = 1; page <= pages; page += 1) {
    const response = await get(`${endpoint}${endpoint.includes('?') ? '&' : '?'}page=${page}&limit=50&es_extracto=false`)
    const data = array(envelope(response)); const pagination = object(response.pagination)
    if (count(pagination.page) !== page || count(pagination.limit) !== 50) return invalid()
    const reportedTotal = count(pagination.total); const reportedPages = count(pagination.totalPages)
    if (reportedPages !== Math.ceil(reportedTotal / 50) || (total !== null && total !== reportedTotal)) return invalid()
    total = reportedTotal; pages = reportedPages
    rows = [...rows, ...data]
  }
  if (rows.length !== total || new Set(rows.map(row => row?.id)).size !== rows.length) return invalid()
  return { success: true, data: rows }
}

export function readBankMovements(response: any) {
  return array(envelope(response)).map(row => {
    text(row.id); text(row.cuenta_bancaria_id); date(row.fecha); number(row.monto)
    if (!['ABONO','CARGO'].includes(row.tipo) || typeof row.conciliado !== 'boolean' || row.es_extracto !== false) return invalid()
    const account = object(row.cuentas_bancarias)
    if (account.id !== row.cuenta_bancaria_id) return invalid()
    return { ...row, moneda: currency(account.moneda), cuenta_nombre: text(account.nombre), banco: text(account.banco) }
  })
}

export function readPendingReconciliations(response: any) {
  return array(envelope(response)).map(row => {
    text(row.id); text(row.cuenta_bancaria_id); date(row.fecha_desde); date(row.fecha_hasta); number(row.diferencia)
    if (!['ABIERTA','EN_PROCESO'].includes(row.estado)) return invalid()
    const account = object(row.cuentas_bancarias), stats = object(row.estadisticas)
    if (account.id !== row.cuenta_bancaria_id) return invalid()
    const system = count(stats.total_movimientos_sistema), statement = count(stats.total_movimientos_extracto)
    const matchedSystem = count(stats.movimientos_sistema_conciliados), matchedStatement = count(stats.movimientos_extracto_conciliados)
    const progress = number(stats.porcentaje_avance)
    if (matchedSystem > system || matchedStatement > statement || progress < 0 || progress > 100) return invalid()
    return { ...row, moneda: currency(account.moneda), cuenta_nombre: account.nombre || account.banco,
      banco: text(account.banco), numero_cuenta: text(account.numero_cuenta), items_sistema: system,
      items_extracto: statement, items_conciliados: matchedSystem + matchedStatement, porcentaje_avance: progress }
  })
}

export function readCashflowReport(response: any): any {
  const data = object(envelope(response)), period = object(data.periodo), stats = object(data.estadisticas)
  date(period.fecha_desde); date(period.fecha_hasta); count(period.dias)
  for (const key of ['total_cxp_pendientes','total_cxc_pendientes','total_movimientos']) count(stats[key])
  for (const row of array(data.cuentas_bancarias)) { text(row.id); currency(row.moneda); number(row.saldo_actual) }
  for (const row of array(data.resumen)) {
    currency(row.moneda)
    for (const key of ['saldo_actual','total_ingresos','total_egresos','flujo_neto','saldo_proyectado']) number(row[key])
    if (![null,'SALDO_NEGATIVO','SALDO_BAJO'].includes(row.alerta)) return invalid()
  }
  for (const row of array(data.proyeccion)) {
    date(row.fecha); currency(row.moneda)
    for (const key of ['saldo_inicial','ingresos','egresos','flujo_neto','saldo_final']) number(row[key])
    for (const item of array(row.items)) { number(item.monto); text(item.concepto); if (!['INGRESO','EGRESO'].includes(item.tipo)) return invalid() }
  }
  return data
}

/** El dashboard sólo publica un conjunto completo de sus tres lecturas. */
export async function loadTreasuryDashboard(get: ReportRead, paymentsEndpoint: string) {
  const [banks, payments, flow] = await Promise.all([
    get('/api/finanzas/bancos/cuentas'),
    get(paymentsEndpoint),
    get('/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=30'),
  ])
  return { banks, payments, flow }
}

interface TreasuryFlowSummary {
  moneda: string
  saldo_actual: number
  total_ingresos: number
  total_egresos: number
  flujo_neto: number
  saldo_proyectado: number
  alerta: string | null
}

export function readTreasuryDashboard(response: unknown) {
  const composite = object(response)
  const cuentas = array(envelope(composite.banks)).map(value => {
    const row = object(value)
    return {
      id: text(row.id), nombre: text(row.nombre), banco: text(row.banco),
      numero_cuenta: text(row.numero_cuenta), moneda: currency(row.moneda), saldo: number(row.saldo),
    }
  })
  const proximosPagos = array(envelope(composite.payments)).map(value => {
    const row = object(value), provider = object(row.proveedor)
    const days = number(row.dias_hasta_vencimiento)
    if (!Number.isSafeInteger(days) || !['VENCIDA', 'HOY', 'URGENTE', 'PROXIMA', 'NORMAL'].includes(row.urgencia)) return invalid()
    return {
      id: text(row.id), numero_documento: text(row.numero_documento),
      fecha_vencimiento: date(row.fecha_vencimiento), saldo: number(row.saldo), moneda: currency(row.moneda),
      dias_hasta_vencimiento: days, urgencia: text(row.urgencia),
      proveedor: { razon_social: text(provider.razon_social) },
    }
  })
  if (new Set(cuentas.map(row => row.id)).size !== cuentas.length
    || new Set(proximosPagos.map(row => row.id)).size !== proximosPagos.length) return invalid()
  const flujo = readCashflowReport(composite.flow)
  const resumenFlujo: TreasuryFlowSummary[] = flujo.resumen
  return { cuentas, proximosPagos, resumenFlujo }
}

export function readPaymentSchedule(response: any) {
  const data = array(envelope(response)).map(value => {
    const row = object(value), provider = object(row.proveedor)
    text(row.id); text(row.numero_documento); date(row.fecha_emision); date(row.fecha_vencimiento)
    text(provider.id); text(provider.razon_social); text(provider.ruc); currency(row.moneda)
    const balance = number(row.saldo), total = number(row.total), days = number(row.dias_hasta_vencimiento)
    if (balance <= 0 || total < balance || !Number.isSafeInteger(days)
      || !['PENDIENTE','PARCIAL','VENCIDA'].includes(row.estado)
      || !['VENCIDA','HOY','URGENTE','PROXIMA','NORMAL'].includes(row.urgencia)) return invalid()
    return row
  })
  const total = count(response.total), page = count(response.page), limit = count(response.limit)
  if (!page || !limit || limit > 100 || new Set(data.map(row => row.id)).size !== data.length
    || data.length !== Math.max(0, Math.min(limit, total - (page - 1) * limit))) return invalid()
  return { data, total, page, limit }
}

export async function loadTreasuryBatch(get: ReportRead) {
  const [banks, first] = await Promise.all([
    get('/api/finanzas/bancos/cuentas'),
    get('/api/finanzas/tesoreria/programacion?page=1&limit=100'),
  ])
  const initial = readPaymentSchedule(first)
  if (initial.page !== 1 || initial.limit !== 100) return invalid()
  const pages = [first]
  for (let page = 2; page <= Math.ceil(initial.total / 100); page += 1) {
    const response = await get(`/api/finanzas/tesoreria/programacion?page=${page}&limit=100`)
    const next = readPaymentSchedule(response)
    if (next.total !== initial.total || next.page !== page || next.limit !== 100) return invalid()
    pages.push(response)
  }
  return { banks, pages }
}

export function readTreasuryBatch(response: any) {
  const composite = object(response)
  const banks = array(envelope(composite.banks)).map(value => {
    const row = object(value)
    text(row.id); text(row.nombre); text(row.banco); text(row.numero_cuenta); currency(row.moneda); number(row.saldo)
    if (row.activa !== true) return invalid()
    return row
  })
  const pages = array(composite.pages).map(readPaymentSchedule)
  if (!pages.length) return invalid()
  const payments = pages.flatMap(page => page.data)
  if (payments.length !== pages[0].total || new Set(payments.map(row => row.id)).size !== payments.length
    || new Set(banks.map(row => row.id)).size !== banks.length) return invalid()
  return { banks, payments }
}

export function readBatchPaymentConfirmation(response: any, intent: {
  pagos: Array<{cxp_id: string; monto?: number}>
  cuenta_bancaria_id: string; referencia_lote: string; idempotency_key: string
}) {
  const result = object(envelope(response)), bank = object(result.cuenta_bancaria)
  if (response.offline === true || response.queued === true || result.sync_status === 'pending'
    || result.success !== true || result.idempotency_key !== intent.idempotency_key
    || result.referencia_lote !== intent.referencia_lote || bank.id !== intent.cuenta_bancaria_id) return invalid()
  text(result.lote_id); currency(bank.moneda); number(bank.saldo_anterior); number(bank.saldo_nuevo)
  const payments = array(result.pagos)
  if (payments.length !== intent.pagos.length || count(result.total_pagos) !== payments.length
    || count(result.pagos_exitosos) !== payments.length || count(result.pagos_fallidos) !== 0
    || new Set(payments.map(row => row.cxp_id)).size !== payments.length) return invalid()
  const pgMoney = (value: unknown) => {
    if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return number(Number(value))
    return number(value)
  }
  const confirmedPayments = payments.map(row => {
    const requested = intent.pagos.find(item => item.cxp_id === row.cxp_id)
    text(row.movimiento_bancario_id)
    if (!requested || number(row.monto) <= 0 || (requested.monto !== undefined && row.monto !== requested.monto)
      || !['PAGADA','PARCIAL'].includes(row.estado_nuevo)) return invalid()
    // El RPC conserva en cada fila los saldos del movimiento bancario, no la
    // deuda de la CxP. PostgreSQL los devuelve como texto dentro del resultado.
    const before = pgMoney(row.saldo_anterior), after = pgMoney(row.saldo_nuevo)
    if (Math.round((before - after) * 100) !== Math.round(row.monto * 100)) return invalid()
    return { ...row, saldo_bancario_anterior: before, saldo_bancario_nuevo: after }
  })
  if (sumReportMoney(payments.map(row => row.monto)) !== number(result.monto_total)
    || Math.round((bank.saldo_anterior - bank.saldo_nuevo) * 100) !== Math.round(result.monto_total * 100)) return invalid()
  return { ...result, pagos: confirmedPayments }
}
