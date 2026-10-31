type BenefitsSource = 'employees' | 'liquidations' | 'cts' | 'banks'

const invalid = (): never => { throw new Error('La consulta laboral está incompleta. Reintente para recuperar los datos actuales.') }
const object = (value: any): any => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value
}
const text = (value: any): string => {
  if (typeof value !== 'string' || !value.trim()) return invalid()
  return value
}
const money = (value: any) => {
  if ((typeof value !== 'number' && typeof value !== 'string') || !String(value).trim() || !Number.isFinite(Number(value))) invalid()
}
const employee = (value: any) => {
  for (const key of ['nombres', 'apellidos', 'numero_documento']) text(object(value)[key])
}

export function readBenefitsRows(response: any, source: BenefitsSource, tenantId: string): any[] {
  if (object(response).success !== true || !Array.isArray(response.data)) return invalid()
  const rows = response.data
  if (new Set(rows.map((row: any) => text(object(row).id))).size !== rows.length) return invalid()
  return rows.map((row: any) => {
    if (source !== 'banks' && row.tenant_id !== tenantId) invalid()
    if (source === 'employees') {
      employee(row)
      if (!['activo', 'inactivo'].includes(text(row.estado).toLowerCase())) invalid()
    } else {
      if (!/^[A-Z]{3}$/.test(text(row.moneda))) invalid()
      if (source === 'banks') text(row.nombre)
      else {
        employee(row.empleados)
        const employeeId = text(row[source === 'cts' ? 'empleado_id' : 'id_empleado'])
        if (row.empleados.id !== employeeId) invalid()
        if (source === 'cts') {
          if (!/^\d{4}-(05|11)$/.test(text(row.periodo))) invalid()
          if (!['calculado', 'depositado', 'anulado'].includes(text(row.estado).toLowerCase())) invalid()
          money(row.monto)
        } else {
          const date = text(row.fecha_terminacion)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) invalid()
          if (!['calculada', 'aprobada', 'pagada', 'anulada'].includes(text(row.estado).toLowerCase())) invalid()
          money(row.total_liquidacion)
        }
      }
    }
    return row
  })
}
