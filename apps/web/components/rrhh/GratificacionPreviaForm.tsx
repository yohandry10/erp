'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type GratificacionPreviaFormValue = {
  enabled: boolean
  monto: string
  fecha_pago: string
  referencia: string
  bonificacion_extraordinaria: string
}
export const emptyGratificacionPrevia = (): GratificacionPreviaFormValue => ({
  enabled: false, monto: '', fecha_pago: '', referencia: '', bonificacion_extraordinaria: '',
})

export type RemuneracionPreviaValue = { enabled: boolean; monto: string; referencia: string }
export const emptyRemuneracionPrevia = (): RemuneracionPreviaValue => ({ enabled: false, monto: '', referencia: '' })
export function remuneracionPreviaPayload(value: RemuneracionPreviaValue, periodo: string) {
  if (!value.enabled) return undefined
  if (!periodo || !value.monto.trim() || !Number.isFinite(Number(value.monto)) || Number(value.monto) <= 0 || !value.referencia.trim()) {
    throw new Error('Completa el importe computable y la referencia del período anterior.')
  }
  return { periodo, monto: Number(value.monto), referencia: value.referencia.trim() }
}

export function RemuneracionPreviaForm({ periodo, value, onChange, id = 'liquidation-remuneracion' }: {
  periodo: string; value: RemuneracionPreviaValue; onChange: (value: RemuneracionPreviaValue) => void; id?: string
}) {
  return <div className="space-y-3 rounded-xl border p-3">
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })}/>Declarar remuneración computable de {periodo || 'mes anterior al cese'}</label>
    <p className="text-xs text-muted-foreground">Se utiliza el contrato vigente del mes anterior. Declara una fuente externa si ese importe corresponde a una remuneración anterior al ERP; incluye la asignación familiar computable. No genera otro pago.</p>
    {value.enabled && <div className="grid gap-3 md:grid-cols-2">
      <div><Label htmlFor={`${id}-monto`}>Base computable del mes anterior (S/)</Label><Input id={`${id}-monto`} type="number" min="0" step="0.01" value={value.monto} onChange={event => onChange({ ...value, monto: event.target.value })}/></div>
      <div><Label htmlFor={`${id}-referencia`}>Referencia de la remuneración anterior</Label><Input id={`${id}-referencia`} maxLength={240} value={value.referencia} onChange={event => onChange({ ...value, referencia: event.target.value })}/></div>
    </div>}
  </div>
}

export function gratificacionPreviaPayload(value: GratificacionPreviaFormValue, periodo: string) {
  if (!value.enabled) return undefined
  if (!periodo || value.monto.trim() === '' || !Number.isFinite(Number(value.monto)) || Number(value.monto) < 0
      || !value.fecha_pago || !value.referencia.trim()) {
    throw new Error('Completa importe, fecha y referencia de la gratificación anterior. Declara 0 si no se percibió un importe.')
  }
  if (value.bonificacion_extraordinaria !== '' && (!Number.isFinite(Number(value.bonificacion_extraordinaria)) || Number(value.bonificacion_extraordinaria) < 0)) {
    throw new Error('La bonificación extraordinaria debe ser un importe igual o mayor a cero.')
  }
  return {
    periodo, monto: Number(value.monto), fecha_pago: value.fecha_pago, referencia: value.referencia.trim(),
    ...(value.bonificacion_extraordinaria === '' ? {} : { bonificacion_extraordinaria: Number(value.bonificacion_extraordinaria) }),
  }
}

export function GratificacionPreviaForm({ id, periodo, value, onChange }: {
  id: string
  periodo: string
  value: GratificacionPreviaFormValue
  onChange: (value: GratificacionPreviaFormValue) => void
}) {
  const change = (field: keyof GratificacionPreviaFormValue, text: string) => onChange({ ...value, [field]: text })
  return <div className="space-y-3 rounded-xl border p-3">
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })}/>
      Declarar gratificación de {periodo || 'un período anterior'} pagada fuera del ERP
    </label>
    <p className="text-xs text-muted-foreground">Úsalo para pagos anteriores al inicio del ERP. Conserva la referencia del sustento; esta declaración no registra otro pago. Si la planilla ya está pagada aquí, se utiliza su importe histórico.</p>
    {value.enabled && <div className="grid gap-3 md:grid-cols-2">
      <div><Label htmlFor={`${id}-monto`}>Gratificación percibida (S/)</Label><Input id={`${id}-monto`} type="number" min="0" step="0.01" value={value.monto} onChange={event => change('monto', event.target.value)}/></div>
      <div><Label htmlFor={`${id}-fecha`}>Fecha del pago anterior</Label><Input id={`${id}-fecha`} type="date" value={value.fecha_pago} onChange={event => change('fecha_pago', event.target.value)}/></div>
      <div><Label htmlFor={`${id}-referencia`}>Referencia del sustento</Label><Input id={`${id}-referencia`} maxLength={240} value={value.referencia} onChange={event => change('referencia', event.target.value)} placeholder="Boleta, operación o documento de origen"/></div>
      <div><Label htmlFor={`${id}-bonificacion`}>Bonificación extraordinaria ya percibida (S/, opcional)</Label><Input id={`${id}-bonificacion`} type="number" min="0" step="0.01" value={value.bonificacion_extraordinaria} onChange={event => change('bonificacion_extraordinaria', event.target.value)}/></div>
    </div>}
  </div>
}
