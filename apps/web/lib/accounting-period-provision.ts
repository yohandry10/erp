export type PeriodProvisionRequest = { periodo: string; diasVencido: number }
export type PeriodProvisionReceipt = { periodo: string; dias_vencido: number; documentos: number; monto_provisionado: number; asiento_id: string | null; mensaje?: string }
const fail = (): never => { throw new Error('La estimación no está confirmada. No se puede afirmar que no hubo deuda ni que se generó un asiento. Verifica el resultado con conexión.') }
const object = (v: unknown): Record<string, any> => { if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(); return v as Record<string, any> }
const live = (v: unknown) => { const value=object(v);for(const key of ['cached','queued','offline','pending'])if(value[key]!==undefined && value[key]!==false)return fail();return value }
export function periodProvisionDays(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error('La antigüedad debe ser un número entero de días entre 1 y 2147483647.')
  const days=Number(value.trim())
  if (!Number.isSafeInteger(days) || days<1 || days>2147483647) throw new Error('La antigüedad debe ser un número entero de días entre 1 y 2147483647.')
  return days
}
export function confirmPeriodProvision(response: unknown, request: PeriodProvisionRequest, tenantId: string): PeriodProvisionReceipt {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(request.periodo) || periodProvisionDays(String(request.diasVencido))!==request.diasVencido) return fail()
  const envelope=live(response)
  if (envelope.success!==true) return fail()
  const data=live(envelope.data)
  if (data.tenant_id!==undefined && data.tenant_id!==tenantId) return fail()
  if (data.periodo!==request.periodo || data.dias_vencido!==request.diasVencido || !Number.isSafeInteger(data.documentos) || data.documentos<0) return fail()
  const money=data.monto_provisionado
  if (!['number','string'].includes(typeof money) || !/^\d+(?:\.\d{1,2})?$/.test(String(money)) || !Number.isFinite(Number(money)) || !Number.isSafeInteger(Math.round(Number(money)*100))) return fail()
  const amount=Number(money)
  if (!('asiento_id' in data)) return fail()
  if (data.documentos===0) { if (amount!==0 || data.asiento_id!==null) return fail() }
  else if (amount<=0 || typeof data.asiento_id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.asiento_id)) return fail()
  if (data.mensaje!==undefined && (typeof data.mensaje!=='string' || !data.mensaje.trim())) return fail()
  return {...data,monto_provisionado:amount} as PeriodProvisionReceipt
}
