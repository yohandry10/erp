'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { useTenant } from '@/contexts/TenantContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface SalesReportConfiguration {
  habilitar_dashboards_otif: boolean
  habilitar_dashboards_sunat: boolean
  objetivo_otif: number
  frecuencia_actualizacion_dashboards: number
}

export function SalesReportSettings({ configuration, onSaved }: {
  configuration: Partial<SalesReportConfiguration>
  onSaved: () => Promise<void>
}) {
  const { hasPermission, loading } = usePermission('configuracion', 'write', '')
  const { user } = useTenant()
  const { put } = useApi({ showErrorToast: false, throwOnError: true, retries: 0, timeoutMs: 20000 })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SalesReportConfiguration | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const submitting = useRef(false)
  const valid = typeof configuration.habilitar_dashboards_otif === 'boolean'
    && typeof configuration.habilitar_dashboards_sunat === 'boolean'
    && Number.isFinite(Number(configuration.objetivo_otif))
    && Number.isInteger(Number(configuration.frecuencia_actualizacion_dashboards))
  const current = valid ? {
    habilitar_dashboards_otif: configuration.habilitar_dashboards_otif!,
    habilitar_dashboards_sunat: configuration.habilitar_dashboards_sunat!,
    objetivo_otif: Number(configuration.objetivo_otif),
    frecuencia_actualizacion_dashboards: Number(configuration.frecuencia_actualizacion_dashboards),
  } : null
  const changed = form && current && Object.keys(form).some(key => form[key as keyof SalesReportConfiguration] !== current[key as keyof SalesReportConfiguration])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current || !hasPermission || !form || !current || !changed) return
    if (!Number.isFinite(form.objetivo_otif) || form.objetivo_otif < 0 || form.objetivo_otif > 100
      || Number(form.objetivo_otif.toFixed(2)) !== form.objetivo_otif
      || !Number.isInteger(form.frecuencia_actualizacion_dashboards) || form.frecuencia_actualizacion_dashboards < 1
      || form.frecuencia_actualizacion_dashboards > 86400) {
      setError('Revisa el objetivo (0 a 100, hasta dos decimales) y la frecuencia (1 a 86400 segundos).')
      return
    }
    if (!user?.tenant_id || !user.id) { setError('Vuelve a iniciar sesión para guardar.'); return }
    submitting.current = true
    setSaving(true)
    setError(null)
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(form)))
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const storageKey = `erp.sales-report-edit-intent.${user.tenant_id}.${user.id}`
      let intent: { fingerprint: string; key: string } | null = null
      try { intent = JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { /* intención nueva */ }
      const key = intent?.fingerprint === fingerprint && intent.key ? intent.key : crypto.randomUUID()
      sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }))
      const response = await put('/configuration/empresa', form, { headers: { 'Idempotency-Key': key } })
      if (response?.success !== true || !response.data
        || Object.keys(form).some(field => String(response.data[field]) !== String(form[field as keyof SalesReportConfiguration]))) {
        throw new Error('No se pudo confirmar la configuración. Reintenta la misma edición.')
      }
      sessionStorage.removeItem(storageKey)
      await onSaved()
      setOpen(false)
      setMessage('Configuración de reportes actualizada.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar. Reintenta la misma edición.')
    } finally { submitting.current = false; setSaving(false) }
  }

  return <div className="mt-4 space-y-2">
    <h3 className="text-sm font-semibold">Reportes de ventas</h3>
    {!current ? <p role="alert" className="text-sm text-destructive">La configuración de reportes está incompleta. Actualiza la consulta.</p> : <dl className="space-y-1 text-sm">
      <div className="flex justify-between gap-4"><dt>Fill-rate y OTIF</dt><dd>{current.habilitar_dashboards_otif ? 'Habilitado' : 'Deshabilitado'}</dd></div>
      <div className="flex justify-between gap-4"><dt>KPIs SUNAT</dt><dd>{current.habilitar_dashboards_sunat ? 'Habilitado' : 'Deshabilitado'}</dd></div>
      <div className="flex justify-between gap-4"><dt>Objetivo OTIF</dt><dd>{current.objetivo_otif}%</dd></div>
      <div className="flex justify-between gap-4"><dt>Frecuencia indicada</dt><dd>{current.frecuencia_actualizacion_dashboards} segundos</dd></div>
    </dl>}
    {!loading && hasPermission && <Button type="button" variant="outline" disabled={!current} onClick={() => {
      setForm(current); setError(null); setMessage(null); setOpen(true)
    }}>Configurar reportes de ventas</Button>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    <Dialog open={open} onOpenChange={next => { if (!submitting.current) setOpen(next) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Configurar reportes de ventas</DialogTitle>
          <DialogDescription>Define los reportes disponibles para esta empresa. Los KPIs muestran los estados registrados; habilitarlos no envía documentos a SUNAT. La frecuencia indicada no activa una actualización automática.</DialogDescription>
        </DialogHeader>
        {form && <form onSubmit={save} className="space-y-4">
          <Label className="flex items-center gap-2" htmlFor="report-setting-otif"><input id="report-setting-otif" type="checkbox" checked={form.habilitar_dashboards_otif} disabled={saving} onChange={event => setForm({ ...form, habilitar_dashboards_otif: event.target.checked })} />Habilitar Fill-rate y OTIF</Label>
          <Label className="flex items-center gap-2" htmlFor="report-setting-sunat"><input id="report-setting-sunat" type="checkbox" checked={form.habilitar_dashboards_sunat} disabled={saving} onChange={event => setForm({ ...form, habilitar_dashboards_sunat: event.target.checked })} />Habilitar KPIs SUNAT</Label>
          <div className="space-y-1.5"><Label htmlFor="report-setting-objective">Objetivo OTIF (%)</Label><Input id="report-setting-objective" type="number" min={0} max={100} step="0.01" required disabled={saving} value={form.objetivo_otif} onChange={event => setForm({ ...form, objetivo_otif: event.target.valueAsNumber })} /></div>
          <div className="space-y-1.5"><Label htmlFor="report-setting-frequency">Frecuencia indicada (segundos)</Label><Input id="report-setting-frequency" type="number" min={1} max={86400} step="1" required disabled={saving} value={form.frecuencia_actualizacion_dashboards} onChange={event => setForm({ ...form, frecuencia_actualizacion_dashboards: event.target.valueAsNumber })} /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving || !changed}>{saving ? 'Guardando…' : 'Guardar configuración'}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </div>
}
