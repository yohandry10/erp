import { fetchApi } from '@/lib/api-fetch'
import { isOfflineCachedResponse } from '@/lib/offline-store'
import { customAuth } from '@/lib/auth-service'

const invalid = (): never => { throw new Error('La consulta de planilla está incompleta. Reintente para recuperar los datos actuales.') }
const object = (value: any): any => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value
}
const text = (value: any): string => {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}
const money = (value: any) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) invalid()
}
const rows = (value: any): any[] => {
  if (!Array.isArray(value)) return invalid()
  if (new Set(value.map(row => text(object(row).id))).size !== value.length) return invalid()
  return value
}
const period = (value: any) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text(value))) invalid() }

export function readPayrollList(response: any, expectedTenant?: string): any[] {
  if (object(response).success !== true) return invalid()
  const tenant = text(response.tenant_id)
  const list = rows(response.data)
  const source = object(response.fuentes_planillas)
  if ((expectedTenant !== undefined && tenant !== expectedTenant) || !Number.isSafeInteger(response.total) || response.total < 0 || response.total !== list.length || source.complete !== true || source.total !== response.total || source.page_size !== 1000) return invalid()
  if ([response, source, ...list].some(value => ['queued','cached','offline','pending','from_cache'].some(key => value[key] === true))) return invalid()
  return list.map(row => {
    if (row.tenant_id !== tenant) return invalid()
    text(row.tenant_id); period(row.periodo)
    if (!['borrador','calculada','aprobada','pagada','anulada'].includes(row.estado)) invalid()
    for (const key of ['total_ingresos','total_descuentos','total_aportes','total_neto','total_pagado','eps_arrastre_disponible']) money(row[key])
    if (!/^[A-Z]{3}$/.test(text(row.moneda))) invalid()
    return row
  })
}

function payrollDetailRows(response: any, planilla: any): any[] {
  const result = rows(response)
  if (!result.length && planilla.estado !== 'borrador') return invalid()
  return result.map(row => {
    if (row.id_planilla !== planilla.id || row.tenant_id !== planilla.tenant_id) invalid()
    text(row.id_empleado)
    for (const key of ['nombres','apellidos','numero_documento']) text(object(row.empleados)[key])
    for (const key of ['total_ingresos','total_descuentos','total_aportes','neto_pagar']) money(row[key])
    if (!Number.isInteger(row.dias_trabajados) || row.dias_trabajados < 0 || row.dias_trabajados > 31) invalid()
    if (!Array.isArray(row.empleado_planilla_conceptos) || !row.empleado_planilla_conceptos.length) invalid()
    for (const item of row.empleado_planilla_conceptos) {
      money(object(item).monto)
      text(object(item.conceptos_planilla).codigo); text(item.conceptos_planilla.nombre)
    }
    return row
  })
}

const sourceComplete = (source: any, total: number) => {
  object(source)
  if (source.complete !== true || !Number.isSafeInteger(source.total) || source.total !== total || source.page_size !== 1000 || ['queued','cached','offline','pending','from_cache'].some(key => source[key] === true)) invalid()
}

export function readPayrollDetail(response: any, planilla: any): any[] {
  const body = object(response)
  if (body.success !== true || body.tenant_id !== planilla.tenant_id || body.planilla_id !== planilla.id || ['queued','cached','offline','pending','from_cache'].some(key => body[key] === true)) invalid()
  const data = payrollDetailRows(body.data, planilla)
  if (!Number.isSafeInteger(body.total) || body.total !== data.length) invalid()
  sourceComplete(body.fuentes_detalle, data.length)
  sourceComplete(body.fuentes_conceptos, data.reduce((sum, row) => sum + row.empleado_planilla_conceptos.length, 0))
  if (!Array.isArray(body.fuentes_conceptos.por_empleado)) invalid()
  const perParent = rows(body.fuentes_conceptos.por_empleado.map((source: any) => ({ ...source, id: object(source).id_empleado_planilla })))
  if (perParent.length !== data.length) invalid()
  for (const row of data) {
    const source = perParent.find(item => item.id === row.id)
    if (!source || !Number.isSafeInteger(source.total) || source.total !== row.empleado_planilla_conceptos.length || ['queued','cached','offline','pending','from_cache'].some(key => source[key] === true) || ['queued','cached','offline','pending','from_cache'].some(key => row[key] === true || row.empleado_planilla_conceptos.some((item: any) => item[key] === true))) invalid()
  }
  return data
}

export function readPayrollBoleta(response: any, detail: any, planilla: any) {
  const row = object(response)
  if (row.id !== detail.id || row.id_empleado !== detail.id_empleado) invalid()
  if (['queued','cached','offline','pending','from_cache'].some(key => row[key] === true || row.empleado_planilla_conceptos?.some((item: any) => item[key] === true))) invalid()
  payrollDetailRows([row], planilla)
  sourceComplete(row.fuentes_conceptos, row.empleado_planilla_conceptos.length)
  if (object(row.planillas).id !== planilla.id || row.planillas.tenant_id !== planilla.tenant_id || row.planillas.periodo !== planilla.periodo) invalid()
  text(object(row.empresa).razon_social); text(row.empresa.ruc)
  return row
}

export function readPayrollPaymentDestinations(response: any) {
  if (response && typeof response === 'object' && ['queued','cached','offline','pending'].some(key => response[key] === true || response.data?.[key] === true)) return invalid()
  if (object(response).success !== true) return invalid()
  const data = object(response.data)
  const banks = rows(data.cuentas_bancarias)
  const sessions = rows(data.sesiones_caja)
  for (const bank of banks) {
    text(bank.nombre)
    if (!/^[A-Z]{3}$/.test(text(bank.moneda)) || bank.activa !== true || bank.activo !== true) invalid()
  }
  for (const session of sessions) {
    text(session.caja_id)
    if (!/^[A-Z]{3}$/.test(text(session.moneda)) || String(session.estado).toLowerCase() !== 'abierta' || session.congelada !== false) invalid()
  }
  return data
}

export async function readLivePayroll<T>(endpoint: string, validate: (response: any, tenant?: string) => T): Promise<T> {
  const actor = (await customAuth.getRequestSession()).session?.user
  const sourceEndpoint = /^\/(?:api\/)?rrhh\/planillas\/[^/?]+\/detalle\/?$/.test(endpoint) ? `${endpoint}?fuentes=complete-v1` : endpoint
  const response = await fetchApi(sourceEndpoint)
  if (!response.ok || isOfflineCachedResponse(response) || response.headers.get('x-erp-offline-queued') === 'true') throw new Error('No se pudo consultar la planilla actual. Reintente.')
  const body = await response.json()
  if (body && typeof body === 'object' && ['queued','cached','offline','pending'].some(key => body[key] === true || body.data?.[key] === true)) throw new Error('La consulta no confirma una respuesta en vivo. Reintente con conexión.')
  const result = validate(body, actor?.tenant_id)
  const current = (await customAuth.getRequestSession()).session?.user
  if (!actor || current?.id !== actor.id || current.tenant_id !== actor.tenant_id) throw new Error('La sesión cambió durante la consulta. Consulte nuevamente la planilla.')
  const values = Array.isArray(result) ? result : [result]
  if (values.some(row => row.tenant_id !== actor.tenant_id)) return invalid()
  return result
}
