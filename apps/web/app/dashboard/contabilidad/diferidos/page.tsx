'use client'

import { requestConfirmation } from '@/lib/confirm-action'
import { useState, useCallback, useEffect, useRef } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { AlertCircle, CalendarRange, Loader2, Plus, RefreshCw, Save, X, XCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { readDeferredRegister, readDeferredAccounts } from '@/lib/contabilidad/deferred-read-contract'
import { readAssetCostCenters } from '@/lib/contabilidad/assets-read-contract'
import { deferredCreateIntentKey, buildDeferredCreatePayload, newDeferredCreateIntent, readDeferredCreateIntent, confirmDeferredCreated, type DeferredCreateIntent } from '@/lib/contabilidad/deferred-create-operation'
import { deferredCancelIntentKey, newDeferredCancelIntent, readDeferredCancelIntent, readDeferredCancelCandidate, confirmDeferredCancelled, type DeferredCancelIntent } from '@/lib/contabilidad/deferred-cancel-operation'
import { deferredAccrueIntentKey, deferredAccruePeriod, readDeferredAccrueCandidates, newDeferredAccrueIntent, readDeferredAccrueIntent, deferredAccrueExpectation, readDeferredAccrueSummary, readDeferredAccrueJournal, confirmDeferredAccrueRegister, deferredAccrueRecoveredResult, type DeferredAccrueIntent, type DeferredAccrueResult } from '@/lib/contabilidad/deferred-accrue-operation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Diferido {
  id: string
  codigo?: string
  nombre: string
  tipo: 'GASTO' | 'INGRESO'
  monto_total: number
  monto_devengado: number
  monto_pendiente: number
  periodos: number
  fecha_inicio: string
  estado: 'VIGENTE' | 'DEVENGADO' | 'CANCELADO'
}


interface Cuenta {
  id: string
  codigo: string
  nombre: string
}

interface CentroCosto {
  id: string
  codigo?: string
  nombre: string
}

const hoy = new Date().toISOString().slice(0, 10)
const diferidoInicial = {
  codigo: '',
  nombre: '',
  descripcion: '',
  tipo: 'GASTO' as 'GASTO' | 'INGRESO',
  cuenta_diferido_id: '',
  cuenta_resultado_id: '',
  monto_total: '',
  periodos: '12',
  fecha_inicio: hoy,
  centro_costo_id: '',
}

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function DiferidosPage() {
  const { session } = useAuth()
  return <DiferidosWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />
}

