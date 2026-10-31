const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const states = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA']
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const date = (value: unknown): value is string => text(value) && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10)
const invalid = (): never => { throw new Error('La respuesta de la cuenta por pagar está incompleta.') }
function data(response: any) {
  if (response?.success !== true || response.offline || response.cached || response.pending || response.queued
    || response.data?.offline || response.data?.cached || response.data?.pending || response.data?.queued) return invalid()
  return response.data
}

export function readCxpDetail(response: any, id: string, tenantId: string) {
  const value = data(response)
  if (!uuid.test(id) || !uuid.test(tenantId) || value?.id !== id || value?.tenant_id !== tenantId
    || !uuid.test(value.proveedor_id || '') || !text(value.numero_documento) || !text(value.tipo_documento)
    || !states.includes(value.estado) || !/^[A-Z]{3}$/.test(value.moneda || '')
    || !date(value.fecha_emision) || !date(value.fecha_vencimiento)
    || !money(value.total) || !money(value.saldo) || value.saldo > value.total
    || value.proveedor?.id !== value.proveedor_id || !text(value.proveedor?.razon_social) || !text(value.proveedor?.ruc)
    || (value.estado === 'PAGADA' && value.saldo !== 0)) return invalid()
  if (value.original_fiscal_amounts != null && !money(value.original_fiscal_amounts.total)) return invalid()
  return value
}

export function readCxpPayments(response: any, currency: string, accountId: string, tenantId: string) {
  const rows = data(response)
  const source = response?.fuentes_pagos
  const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
  if (!/^[A-Z]{3}$/.test(currency) || !uuid.test(accountId) || !uuid.test(tenantId) || !Array.isArray(rows)
    || response.tenant_id !== tenantId || response.cuenta_por_pagar_id !== accountId || response.moneda !== currency
    || !count(response.total) || response.total !== rows.length || !source || source.complete !== true
    || source.total !== response.total || source.page_size !== 1000 || !count(source.bank_total) || !count(source.cash_total)
    || source.bank_total + source.cash_total !== rows.length
    || [response, source, ...rows].some(value => !value || ['offline','cached','queued','pending','from_cache'].some(key => value[key] === true))) return invalid()
  for (const row of rows) {
    if (!uuid.test(row?.id || '') || !date(row.fecha) || !money(row.monto) || row.monto <= 0
      || !Number.isSafeInteger(Math.round(row.monto * 100)) || Math.abs(row.monto * 100 - Math.round(row.monto * 100)) > 0.000001
      || row.tenant_id !== tenantId || row.cxp_id !== accountId || row.cuenta_por_pagar_id !== accountId || row.moneda !== currency
      || !['EFECTIVO','TRANSFERENCIA','CHEQUE','TARJETA'].includes(row.metodo_pago) || typeof row.conciliado !== 'boolean') return invalid()
    if (row.cuenta_bancaria != null) {
      const bank = row.cuenta_bancaria
      if (row.fuente !== 'BANCO' || row.tipo !== 'CARGO' || !uuid.test(bank.id || '') || bank.id !== row.cuenta_bancaria_id || !text(bank.banco)
        || !text(bank.numero_cuenta) || bank.moneda !== currency) return invalid()
    } else if (row.fuente !== 'CAJA' || row.metodo_pago !== 'EFECTIVO' || row.estado !== 'APLICADO' || row.activo !== true) return invalid()
  }
  if (rows.filter(row => row.fuente === 'BANCO').length !== source.bank_total
    || rows.filter(row => row.fuente === 'CAJA').length !== source.cash_total) return invalid()
  if (new Set(rows.map(row => row.id)).size !== rows.length) return invalid()
  if (!Number.isSafeInteger(rows.reduce((sum, row) => sum + Math.round(row.monto * 100), 0))) return invalid()
  return rows as any[]
}
