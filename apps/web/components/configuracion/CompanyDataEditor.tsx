'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { useAuth } from '@/contexts/AuthContext'
import { companyEditConfirmed, readCompanyEditIntent, readLegacyCompanyEditIntent, type CompanyEditIntent } from '@/lib/company-edit-contract'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const fields = [
  { key: 'razonSocial', label: 'Razón social', maxLength: 300, required: true },
  { key: 'nombreComercial', label: 'Nombre comercial', maxLength: 300 },
  { key: 'direccion', label: 'Dirección fiscal', maxLength: 500, required: true },
  { key: 'telefono', label: 'Teléfono', maxLength: 60, type: 'tel' },
  { key: 'email', label: 'Correo', maxLength: 200, type: 'email' },
] as const
type Field = typeof fields[number]['key']
type CompanyData = Partial<Record<Field, string>>
type FormData = Record<Field, string>

function values(company: CompanyData): FormData {
  return Object.fromEntries(fields.map(field => [field.key, company[field.key] || ''])) as FormData
}

export function CompanyDataEditor({ company, onSaved }: {
  company: CompanyData
  onSaved: () => Promise<void>
}) {
  const { hasPermission, loading } = usePermission('configuracion', 'write', '')
  const { session, loading: authLoading } = useAuth()
  const user = session?.user
  const scope = user?.tenant_id && user.id ? `${user.tenant_id}.${user.id}` : ''
  const durableKey = `erp.company-edit.pending.${scope}`
  const legacyKey = `erp.company-edit-intent.${scope}`
  const scopeRef = useRef(scope); scopeRef.current = authLoading ? '' : scope
  const { put } = useApi({ requireLive: true, showErrorToast: false, throwOnError: true, retries: 0, timeoutMs: 20000 })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => values(company))
  const [initial, setInitial] = useState(() => values(company))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const submitting = useRef(false)
  const revision = useRef(0)
  const [pending, setPending] = useState<CompanyEditIntent | null>(null)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [ready, setReady] = useState('')
  const changed = fields.some(field => form[field.key].trim() !== initial[field.key])

  useEffect(() => {
    revision.current++; submitting.current = false; setSaving(false)
    scopeRef.current = authLoading ? '' : scope
    setOpen(false); setPending(null); setRecoveryError(null); setReady(''); setError(null); setMessage(null)
    if (!scope || authLoading) return
    try {
      const intent = readCompanyEditIntent(localStorage.getItem(durableKey))
      const legacy = readLegacyCompanyEditIntent(sessionStorage.getItem(legacyKey))
      if (intent && legacy && intent.key !== legacy.key) throw new Error('Las intenciones de empresa no coinciden. Se conservan para su recuperación.')
      setPending(intent); setReady(scope)
    } catch (cause) { setRecoveryError(cause instanceof Error ? cause.message : 'No se pudo recuperar la intención de empresa.'); setReady(scope) }
    return () => { scopeRef.current = '' }
  }, [scope, authLoading, durableKey, legacyKey])

  const edit = () => {
    setInitial(values(company)); setForm(values(company))
    try {
      const intent = readCompanyEditIntent(localStorage.getItem(durableKey))
      const legacy = readLegacyCompanyEditIntent(sessionStorage.getItem(legacyKey))
      if (intent && legacy && intent.key !== legacy.key) throw new Error('Las intenciones de empresa no coinciden. Se conservan para su recuperación.')
      setPending(intent); setRecoveryError(null); setInitial(values(company)); setForm(intent ? intent.form as FormData : values(company))
    } catch (cause) { setRecoveryError(cause instanceof Error ? cause.message : 'No se pudo recuperar la intención.'); }
    setError(null)
    setMessage(null)
    setOpen(true)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current || !hasPermission || authLoading || ready !== scope || recoveryError || !pending && !changed) return
    const patch = pending?.payload || Object.fromEntries(fields.filter(field => form[field.key].trim() !== initial[field.key])
      .map(field => [field.key, form[field.key].trim()]))
    const empty = fields.find(field => 'required' in field && field.required && Object.hasOwn(patch, field.key) && !patch[field.key])
    if (empty) { setError(`${empty.label} no puede quedar vacío.`); return }
    if (!user?.tenant_id || !user.id) { setError('Vuelve a iniciar sesión para guardar.'); return }
    const current = scope
    const currentRevision = revision.current
    submitting.current = true
    setSaving(true)
    setError(null)
    try {
      // Se conserva el cuerpo antes del POST. Un legacy sólo se recupera con
      // la misma huella; nunca se sustituye silenciosamente por otra edición.
      const payload = JSON.stringify(patch)
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      if (scopeRef.current !== current || revision.current !== currentRevision) return
      const legacy = readLegacyCompanyEditIntent(sessionStorage.getItem(legacyKey))
      const stored = readCompanyEditIntent(localStorage.getItem(durableKey))
      if (legacy && legacy.fingerprint !== fingerprint) throw new Error('Hay una edición anterior sin confirmar. Reintroduce los mismos cambios para recuperar su resultado.')
      const intent = pending || { key: legacy?.key || crypto.randomUUID(), payload: patch, form }
      if (stored && stored.key !== intent.key) throw new Error('Hay otra edición pendiente de empresa. Se conserva su intención.')
      localStorage.setItem(durableKey, JSON.stringify(intent)); sessionStorage.setItem(legacyKey, JSON.stringify({ fingerprint, key: intent.key })); setPending(intent)
      const response = await put('/configuration/empresa', intent.payload, { headers: { 'Idempotency-Key': intent.key } })
      if (scopeRef.current !== current || revision.current !== currentRevision) return
      companyEditConfirmed(response, patch, user.tenant_id)
      if (readCompanyEditIntent(localStorage.getItem(durableKey))?.key !== intent.key) throw new Error('La intención del editor cambió. Se conserva el resultado para su recuperación.')
      localStorage.removeItem(durableKey)
      if (readLegacyCompanyEditIntent(sessionStorage.getItem(legacyKey))?.key === intent.key) sessionStorage.removeItem(legacyKey)
      setPending(null)
      await onSaved()
      if (scopeRef.current !== current || revision.current !== currentRevision) return
      setOpen(false)
      setMessage('Datos de empresa actualizados.')
    } catch (cause) {
      if (scopeRef.current === current && revision.current === currentRevision) setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los datos. Reintenta la misma edición.')
    } finally {
      if (scopeRef.current === current && revision.current === currentRevision) { submitting.current = false; setSaving(false) }
    }
  }

  if (loading || authLoading || !hasPermission || ready !== scope) return null
  return (
    <div className="mt-4 space-y-2">
      <Button type="button" variant="outline" onClick={edit}>Editar datos de empresa</Button>
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      <Dialog open={open} onOpenChange={next => { if (!submitting.current) setOpen(next) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar datos de empresa</DialogTitle>
            <DialogDescription>Actualiza los datos que se usarán en los próximos documentos.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {pending && <p role="status">Hay una edición pendiente de confirmación. Se conservan los datos y la misma clave.</p>}
            {recoveryError && <p role="alert">{recoveryError}</p>}
            <p className="text-sm text-muted-foreground">Al vaciar el nombre comercial se restablece el nombre registrado de la empresa.</p>
            {fields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`company-${field.key}`}>{field.label}</Label>
                <Input id={`company-${field.key}`} type={'type' in field ? field.type : 'text'}
                  maxLength={field.maxLength} required={'required' in field && field.required}
                  value={form[field.key]} disabled={saving || !!pending || !!recoveryError}
                  onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))} />
              </div>
            ))}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving || !!recoveryError || !pending && !changed}>{saving ? 'Guardando…' : pending ? 'Reintentar edición pendiente' : 'Guardar cambios'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
