const columns = {
  razonSocial: 'razon_social', nombreComercial: 'nombre_comercial',
  direccion: 'direccion_fiscal', telefono: 'telefono', email: 'email',
} as const
const required = ['razon_social', 'direccion_fiscal']
const optional = ['nombre_comercial', 'telefono', 'email']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function companyEditConfirmed(response: any, patch: Record<string, unknown>, tenantId: string): void {
  const data = response?.data
  if (!uuid.test(tenantId) || response?.success !== true || response.offline || response.pending || response.queued
    || !data || data.offline || data.pending || data.queued || data.tenant_id !== tenantId
    || required.some(key => typeof data[key] !== 'string' || !data[key].trim())
    || optional.some(key => data[key] !== null && typeof data[key] !== 'string')
    || !Object.keys(patch).length || Object.entries(patch).some(([key, value]) => {
      if (!Object.hasOwn(columns, key) || typeof value !== 'string') return true
      const column = columns[key as keyof typeof columns]
      const normalized = value.trim()
      if (required.includes(column) && !normalized) return true
      // El trigger vigente restablece el nombre registrado al quitar el alias.
      if (column === 'nombre_comercial' && !normalized) return typeof data.nombre !== 'string' || !data.nombre.trim() || data.nombre_comercial !== data.nombre.trim()
      return data[column] !== (optional.includes(column) && !normalized ? null : normalized)
    })) throw new Error('El guardado de empresa no fue confirmado con los datos enviados. Reintenta la misma edición para recuperar su resultado.')
}
export type CompanyEditIntent = { key: string; payload: Record<string, string>; form: Record<string, string> }
export function readCompanyEditIntent(serialized: string | null): CompanyEditIntent | null {
  if (!serialized) return null
  let value: any
  try { value = JSON.parse(serialized) } catch { throw new Error('No se pudo recuperar la edición pendiente de empresa. La intención se conserva.') }
  const keys = Object.keys(columns)
  if (!uuid.test(value?.key || '') || !value.payload || Array.isArray(value.payload) || !value.form || Array.isArray(value.form)
    || !Object.keys(value.payload).length || Object.keys(value.form).length !== keys.length
    || keys.some(key => typeof value.form[key] !== 'string')
    || ['razonSocial', 'direccion'].some(key => !value.form[key].trim())
    || Object.entries(value.payload).some(([key, entry]) => !keys.includes(key) || typeof entry !== 'string' || entry !== entry.trim() || value.form[key].trim() !== entry
      || ['razonSocial', 'direccion'].includes(key) && !entry)) throw new Error('No se pudo recuperar la edición pendiente de empresa. La intención se conserva.')
  return value
}
export function readLegacyCompanyEditIntent(serialized: string | null): { fingerprint: string; key: string } | null {
  if (!serialized) return null
  let value: any
  try { value = JSON.parse(serialized) } catch { throw new Error('No se pudo recuperar la intención anterior de empresa. La intención se conserva.') }
  if (!uuid.test(value?.key || '') || !/^[0-9a-f]{64}$/i.test(value?.fingerprint || '')) throw new Error('No se pudo recuperar la intención anterior de empresa. La intención se conserva.')
  return value
}