function DiferidosWorkspace() {
  const { session } = useAuth()
  const tenantId = session?.user?.tenant_id || ''
  const actorId = session?.user?.id || ''
  const createPermission = usePermission('contabilidad', 'crear', 'diferidos')
  const accruePermission = usePermission('contabilidad', 'devengar', 'diferidos')
  const cancelPermission = usePermission('contabilidad', 'cancelar', 'diferidos')
  const canCreate = createPermission.hasPermission && !createPermission.loading
  const scopeIdentity = `${tenantId}:${actorId}`
  const activeScope = useRef(scopeIdentity); activeScope.current = scopeIdentity
  const writeEpoch = useRef(0)
  const writeInFlight = useRef(false)
  const createAllowed = useRef(false); createAllowed.current = canCreate
  const storedRaw = useRef<string | null>(null)
  const [createIntent, setCreateIntent] = useState<DeferredCreateIntent | null>(null)
  const [intentReady, setIntentReady] = useState('')
  const [recoveryBlocked, setRecoveryBlocked] = useState(false)
  const canAccrue = accruePermission.hasPermission && !accruePermission.loading
  const canCancel = cancelPermission.hasPermission && !cancelPermission.loading
  const cancelAllowed = useRef(false); cancelAllowed.current = canCancel
  const cancelRaw = useRef<string | null>(null)
  const [cancelIntent, setCancelIntent] = useState<DeferredCancelIntent | null>(null)
  const [cancelReady, setCancelReady] = useState('')
  const [cancelBlocked, setCancelBlocked] = useState(false)
  const accrueAllowed = useRef(false); accrueAllowed.current = canAccrue
  const accrueRaw = useRef<string | null>(null)
  const [accrueIntent, setAccrueIntent] = useState<DeferredAccrueIntent | null>(null)
  const [accrueReady, setAccrueReady] = useState('')
  const [accrueBlocked, setAccrueBlocked] = useState(false)

  const { get, post, del } = useApi({ requireLive: true, retries: 0, throwOnError: true, showErrorToast: false })
  const latestRead = useRef(0)

  const [loadError, setLoadError] = useState<string | null>(null)

  const [diferidos, setDiferidos] = useState<Diferido[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [devengando, setDevengando] = useState(false)
  const [resultado, setResultado] = useState<DeferredAccrueResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [form, setForm] = useState(diferidoInicial)

  const ahora = new Date()
  const [anio, setAnio] = useState(ahora.getFullYear())
  const [mes, setMes] = useState(ahora.getMonth() + 1)

  const cargar = useCallback(async () => {
    if (!tenantId || !actorId) return
    const read = ++latestRead.current
    try {
      setLoading(true)
      setLoadError(null)
      const [response, cuentasResponse, centrosResponse] = await Promise.all([
        get('/api/contabilidad/diferidos'),
        get('/api/contabilidad/plan-cuentas'),
        get('/api/contabilidad/centros-costo'),
      ])
      const currentDeferred = readDeferredRegister(response, tenantId)
      const currentAccounts = readDeferredAccounts(cuentasResponse, tenantId)
      const currentCenters = readAssetCostCenters(centrosResponse, tenantId)
      if (read !== latestRead.current) return
      setDiferidos(currentDeferred)
      setCuentas(currentAccounts)
      setCentrosCosto(currentCenters)
    } catch (err: any) {
      if (read === latestRead.current) {
        setDiferidos([]); setCuentas([]); setCentrosCosto([])
        setLoadError('No se pudo cargar el registro de diferidos, cuentas y centros de costo. Reintente la consulta.')
      }
    } finally {
      if (read === latestRead.current) setLoading(false)
    }
  }, [get, tenantId, actorId])

  useEffect(() => {
    cargar()
    return () => { latestRead.current += 1 }
  }, [cargar])

  useEffect(() => {
    writeEpoch.current += 1; writeInFlight.current = false; storedRaw.current = null
    setCreateIntent(null); setIntentReady(''); setRecoveryBlocked(false)
    if (!tenantId || !actorId) return
    try {
      const raw = window.localStorage.getItem(deferredCreateIntentKey({ tenantId, actorId }))
      if (raw) { const intent = readDeferredCreateIntent(raw, { tenantId, actorId }); storedRaw.current = raw; setCreateIntent(intent) }
    } catch (err) { setRecoveryBlocked(true); setError(err instanceof Error ? err.message : 'No se pudo recuperar el alta pendiente. Se conserva sin reemplazarla.') }
    setIntentReady(scopeIdentity)
    return () => { writeEpoch.current += 1 }
  }, [tenantId, actorId, scopeIdentity])

  useEffect(() => {
    cancelRaw.current = null; setCancelIntent(null); setCancelReady(''); setCancelBlocked(false)
    if (!tenantId || !actorId) return
    try {
      const raw = window.localStorage.getItem(deferredCancelIntentKey({ tenantId, actorId }))
      if (raw) { const intent = readDeferredCancelIntent(raw, { tenantId, actorId }); cancelRaw.current = raw; setCancelIntent(intent) }
    } catch (err) { setCancelBlocked(true); setError(err instanceof Error ? err.message : 'No se pudo recuperar la cancelación pendiente. Se conserva sin reemplazarla.') }
    setCancelReady(scopeIdentity)
  }, [tenantId, actorId, scopeIdentity])
  const visibleCancelIntent = cancelReady === scopeIdentity && cancelIntent?.tenantId === tenantId && cancelIntent?.actorId === actorId ? cancelIntent : null

  useEffect(() => {
    let mounted = true
    accrueRaw.current = null; setAccrueIntent(null); setAccrueReady(''); setAccrueBlocked(false)
    if (!tenantId || !actorId) return
    const recover = async () => {
      try {
        const raw = window.localStorage.getItem(deferredAccrueIntentKey({ tenantId, actorId }))
        if (raw) {
          const intent = await readDeferredAccrueIntent(raw, { tenantId, actorId })
          if (!mounted || activeScope.current !== scopeIdentity) return
          const period = deferredAccruePeriod(intent.body)
          accrueRaw.current = raw; setAccrueIntent(intent); setAnio(period.anio); setMes(period.mes)
        }
      } catch (err) { if (mounted) { setAccrueBlocked(true); setError(err instanceof Error ? err.message : 'No se pudo recuperar el devengo pendiente. Se conserva sin reemplazarlo.') } }
      if (mounted) setAccrueReady(scopeIdentity)
    }
    void recover()
    return () => { mounted = false }
  }, [tenantId, actorId, scopeIdentity])
  const visibleAccrueIntent = accrueReady === scopeIdentity && accrueIntent?.tenantId === tenantId && accrueIntent?.actorId === actorId ? accrueIntent : null
  const accrueExpected = visibleAccrueIntent ? deferredAccrueExpectation(visibleAccrueIntent) : null

  const executeCreate = async () => {
    if (!canCreate || loading || loadError || guardando || devengando || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity || intentReady !== scopeIdentity || cancelReady !== scopeIdentity || writeInFlight.current || visibleCancelIntent && !createIntent) return
    const run = writeEpoch.current
    const current = () => run === writeEpoch.current && activeScope.current === scopeIdentity && createAllowed.current
    const scope = { tenantId, actorId }
    const key = deferredCreateIntentKey(scope)
    writeInFlight.current = true; setGuardando(true); setError(null); setAviso(null)
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== storedRaw.current) throw new Error('El alta pendiente cambió en otra ventana. Se conserva; recargue para revisarla.')
      let intent = raw ? readDeferredCreateIntent(raw, scope) : null
      const payload = intent ? JSON.parse(intent.body) : buildDeferredCreatePayload(form)
      if (!intent) {
        if (window.localStorage.getItem(deferredCancelIntentKey(scope)) || window.localStorage.getItem(deferredAccrueIntentKey(scope))) throw new Error('Existe una cancelación pendiente. Recargue para revisarla antes de registrar otro diferido.')
        const [accountsResponse, centersResponse] = await Promise.all([get('/api/contabilidad/plan-cuentas'), get('/api/contabilidad/centros-costo')])
        const accounts = readDeferredAccounts(accountsResponse, tenantId)
        const centers = readAssetCostCenters(centersResponse, tenantId)
        const balance = accounts.find(a => a.id === payload.cuenta_diferido_id)
        const result = accounts.find(a => a.id === payload.cuenta_resultado_id)
        const center = payload.centro_costo_id ? centers.find(c => c.id === payload.centro_costo_id) : null
        if (!balance?.acepta_movimiento || !result?.acepta_movimiento || payload.centro_costo_id && !center) throw new Error('Se necesitan cuentas vigentes de movimiento y un centro autorizado. Revise la consulta antes de reintentar.')
        if (!current()) return
        intent = newDeferredCreateIntent(payload, scope, { balance: { id: balance.id, code: balance.codigo, name: balance.nombre }, result: { id: result.id, code: result.codigo, name: result.nombre }, center: center ? { id: center.id, code: center.codigo || '', name: center.nombre } : null })
        if (window.localStorage.getItem(key) !== null) throw new Error('Otra ventana guardó un alta pendiente. Se conserva sin reemplazarla.')
        const nextRaw = JSON.stringify(intent); readDeferredCreateIntent(nextRaw, scope)
        window.localStorage.setItem(key, nextRaw)
        if (window.localStorage.getItem(key) !== nextRaw) throw new Error('No se pudo guardar y verificar el alta pendiente. No se envió otra operación.')
        storedRaw.current = nextRaw; setCreateIntent(intent)
      }
      if (window.localStorage.getItem(key) !== storedRaw.current) throw new Error('El alta pendiente cambió en otra ventana. Se conserva sin reemplazarla.')
      if (!current()) return
      const response = await post('/api/contabilidad/diferidos', JSON.parse(intent.body), { headers: { 'Idempotency-Key': intent.idempotencyKey } })
      if (!current()) return
      const created = confirmDeferredCreated(response, intent)
      if (window.localStorage.getItem(key) !== storedRaw.current) throw new Error('El alta pendiente cambió en otra ventana. Se conserva sin retirarla.')
      window.localStorage.removeItem(key)
      if (window.localStorage.getItem(key) !== null) throw new Error('El registro se confirmó, pero no se pudo retirar el alta pendiente. Reintente para confirmar su recuperación.')
      storedRaw.current = null; setCreateIntent(null); setForm(diferidoInicial); setMostrarAlta(false)
      setAviso(`Diferido "${created.nombre}" registrado y listo para devengar.`)
      await cargar()
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : 'No se pudo confirmar el alta. Se conserva para reintentar.') }
    finally { if (current()) { writeInFlight.current = false; setGuardando(false) } }
  }
  const crearDiferido = async (event: React.FormEvent) => { event.preventDefault(); await executeCreate() }
  const visibleIntent = intentReady === scopeIdentity && createIntent?.tenantId === tenantId && createIntent?.actorId === actorId ? createIntent : null
  const visiblePayload = visibleIntent ? JSON.parse(visibleIntent.body) : null
  const confirmationState = useRef({ revision: 0, signature: '' })
  const confirmationSignature = JSON.stringify([scopeIdentity, anio, mes, canAccrue, canCancel, loading, loadError, visibleIntent, visibleCancelIntent, visibleAccrueIntent, recoveryBlocked, cancelBlocked, accrueBlocked, accrueReady, intentReady, cancelReady, diferidos])
  if (confirmationState.current.signature !== confirmationSignature) confirmationState.current = { revision: confirmationState.current.revision + 1, signature: confirmationSignature }


  const devengar = async () => {
    if (!canAccrue || devengando || guardando || loading || loadError || visibleIntent || visibleCancelIntent || recoveryBlocked || cancelBlocked || accrueBlocked || accrueReady !== scopeIdentity || intentReady !== scopeIdentity || cancelReady !== scopeIdentity || writeInFlight.current) return
    const run = writeEpoch.current
    const confirmationRun = confirmationState.current.revision
    const confirmationCurrent = () => confirmationRun === confirmationState.current.revision && run === writeEpoch.current && activeScope.current === scopeIdentity && accrueAllowed.current && !writeInFlight.current
    if (!visibleAccrueIntent && !(await requestConfirmation(`Se devengará la cuota de todos los diferidos vigentes del período ${anio}-${String(mes).padStart(2, '0')}. ¿Continuar?`, confirmationCurrent))) return
    if (!confirmationCurrent()) return
    const current = () => run === writeEpoch.current && activeScope.current === scopeIdentity && accrueAllowed.current
    const scope = { tenantId, actorId }; const key = deferredAccrueIntentKey(scope)
    writeInFlight.current = true; setDevengando(true); setError(null); setAviso(null); setResultado(null)
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== accrueRaw.current) throw new Error('El devengo pendiente cambió en otra ventana. Se conserva; recargue para revisarlo.')
      let intent = raw ? await readDeferredAccrueIntent(raw, scope) : null
      const readJournal = async (command: DeferredAccrueIntent) => {
        const { periodo } = deferredAccruePeriod(command.body)
        return readDeferredAccrueJournal(await get(`/api/contabilidad/asientos-contables?referencia=DIF-${periodo}&page=1&limit=5000`), command)
      }
      let journal: Record<string, any> | null
      if (!intent) {
        if (window.localStorage.getItem(deferredCreateIntentKey(scope)) || window.localStorage.getItem(deferredCancelIntentKey(scope))) throw new Error('Existe otra operación pendiente. Recargue para revisarla antes de devengar.')
        const rows = readDeferredAccrueCandidates(await get('/api/contabilidad/diferidos'), scope, diferidos)
        intent = await newDeferredAccrueIntent(anio, mes, rows, scope)
        journal = await readJournal(intent)
        if (journal) throw new Error('El devengo de este período ya está registrado. Revise el asiento antes de iniciar otra operación.')
        if (!current()) return
        if (window.localStorage.getItem(key) !== null) throw new Error('Otra ventana guardó un devengo pendiente. Se conserva sin reemplazarlo.')
        const nextRaw = JSON.stringify(intent); await readDeferredAccrueIntent(nextRaw, scope)
        if (!current()) return
        window.localStorage.setItem(key, nextRaw)
        if (window.localStorage.getItem(key) !== nextRaw) throw new Error('No se pudo guardar y verificar el devengo pendiente. No se envió otra operación.')
        accrueRaw.current = nextRaw; setAccrueIntent(intent); setMostrarAlta(false)
      } else { journal = await readJournal(intent) }
      if (!current()) return
      if (window.localStorage.getItem(key) !== accrueRaw.current) throw new Error('El devengo pendiente cambió en otra ventana. Se conserva sin reemplazarlo.')
      if (!journal) {
        readDeferredAccrueCandidates(await get('/api/contabilidad/diferidos'), scope, intent.rows)
        if (!current()) return
        if (window.localStorage.getItem(key) !== accrueRaw.current) throw new Error('El devengo pendiente cambió en otra ventana. Se conserva sin reemplazarlo.')
        const response = await post('/api/contabilidad/diferidos/devengar', JSON.parse(intent.body))
        if (!current()) return
        readDeferredAccrueSummary(response, intent)
        journal = await readJournal(intent)
        if (!current()) return
      }
      confirmDeferredAccrueRegister(await get('/api/contabilidad/diferidos'), intent)
      const confirmed = deferredAccrueRecoveredResult(intent, journal)
      if (!current()) return
      if (window.localStorage.getItem(key) !== accrueRaw.current) throw new Error('El devengo pendiente cambió en otra ventana. Se conserva sin retirarlo.')
      window.localStorage.removeItem(key)
      if (window.localStorage.getItem(key) !== null) throw new Error('El devengo se confirmó, pero no se pudo retirar la intención. Reintente su recuperación.')
      accrueRaw.current = null; setAccrueIntent(null); setResultado(confirmed)
      await cargar()
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : 'No se pudo confirmar el devengo. Se conserva para verificar el resultado.') }
    finally { if (current()) { writeInFlight.current = false; setDevengando(false) } }
  }

  const cancelar = async (diferido?: Diferido) => {
    if (!canCancel || guardando || devengando || loading || loadError || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity || cancelReady !== scopeIdentity || intentReady !== scopeIdentity || writeInFlight.current || visibleIntent && !visibleCancelIntent) return
    const run = writeEpoch.current
    const confirmationRun = confirmationState.current.revision
    const confirmationCurrent = () => confirmationRun === confirmationState.current.revision && run === writeEpoch.current && activeScope.current === scopeIdentity && cancelAllowed.current && !writeInFlight.current
    if (!visibleCancelIntent && (!diferido || !(await requestConfirmation(`¿Cancelar "${diferido.nombre}"? Dejará de devengar; lo ya devengado permanece en los libros.`, confirmationCurrent)))) return
    if (!confirmationCurrent()) return
    const current = () => run === writeEpoch.current && activeScope.current === scopeIdentity && cancelAllowed.current
    const scope = { tenantId, actorId }; const key = deferredCancelIntentKey(scope)
    writeInFlight.current = true; setGuardando(true); setError(null); setAviso(null)
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== cancelRaw.current) throw new Error('La cancelación pendiente cambió en otra ventana. Se conserva; recargue para revisarla.')
      let intent = raw ? readDeferredCancelIntent(raw, scope) : null
      if (!intent) {
        if (!diferido || window.localStorage.getItem(deferredCreateIntentKey(scope)) || window.localStorage.getItem(deferredAccrueIntentKey(scope))) throw new Error('Existe un alta pendiente. Recargue para revisarla antes de cancelar.')
        const response = await get(`/api/contabilidad/diferidos/${diferido.id}`)
        const candidate = readDeferredCancelCandidate(response, scope, diferido.id, diferido)
        if (!current()) return
        intent = newDeferredCancelIntent(candidate, scope)
        if (window.localStorage.getItem(key) !== null) throw new Error('Otra ventana guardó una cancelación pendiente. Se conserva sin reemplazarla.')
        const nextRaw = JSON.stringify(intent); readDeferredCancelIntent(nextRaw, scope)
        window.localStorage.setItem(key, nextRaw)
        if (window.localStorage.getItem(key) !== nextRaw) throw new Error('No se pudo guardar y verificar la cancelación pendiente. No se envió otra operación.')
        cancelRaw.current = nextRaw; setCancelIntent(intent); setMostrarAlta(false)
      }
      if (window.localStorage.getItem(key) !== cancelRaw.current) throw new Error('La cancelación pendiente cambió en otra ventana. Se conserva sin reemplazarla.')
      if (!current()) return
      const response = await del(`/api/contabilidad/diferidos/${intent.snapshot.id}`, { headers: { 'Idempotency-Key': intent.idempotencyKey } })
      if (!current()) return
      const cancelled = confirmDeferredCancelled(response, intent)
      if (window.localStorage.getItem(key) !== cancelRaw.current) throw new Error('La cancelación pendiente cambió en otra ventana. Se conserva sin retirarla.')
      window.localStorage.removeItem(key)
      if (window.localStorage.getItem(key) !== null) throw new Error('La cancelación se confirmó, pero no se pudo retirar la intención. Reintente su recuperación.')
      cancelRaw.current = null; setCancelIntent(null)
      setAviso(`Diferido "${cancelled.nombre}" cancelado. Los devengos registrados permanecen en los libros.`)
      await cargar()
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : 'No se pudo confirmar la cancelación. Se conserva para reintentar.') }
    finally { if (current()) { writeInFlight.current = false; setGuardando(false) } }
  }

  const money = (valor: number) =>
    new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      valor || 0
    )

  const formatFecha = (fecha: string) =>
    parseDateLocal(String(fecha).slice(0, 10))?.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) ?? fecha

  const totales = diferidos.reduce(
    (acc, d) => ({
      total: acc.total + Number(d.monto_total || 0),
      devengado: acc.devengado + Number(d.monto_devengado || 0),
      pendiente: acc.pendiente + Number(d.monto_pendiente || 0),
    }),
    { total: 0, devengado: 0, pendiente: 0 }
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <CalendarRange className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Ingresos y gastos diferidos
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Un seguro anual o un alquiler cobrado por adelantado se reparten mes a mes. El
                  devengo del período genera un solo asiento con una línea por diferido.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={cargar}
              disabled={loading}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
            {canCreate && !visibleIntent && !visibleCancelIntent && !visibleAccrueIntent && <Button type="button" onClick={() => setMostrarAlta((actual) => !actual)} disabled={loading || !!loadError || guardando || devengando || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity || cancelReady !== scopeIdentity || intentReady !== scopeIdentity} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              {mostrarAlta ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {mostrarAlta ? 'Cerrar alta' : 'Registrar diferido'}
            </Button>}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4">
            <div>
              <label htmlFor="diferidos-ano" className={labelClass}>Año</label>
              <input id="diferidos-ano"
                type="number"
                disabled={devengando || !!visibleAccrueIntent || accrueBlocked}
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="mt-2 w-28 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <div>
              <label htmlFor="diferidos-mes" className={labelClass}>Mes</label>
              <input id="diferidos-mes"
                type="number"
                min={1}
                max={12}
                disabled={devengando || !!visibleAccrueIntent || accrueBlocked}
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="mt-2 w-24 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            {canAccrue && !visibleAccrueIntent && <Button
              type="button"
              onClick={devengar}
              disabled={devengando || loading || !!loadError || guardando || !!visibleIntent || !!visibleCancelIntent || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {devengando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarRange className="h-4 w-4" />
              )}
              Devengar período
            </Button>}
            <p className="text-xs text-muted-foreground">
              El período genera un único asiento. Una confirmación pendiente se verifica antes de reintentar.
            </p>
          </div>
        </section>

        {canCreate && visibleIntent && visiblePayload && <section data-testid="deferred-create-pending" className="rounded-xl border border-amber-400/40 bg-card p-4">
          <h2 className="font-semibold">Alta pendiente de confirmación</h2>
          <p className="mt-2">{visiblePayload.codigo ? `${visiblePayload.codigo} · ` : ''}{visiblePayload.nombre}</p>
          <p>{visiblePayload.tipo === 'GASTO' ? 'Gasto' : 'Ingreso'} · {money(visiblePayload.monto_total)} · {visiblePayload.periodos} períodos desde {visiblePayload.fecha_inicio}</p>
          <p>Balance: {visibleIntent.context.balance.code} — {visibleIntent.context.balance.name}</p>
          <p>Resultados: {visibleIntent.context.result.code} — {visibleIntent.context.result.name}</p>
          {visibleIntent.context.center && <p>Centro: {visibleIntent.context.center.name}</p>}
          {visiblePayload.descripcion && <p>{visiblePayload.descripcion}</p>}
          <Button className="mt-3" onClick={() => void executeCreate()} disabled={guardando || loading || !!loadError || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity}>Reintentar alta pendiente</Button>
        </section>}

        {canCancel && visibleCancelIntent && <section data-testid="deferred-cancel-pending" className="rounded-xl border border-amber-400/40 bg-card p-4">
          <h2 className="font-semibold">Cancelación pendiente de confirmación</h2>
          <p className="mt-2">{visibleCancelIntent.snapshot.codigo ? `${visibleCancelIntent.snapshot.codigo} · ` : ''}{visibleCancelIntent.snapshot.nombre}</p>
          <p>Total {money(visibleCancelIntent.snapshot.monto_total)} · Devengado {money(visibleCancelIntent.snapshot.monto_devengado)} · Pendiente {money(visibleCancelIntent.snapshot.monto_pendiente)}</p>
          <p>{visibleCancelIntent.snapshot.periodos} períodos desde {visibleCancelIntent.snapshot.fecha_inicio}. Lo ya devengado permanece en los libros.</p>
          <Button className="mt-3" onClick={() => void cancelar()} disabled={guardando || loading || !!loadError || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity}>Reintentar cancelación pendiente</Button>
        </section>}

        {canAccrue && visibleAccrueIntent && accrueExpected && <section data-testid="deferred-accrue-pending" className="rounded-xl border border-amber-400/40 bg-card p-4">
          <h2 className="font-semibold">Devengo pendiente de confirmación</h2>
          <p className="mt-2">Período {accrueExpected.periodo} · {accrueExpected.items.length} diferidos · Total {money(accrueExpected.total)}</p>
          {accrueExpected.items.map(({ row, amount }) => <p key={row.id}>{row.codigo ? `${row.codigo} · ` : ''}{row.nombre} · Cuota {money(amount)}</p>)}
          <p className="mt-2 text-sm">Se consultará el asiento y el registro actual antes de enviar el mismo período.</p>
          <Button className="mt-3" onClick={() => void devengar()} disabled={devengando || guardando || loading || !!loadError || recoveryBlocked || cancelBlocked || accrueBlocked}>Verificar devengo pendiente</Button>
        </section>}

        {loadError && <div role="alert" className="rounded-xl border border-cyan-400/20 bg-card p-4"><p>{loadError}</p><Button type="button" variant="outline" onClick={cargar} disabled={loading} className="mt-3">Reintentar</Button></div>}

        {canCreate && !visibleIntent && !visibleCancelIntent && !visibleAccrueIntent && mostrarAlta && !loading && !loadError && !recoveryBlocked && !cancelBlocked && !accrueBlocked && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4"><CardTitle className="text-base">Nuevo ingreso o gasto diferido</CardTitle></CardHeader>
            <CardContent className="p-5">
              <form onSubmit={crearDiferido} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Código<input aria-label="Código del diferido" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Nombre<input aria-label="Nombre del diferido" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Tipo<select aria-label="Tipo de diferido" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as 'GASTO' | 'INGRESO' })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="GASTO">Gasto pagado por adelantado</option><option value="INGRESO">Ingreso cobrado por adelantado</option></select></label>
                <label className={labelClass}>Primer período<input aria-label="Primer período del diferido" type="date" required value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Importe total<input aria-label="Importe total del diferido" type="number" min="0.01" step="0.01" required value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Períodos mensuales<input aria-label="Períodos del diferido" type="number" min="1" step="1" required value={form.periodos} onChange={(e) => setForm({ ...form, periodos: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <label className={labelClass}>Cuenta de balance<select aria-label="Cuenta de balance del diferido" required value={form.cuenta_diferido_id} onChange={(e) => setForm({ ...form, cuenta_diferido_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Seleccione…</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} — {cuenta.nombre}</option>)}</select></label>
                <label className={labelClass}>Cuenta de resultados<select aria-label="Cuenta de resultados del diferido" required value={form.cuenta_resultado_id} onChange={(e) => setForm({ ...form, cuenta_resultado_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Seleccione…</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.codigo} — {cuenta.nombre}</option>)}</select></label>
                <label className={labelClass}>Centro de costo<select aria-label="Centro de costo del diferido" value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal"><option value="">Sin centro</option>{centrosCosto.map((centro) => <option key={centro.id} value={centro.id}>{centro.codigo ? `${centro.codigo} — ` : ''}{centro.nombre}</option>)}</select></label>
                <label className={`${labelClass} md:col-span-2`}>Descripción<input aria-label="Descripción del diferido" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm normal-case tracking-normal" /></label>
                <div className="flex items-end"><Button type="submit" disabled={guardando || devengando || loading || !!loadError || !!visibleIntent || !!visibleCancelIntent || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity} className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500">{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar diferido</Button></div>
              </form>
              <p className="mt-4 text-xs text-muted-foreground">Para gastos use normalmente una cuenta de balance 18 y una cuenta de resultados 6; para ingresos, una cuenta de pasivo 49 y una cuenta 7. El sistema exige que ambas sean distintas.</p>
            </CardContent>
          </Card>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        {aviso && <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-300">{aviso}</div>}

        {resultado && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="text-base text-foreground">
                Devengo del período {resultado.periodo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-foreground/90">
                {resultado.diferidos_devengados} diferido(s) por un total de{' '}
                <span className="font-bold">{money(resultado.total_devengado)}</span>.
              </p>
              {resultado.asiento_id && <p className="text-sm"><a className="underline" href={`/dashboard/contabilidad/asientos/${resultado.asiento_id}/`}>Consultar asiento {resultado.numero_asiento}</a></p>}
              {resultado.omitidos && resultado.omitidos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                    Omitidos ({resultado.omitidos.length})
                  </p>
                  {resultado.omitidos.map((omitido) => (
                    <div
                      key={omitido.diferido_id}
                      className="rounded-xl border border-cyan-400/15 bg-card/70 p-3 text-sm"
                    >
                      <span className="font-semibold text-primary/80">
                        {omitido.nombre || omitido.diferido_id}
                      </span>
                      <p className="mt-1 text-foreground/90">{omitido.motivo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && <section className="grid gap-3 md:grid-cols-3">
          {[
            ['Total diferido', totales.total],
            ['Devengado', totales.devengado],
            ['Pendiente de devengar', totales.pendiente],
          ].map(([label, valor]: any) => (
            <div key={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                {label}
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{money(valor)}</div>
            </div>
          ))}
        </section>}

        <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Diferidos registrados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando diferidos...</span>
              </div>
            ) : loadError ? null : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <th className="px-4 py-3">Diferido</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Inicio</th>
                      <th className="px-4 py-3 text-right">Períodos</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Devengado</th>
                      <th className="px-4 py-3 text-right">Pendiente</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {diferidos.length > 0 ? (
                      diferidos.map((diferido) => (
                        <tr
                          key={diferido.id}
                          className="border-b border-cyan-400/10 text-sm text-foreground/90"
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{diferido.nombre}</div>
                            {diferido.codigo && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {diferido.codigo}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{diferido.tipo}</td>
                          <td className="px-4 py-3">{formatFecha(diferido.fecha_inicio)}</td>
                          <td className="px-4 py-3 text-right">{diferido.periodos}</td>
                          <td className="px-4 py-3 text-right">{money(diferido.monto_total)}</td>
                          <td className="px-4 py-3 text-right">{money(diferido.monto_devengado)}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary">
                            {money(diferido.monto_pendiente)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                              {diferido.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canCancel && diferido.estado === 'VIGENTE' && (
                              <Button
                                type="button"
                                onClick={() => cancelar(diferido)}
                                aria-label={`Cancelar diferido ${diferido.codigo || diferido.nombre}`}
                                disabled={guardando || devengando || loading || !!loadError || !!visibleIntent || !!visibleCancelIntent || recoveryBlocked || cancelBlocked || accrueBlocked || !!visibleAccrueIntent || accrueReady !== scopeIdentity || cancelReady !== scopeIdentity || intentReady !== scopeIdentity}
                                variant="outline"
                                className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Todavía no hay diferidos registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
