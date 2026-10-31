'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ArrowLeft, Save, AlertCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { confirmPeriodCreated, newPeriodCreateIntent, periodCreateIntentKey, readPeriodCreateIntent, type PeriodCreateIntent } from '@/lib/accounting-period-create'

export default function NuevoPeriodoPage() {
  const { session } = useAuth()
  return <NuevoPeriodoWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />
}

function NuevoPeriodoWorkspace() {
  const router = useRouter()
  const { session, loading: authLoading } = useAuth()
  const permission = usePermission('contabilidad', 'crear', 'periodos')
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || ''
  const scopeIdentity = `${tenantId}:${actorId}`
  const canCreate = !authLoading && !!tenantId && !!actorId && !permission.loading && permission.hasPermission
  const activeScope = useRef(scopeIdentity); activeScope.current = scopeIdentity
  const currentPermission = useRef(canCreate); currentPermission.current = canCreate
  const epoch = useRef(0), inflight = useRef(false)
  const [ready, setReady] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<PeriodCreateIntent | null>(null)
  const [recoveryError, setRecoveryError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({ anio: new Date().getFullYear(), mes: new Date().getMonth() + 1 })
  const { apiCall } = useApi<unknown>({ requireLive: true, retries: 0, timeoutMs: 30000, showErrorToast: false, throwOnError: true })

  useEffect(() => {
    epoch.current++; inflight.current = false
    setReady(false); setLoading(false); setError(null); setPendingIntent(null); setRecoveryError('')
    if (authLoading || !tenantId || !actorId) return
    try {
      const scope = { tenantId, actorId }
      const intent = readPeriodCreateIntent(localStorage.getItem(periodCreateIntentKey(scope)), scope)
      setPendingIntent(intent)
      if (intent) setFormData({ ...intent.payload })
    } catch {
      setRecoveryError('No se pudo recuperar la creación pendiente. Sus datos se conservan; revisa el resultado antes de continuar.')
    }
    setReady(true)
    return () => { epoch.current++ }
  }, [authLoading, tenantId, actorId])

  const submit = async () => {
    if (!ready || !canCreate || recoveryError || inflight.current) return
    inflight.current = true; setLoading(true); setError(null)
    const requestedEpoch = epoch.current, requestedScope = scopeIdentity
    const current = () => requestedEpoch === epoch.current && activeScope.current === requestedScope && currentPermission.current
    try {
      const scope = { tenantId, actorId }, key = periodCreateIntentKey(scope)
      const existing = localStorage.getItem(key)
      const recovered = readPeriodCreateIntent(existing, scope)
      if ((pendingIntent && existing !== JSON.stringify(pendingIntent)) || (!pendingIntent && recovered)) {
        throw new Error('La creación pendiente cambió. Sus datos se conservan; recarga para revisarlos.')
      }
      const intent = recovered || newPeriodCreateIntent(formData, scope), raw = JSON.stringify(intent)
      if (!existing) localStorage.setItem(key, raw)
      if (localStorage.getItem(key) !== raw) throw new Error('No se pudo guardar la creación pendiente. Reintenta sin cambiar sus datos.')
      if (!current()) return
      setPendingIntent(intent)
      const response = await apiCall('/contabilidad/periodos', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'idempotency-key': intent.idempotencyKey },
        body: JSON.stringify(intent.payload)
      })
      if (!current()) return
      confirmPeriodCreated(response, intent, scope)
      if (localStorage.getItem(key) !== raw) throw new Error('La creación pendiente cambió durante la confirmación. Sus datos se conservan; recarga para revisarlos.')
      localStorage.removeItem(key)
      if (localStorage.getItem(key) !== null) throw new Error('El período está confirmado, pero no se pudo retirar la creación pendiente. Reintenta con los mismos datos.')
      setPendingIntent(null)
      router.push('/dashboard/contabilidad/periodos')
    } catch (err: unknown) {
      if (current()) setError(err instanceof Error ? err.message : 'No se pudo confirmar la creación del período. Reintenta con conexión.')
    } finally {
      if (requestedEpoch === epoch.current && activeScope.current === requestedScope) { inflight.current = false; setLoading(false) }
    }
  }

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void submit() }

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]

  const currentYear = new Date().getFullYear()
  const years = Array.from(new Set([...Array.from({ length: 10 }, (_, i) => currentYear - 5 + i), formData.anio])).sort((a, b) => a - b)

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.back()} className="inline-flex items-center gap-2 py-2 px-4 bg-muted text-foreground/85 border-0 rounded-lg cursor-pointer text-[0.875rem] font-semibold mb-4 transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e5e7eb'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f3f4f6'
            }}
          >
            <ArrowLeft size={16} />
            Volver
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Crear Período Contable</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Crea un nuevo período contable para registrar operaciones
          </p>
        </div>
      </div>

      {(!ready || permission.loading) && <p role="status">Cargando permisos y creación pendiente...</p>}
      {ready && !permission.loading && !canCreate && <p role="alert">No tienes permiso para crear períodos contables.</p>}
      {canCreate && ready && recoveryError && <p role="alert">{recoveryError}</p>}
      {canCreate && ready && !recoveryError && <>
      {pendingIntent && <div data-testid="period-create-pending" className="mb-6 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Creación de período pendiente de confirmar</h2>
        <p>{pendingIntent.payload.anio}-{String(pendingIntent.payload.mes).padStart(2, '0')}. Se conservan sus datos para reintentar con conexión.</p>
      </div>}
      {/* Form */}
      <div className="bg-card rounded-xl shadow p-8 max-w-[600px]">
        {error && (
          <div role="alert" className="p-4 bg-[#fee2e2] border rounded-lg mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-destructive shrink-0 mt-0.5" />
            <p className="m-0 text-destructive text-[0.875rem]">
              {error}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Año */}
          <div className="mb-6">
            <label
              htmlFor="anio" className="block mb-2 text-[0.875rem] font-semibold text-foreground/85"
            >
              Año <span className="text-destructive">*</span>
            </label>
            <select
              id="anio"
              value={formData.anio}
              onChange={(e) => setFormData({ ...formData, anio: parseInt(e.target.value) })}
              required
              disabled={loading || !!pendingIntent} className="w-[100%] p-3 border rounded-lg text-[0.875rem] text-foreground transition"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Mes */}
          <div className="mb-8">
            <label
              htmlFor="mes" className="block mb-2 text-[0.875rem] font-semibold text-foreground/85"
            >
              Mes <span className="text-destructive">*</span>
            </label>
            <select
              id="mes"
              value={formData.mes}
              onChange={(e) => setFormData({ ...formData, mes: parseInt(e.target.value) })}
              required
              disabled={loading || !!pendingIntent} className="w-[100%] p-3 border rounded-lg text-[0.875rem] text-foreground transition"
            >
              {meses.map((mes, index) => (
                <option key={index + 1} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-muted border rounded-lg mb-8">
            <p className="m-0 text-[0.875rem] text-[#1e40af] leading-6">
              <strong>Nota:</strong> El período se creará en estado <strong>ABIERTO</strong>,
              permitiendo el registro de asientos contables. Podrás cerrarlo más tarde desde
              la lista de períodos.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={loading} className="py-3 px-6 bg-muted text-foreground/85 border rounded-lg text-[0.875rem] font-semibold transition"
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#e5e7eb'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f3f4f6'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading} className="flex items-center gap-2 py-3 px-6 text-white border-0 rounded-lg text-[0.875rem] font-semibold transition"
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#2563eb'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.4)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = '#3b82f6'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                }
              }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full" />
                  Creando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {pendingIntent ? 'Reintentar creación' : 'Crear Período'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      </>}
    </div>
  )
}
