'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { usePermission } from '@/hooks/use-permission'
import { readPeriodDetail, type PeriodSnapshot } from '@/lib/accounting-period-read'
import { parseDateLocal } from '@/lib/date-utils'
import { useRouter, useParams } from 'next/navigation'
import { Calendar, Lock, Unlock, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react'
import PeriodTransitionRecovery from '@/components/contabilidad/PeriodTransitionRecovery'
import { usePeriodTransitionOperations } from '@/hooks/use-period-transition-operation'
import PeriodoCierreWizard from '@/components/contabilidad/PeriodoCierreWizard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { useCountryContext } from '@/hooks/use-country-context'

type Periodo = PeriodSnapshot

export default function PeriodoDetailPage() {
  const { session } = useAuth()
  const params = useParams()
  return <PeriodoDetailWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}:${String(params.id || '')}`} />
}

function PeriodoDetailWorkspace() {
  const router = useRouter()
  const country = useCountryContext()
  const { user, session, loading: authLoading } = useAuth()
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || ''
  const scopeReady = !authLoading && !!tenantId && !!actorId
  const reopenPermission = usePermission('contabilidad', 'reabrir', 'periodos')
  const closePermission = usePermission('contabilidad', 'cerrar', 'periodos')
  const validatePermission = usePermission('contabilidad', 'validar', 'periodos')
  const canReopen = scopeReady && user?.is_super_admin === true && !reopenPermission.loading && reopenPermission.hasPermission
  const canClose = scopeReady && !closePermission.loading && closePermission.hasPermission && !validatePermission.loading && validatePermission.hasPermission
  const params = useParams()
  const periodoId = params.id as string | undefined
  const scopeIdentity = `${tenantId}:${actorId}:${periodoId || ''}`
  const activeScope = useRef(scopeIdentity); activeScope.current = scopeIdentity
  const readEpoch = useRef(0)

  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [reopening, setReopening] = useState(false)
  const transition = usePeriodTransitionOperations()
  const hasPendingTransition = !transition.ready || !!transition.recoveryError || transition.pending.some(row => row.intent.snapshot.id === periodoId)
  const writeEpoch = useRef(0)
  useEffect(() => () => { writeEpoch.current++ }, [])
  const { apiCall: readApi } = useApi<unknown>({ requireLive: true, throwOnError: true, retries: 0, timeoutMs: 30000, showErrorToast: false })

  // Estado para diálogo de confirmación
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  })

  const fetchPeriodo = useCallback(async () => {
    const run = ++readEpoch.current
    const current = () => run === readEpoch.current && activeScope.current === scopeIdentity
    setLoading(true); setError(null); setPeriodo(null); setShowWizard(false)
    setConfirmDialog(dialog => ({ ...dialog, isOpen: false }))
    if (!scopeReady) return
    try {
      if (!periodoId) throw new Error('Período no identificado')
      const result = await readApi(`/contabilidad/periodos/${periodoId}`)
      const row = readPeriodDetail(result, tenantId, periodoId)
      if (current()) setPeriodo(row)
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : 'Error al cargar el período contable')
    } finally {
      if (current()) setLoading(false)
    }
  }, [readApi, periodoId, tenantId, scopeReady, scopeIdentity])

  const formatPeriodo = (anio: number, mes: number) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `${meses[mes - 1]} ${anio}`
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'ABIERTO':
        return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' }
      case 'CERRADO':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
      case 'BLOQUEADO':
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
    }
  }

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'ABIERTO':
        return <Unlock size={20} />
      case 'CERRADO':
        return <Lock size={20} />
      case 'BLOQUEADO':
        return <AlertCircle size={20} />
      default:
        return <Calendar size={20} />
    }
  }

  const handleReabrirPeriodo = async () => {
    if (!canReopen || loading || error || reopening || periodo?.estado !== 'CERRADO' || !transition.ready || transition.recoveryError || transition.pending.some(row => row.intent.snapshot.id === periodoId)) return
    const run = ++writeEpoch.current, requestedScope = scopeIdentity
    const current = () => run === writeEpoch.current && activeScope.current === requestedScope
    setReopening(true)
    try {
      const confirmed = await transition.perform(periodo, 'REOPEN')
      if (current() && confirmed) await fetchPeriodo()
    } finally {
      if (current()) {
        setReopening(false)
        setConfirmDialog(previous => ({ ...previous, isOpen: false }))
      }
    }
  }

  useEffect(() => {
    void fetchPeriodo()
    return () => { readEpoch.current += 1 }
  }, [fetchPeriodo])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex items-center justify-center p-12 bg-card rounded-xl">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full" />
            <p className="text-muted-foreground">Cargando período...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!periodo) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="p-8 bg-[#fee2e2] border rounded-xl text-destructive">
          {transition.error && <p role="alert" className="mb-4 text-destructive">{transition.error}</p>}
      <PeriodTransitionRecovery onConfirmed={() => { void fetchPeriodo() }} />
          <p role="alert" className="m-0 font-semibold">⚠️ {error || 'Período no encontrado'}</p>
          <button onClick={fetchPeriodo} className="mt-4 mr-3 py-2 px-4 bg-blue-600 text-white rounded-[6px]">Reintentar</button>
          <button
            onClick={() => router.push('/dashboard/contabilidad/periodos')} className="mt-4 py-2 px-4 bg-red-600 text-white border-0 rounded-[6px] cursor-pointer font-semibold"
          >
            Volver a Períodos
          </button>
        </div>
      </div>
    )
  }

  const estadoColor = getEstadoColor(periodo.estado)

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.push('/dashboard/contabilidad/periodos')} className="inline-flex items-center gap-2 py-2 px-4 bg-transparent text-muted-foreground border-0 rounded-lg cursor-pointer font-semibold text-[0.875rem] mb-4 transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)'
              e.currentTarget.style.color = '#334155'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#64748b'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Períodos
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Período Contable</h1>
          <p className="mt-2 text-base text-muted-foreground">
            {formatPeriodo(periodo.anio, periodo.mes)}
          </p>
        </div>
        <div className="flex gap-4">
          {periodo.estado === 'ABIERTO' && canClose && !error && !hasPendingTransition && (
            <button
              onClick={() => setShowWizard(true)} className="flex items-center gap-2 py-3 px-6 text-white border-0 rounded-lg cursor-pointer font-semibold text-[0.875rem] transition shadow"
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            >
              <Lock size={20} />
              Cerrar Período
            </button>
          )}
          {periodo.estado === 'CERRADO' && canReopen && !error && transition.ready && !transition.recoveryError && !transition.pending.some(row => row.intent.snapshot.id === periodoId) && (
            <button
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Reabrir Período',
                  message: '¿Está seguro de reabrir este período contable?\n\nEsto permitirá realizar nuevos movimientos contables.',
                  variant: 'warning',
                  onConfirm: handleReabrirPeriodo
                })
              }}
              disabled={reopening} className="flex items-center gap-2 py-3 px-6 text-white border-0 rounded-lg font-semibold text-[0.875rem] transition shadow"
              onMouseEnter={(e) => {
                if (!reopening) {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            >
              <Unlock size={20} />
              {reopening ? 'Reabriendo...' : 'Reabrir Período (Superadmin)'}
            </button>
          )}
        </div>
      </div>

      {/* Period Info Card */}
      {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-foreground">{error}</div>}
      <div className="bg-card rounded-xl shadow overflow-hidden mb-8">
        <div className="p-8 border-b">
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-8">
            {/* Estado */}
            <div>
              <p className="mt-0 mr-0 mb-2 ml-0 text-xs font-bold text-muted-foreground">
                Estado
              </p>
              <div className="inline-flex items-center gap-2 py-2 px-4 rounded-lg text-[0.875rem] font-semibold">
                {getEstadoIcon(periodo.estado)}
                {hasPendingTransition ? 'Pendiente de confirmar' : periodo.estado}
              </div>
            </div>

            {/* Año */}
            <div>
              <p className="mt-0 mr-0 mb-2 ml-0 text-xs font-bold text-muted-foreground">
                Año
              </p>
              <p className="m-0 text-2xl font-bold text-foreground">
                {periodo.anio}
              </p>
            </div>

            {/* Mes */}
            <div>
              <p className="mt-0 mr-0 mb-2 ml-0 text-xs font-bold text-muted-foreground">
                Mes
              </p>
              <p className="m-0 text-2xl font-bold text-foreground">
                {String(periodo.mes).padStart(2, '0')}
              </p>
            </div>

            {/* Fecha de Cierre */}
            {periodo.fecha_cierre && (
              <div>
                <p className="mt-0 mr-0 mb-2 ml-0 text-xs font-bold text-muted-foreground">
                  Fecha de Cierre
                </p>
                <p className="m-0 text-base font-semibold text-foreground">
                  {parseDateLocal(periodo.fecha_cierre).toLocaleDateString(country.locale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Additional Info */}
        <div className="py-6 px-8 bg-muted">
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-6">
            <div>
              <p className="mt-0 mr-0 mb-1 ml-0 text-xs font-semibold text-muted-foreground">
                ID del Período
              </p>
              <p className="m-0 text-[0.875rem] font-medium text-foreground">
                {periodo.id}
              </p>
            </div>

            <div>
              <p className="mt-0 mr-0 mb-1 ml-0 text-xs font-semibold text-muted-foreground">
                Fecha de Creación
              </p>
              <p className="m-0 text-[0.875rem] font-medium text-foreground">
                {parseDateLocal(periodo.created_at).toLocaleDateString(country.locale, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            </div>

            {periodo.cerrado_por && (
              <div>
                <p className="mt-0 mr-0 mb-1 ml-0 text-xs font-semibold text-muted-foreground">
                  Cerrado Por
                </p>
                <p className="m-0 text-[0.875rem] font-medium text-foreground">
                  {periodo.cerrado_por}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="p-6 rounded-xl">
        <div className="flex items-start gap-3">
          {periodo.estado === 'ABIERTO' ? (
            <CheckCircle size={24} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <Lock size={24} className="text-primary shrink-0 mt-0.5" />
          )}
          <div>
            <h4 className="mt-0 mr-0 mb-2 ml-0 text-base font-semibold">
              {periodo.estado === 'ABIERTO'
                ? 'Período Abierto'
                : periodo.estado === 'CERRADO'
                ? 'Período Cerrado'
                : 'Período Bloqueado'
              }
            </h4>
            <p className="m-0 text-[0.875rem] leading-7">
              {periodo.estado === 'ABIERTO'
                ? 'Este período está abierto y permite el registro de nuevos asientos contables. Puedes cerrarlo cuando hayas terminado todas las operaciones del mes.'
                : periodo.estado === 'CERRADO'
                ? 'Este período está cerrado y no permite el registro de nuevos asientos contables. Solo un superadministrador puede reabrirlo.'
                : 'Este período está bloqueado y no permite ninguna modificación.'
              }
            </p>
          </div>
        </div>
      </div>

      {transition.error && <p role="alert" className="mb-4 text-destructive">{transition.error}</p>}
      <PeriodTransitionRecovery onConfirmed={() => { void fetchPeriodo() }} />

      {hasPendingTransition && <p role="status" className="mb-6 rounded-xl border border-border bg-card p-4 text-sm">La transición está pendiente de confirmar. La información mostrada corresponde a la última lectura; verifica el resultado antes de realizar otra operación.</p>}

      {/* Wizard Modal */}
      {showWizard && canClose && !error && (
        <PeriodoCierreWizard
          periodo={periodo}
          periodoId={periodo.id}
          anio={periodo.anio}
          mes={periodo.mes}
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            setShowWizard(false)
            fetchPeriodo()
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />
    </div>
  )
}

