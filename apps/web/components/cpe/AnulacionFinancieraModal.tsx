'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Undo2, X } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'
import { cpeFinancial, type Cobro } from '@/lib/cpe-read-contract'
import { useCpeRead } from '@/hooks/use-cpe-read'
import { useAuth } from '@/contexts/AuthContext'
import { customAuth } from '@/lib/auth-service'
import { cancellationEndpoint, cancellationConfirmation, readCancellationIntent, type CancellationIntent, type CancellationAction } from '@/lib/cpe-cancellation-contract'

type Props = {
  cpeId: string
  label: string
  onClose: () => void
  onCompleted: () => void | Promise<void>
}

const isCash = (cobro: Cobro) =>
  ['EFECTIVO', 'CAJA', 'CASH'].includes(String(cobro.metodo_pago ?? '').toUpperCase())

export function AnulacionFinancieraModal(props: Props) {
  const { session } = useAuth()
  const actor = `${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`
  if (!session?.user?.tenant_id || !session.user.id) return null
  return <CancellationDialog key={`${actor}:${props.cpeId}`} {...props} actor={actor} />
}

function CancellationDialog({ cpeId, label, onClose, onCompleted, actor }: Props & { actor: string }) {
  const country = useCountryContext()
  const { post } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { toast } = useToast()
  const validate = useCallback((response: any) => cpeFinancial(response, cpeId), [cpeId])
  const { data: state, loading, error, reload: load } = useCpeRead(`/api/cpe/${cpeId}/anulacion-financiera`, validate)
  const scope = `erp.cpe-cancellation-intent.${actor.replace(':', '.')}.${cpeId}`
  const activeScope = useRef(scope)
  const writing = useRef(false)
  const [intentReady, setIntentReady] = useState('')
  const [pending, setPending] = useState<CancellationIntent | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('Anulación solicitada por el cliente')
  const [sesiones, setSesiones] = useState<Record<string, string>>({})
  useEffect(() => {
    activeScope.current = scope
    try {
      const intent = readCancellationIntent(localStorage.getItem(scope), cpeId)
      setPending(intent)
      if (intent?.payload) setMotivo(intent.payload.motivo)
      if (intent?.payload?.sesion_caja_id) setSesiones({ [intent.targetId]: intent.payload.sesion_caja_id })
      setIntentReady(scope)
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No se pudo recuperar el intento de anulación.') }
    return () => { activeScope.current = '' }
  }, [scope, cpeId])
  const locked = Boolean(saving || pending) || intentReady !== scope

  const run = async (intent: CancellationIntent) => {
    if (!state || loading || error || writing.current || intentReady !== scope) return
    writing.current = true
    const current = scope
    const slot = intent.action === 'solicitar' ? 'solicitud' : intent.action === 'finalizar' ? 'finalizar' : intent.action === 'ajuste' ? `ajuste:${intent.targetId}` : intent.targetId
    setSaving(slot); setActionError(null); setActionMessage(null)
    try {
      const before = await customAuth.getRequestSession()
      if (activeScope.current !== current || `${before.session?.user?.tenant_id || ''}:${before.session?.user?.id || ''}` !== actor) return
      localStorage.setItem(scope, JSON.stringify(intent)); setPending(intent)
      const confirmed = cancellationConfirmation(await post(cancellationEndpoint(intent), intent.payload, { headers: { 'Idempotency-Key': intent.key } }), intent, state)
      const canonical = await customAuth.getRequestSession()
      if (activeScope.current !== current || `${canonical.session?.user?.tenant_id || ''}:${canonical.session?.user?.id || ''}` !== actor) return
      localStorage.removeItem(scope); setPending(null)
      const message = intent.action === 'solicitar'
        ? `Solicitud confirmada. Nota ${confirmed.nota_credito.serie}-${confirmed.nota_credito.numero} · ${confirmed.nota_credito.estado}.`
        : intent.action === 'finalizar' ? 'Anulación final confirmada.' : 'Reversa financiera confirmada.'
      setActionMessage(message); toast({ title: message })
      await load()
      if (activeScope.current === current) await onCompleted()
    } catch (cause) {
      if (activeScope.current === current) setActionError(`${cause instanceof Error ? cause.message : 'No se pudo confirmar la operación.'} El intento se conserva; reintente con la misma clave y los mismos datos.`)
    } finally {
      writing.current = false
      if (activeScope.current === current) setSaving(null)
    }
  }
  const start = (action: CancellationAction, targetId: string, payload?: CancellationIntent['payload']) => {
    if (locked || !state || loading || error) return
    const intent: CancellationIntent = { cpeId, targetId, action, key: `cpe-ui:${action}:${crypto.randomUUID()}`, ...(payload ? { payload } : {}) }
    void run(intent)
  }
  const solicitar = () => start('solicitar', cpeId, { motivo: motivo.trim(), tipo_nota: '01' })
  const revertirCobro = (cobro: Cobro) => {
    const sesionId = sesiones[cobro.id]
    if (isCash(cobro) && !sesionId) {
      setActionError('Selecciona una sesión propia abierta de la misma moneda para devolver el efectivo.'); return
    }
    start('cobro', cobro.id, { motivo: motivo.trim(), ...(isCash(cobro) ? { sesion_caja_id: sesionId } : {}) })
  }
  const revertirAjuste = (operacionId: string) => start('ajuste', operacionId, { motivo: motivo.trim() })
  const finalizar = () => { if (state?.nota_credito?.id) start('finalizar', state.nota_credito.id) }

  const activePayments = state?.cobros.filter((cobro) => cobro.activo !== false && String(cobro.estado ?? 'ACTIVO').toUpperCase() === 'ACTIVO' && !cobro.reversa) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label={`Anulación financiera de ${label}`} data-testid="cpe-cancellation-dialog">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background/95 p-5 backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Reembolso y reversa explícitos</p>
            <h2 className="mt-1 text-xl font-black">Anular {label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">La factura sólo se cierra después del CDR y de devolver cada cobro aplicado.</p>
          </div>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || Boolean(saving)}><RefreshCw className="mr-2 h-4 w-4" /> Verificar estado</Button><Button variant="ghost" size="icon" onClick={onClose} disabled={Boolean(saving)} aria-label="Cerrar"><X className="h-4 w-4" /></Button></div>
        </header>
        {actionError && <div className="mx-5 mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm" role="alert" data-testid="cpe-cancellation-action-error">{actionError}</div>}
        {actionMessage && <div className="mx-5 mt-4 rounded-xl border border-emerald-500/30 p-4 text-sm" role="status" data-testid="cpe-cancellation-action-confirmed">{actionMessage}</div>}
        {pending && <div className="mx-5 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm" data-testid="cpe-cancellation-pending-intent">
          <p>Hay una operación pendiente de confirmación. Se conservan la misma clave y los mismos datos al reintentar.</p>
          <Button className="mt-3" variant="outline" onClick={() => void run(pending)} disabled={Boolean(saving) || loading || !state || Boolean(error)}>Reintentar operación</Button>
        </div>}


        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Verificando trazabilidad financiera…</div>
        ) : !state ? (
          <div className="p-8 text-center" role="alert" data-testid="cpe-financial-error"><p className="text-muted-foreground">{error || 'No se pudo recuperar el estado financiero.'}</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" /> Reintentar</Button></div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Estado" value={state.estado_flujo.replaceAll('_', ' ')} />
              <Summary
                label="Nota de crédito"
                value={state.nota_credito
                  ? `${formatFiscalDocumentNumber(country.paisCodigo, state.nota_credito.serie, state.nota_credito.numero)} · ${state.nota_credito.estado}`
                  : 'Pendiente'}
              />
              <Summary label="Cobros por devolver" value={String(state.cobros_activos)} />
            </div>

            {state.estado_flujo === 'ANULADO' ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mr-2 inline h-5 w-5" /> Flujo finalizado: CPE y CxC anulados con reversas trazables.</div>
            ) : (
              <label className="block"><span className="mb-1.5 block text-sm font-semibold">Motivo operativo</span><Input value={motivo} disabled={locked} minLength={3} maxLength={500} onChange={(event) => setMotivo(event.target.value)} /></label>
            )}

            {state.estado_flujo === 'REQUIERE_NOTA_CREDITO' && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <h3 className="font-bold">1. Emitir nota de crédito</h3>
                <p className="mt-1 text-sm text-muted-foreground">Se crea la nota; ninguna devolución se ejecuta hasta que la autoridad fiscal acepte el CDR.</p>
                <Button className="mt-4" onClick={() => void solicitar()} disabled={locked || motivo.trim().length < 3}>{saving === 'solicitud' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Solicitar anulación</Button>
              </section>
            )}

            {state.estado_flujo === 'PENDIENTE_CDR' && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><AlertTriangle className="mr-2 inline h-5 w-5 text-amber-600" /> La nota aún no tiene CDR aceptado. Envíala desde CPE y usa “Verificar estado” cuando responda la autoridad fiscal.</div>
            )}

            {state.ajustes_activos?.length > 0 && (
              <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4" data-testid="cpe-active-adjustments-blocker">
                <h3 className="font-bold text-red-700 dark:text-red-300">Ajustes financieros pendientes de reversa</h3>
                <p className="mt-1 text-sm text-muted-foreground">No son cobros de caja/banco y no se anulan silenciosamente. Debe revertirse cada operación fiscal antes del cierre.</p>
                <div className="mt-3 space-y-2">
                  {state.ajustes_activos.map((ajuste) => (
                    <div key={ajuste.id} className="rounded-lg border border-red-500/20 bg-background/70 p-3 text-sm">
                      <p className="font-semibold">{ajuste.tipo} · {ajuste.moneda} {Number(ajuste.monto).toFixed(2)}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">Movimiento: {ajuste.id}</p>
                      <p className="font-mono text-xs text-muted-foreground">Operación fiscal: {ajuste.operacion_fiscal?.id ?? 'sin vínculo durable; requiere saneamiento'}</p>
                      {ajuste.operacion_fiscal?.id && state.nota_aceptada && (
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="destructive"
                          onClick={() => void revertirAjuste(ajuste.operacion_fiscal!.id)}
                          disabled={locked || motivo.trim().length < 3}
                        >
                          <Undo2 className="mr-2 h-4 w-4" />
                          {saving === `ajuste:${ajuste.operacion_fiscal.id}` ? 'Revirtiendo…' : `Revertir ${ajuste.tipo}`}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {state.cobros.length > 0 && (
              <section className="space-y-3">
                <div><h3 className="font-bold">2. Devolver cobros aplicados</h3><p className="text-sm text-muted-foreground">Cada reversa conserva banco/caja original, CxC, asiento, outbox e idempotencia.</p></div>
                {state.cobros.map((cobro) => {
                  const active = activePayments.some((item) => item.id === cobro.id)
                  return (
                    <div key={cobro.id} className="rounded-xl border border-border p-4" data-testid={`cpe-payment-${cobro.id}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><p className="font-bold">{cobro.moneda} {Number(cobro.monto).toFixed(2)} · {cobro.metodo_pago ?? 'Medio no informado'}</p><p className="text-xs text-muted-foreground">{cobro.referencia || cobro.id}</p>{cobro.reversa && <p className="mt-2 text-xs font-semibold text-emerald-600">Revertido · {cobro.reversa.medio}</p>}</div>
                        {active && state.nota_aceptada && <div className="w-full space-y-2 sm:max-w-xs">{isCash(cobro) && <select aria-label="Sesión de caja para la devolución" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={sesiones[cobro.id] ?? ''} disabled={locked} onChange={(event) => setSesiones((current) => ({ ...current, [cobro.id]: event.target.value }))}><option value="">Sesión propia de caja…</option>{state.sesiones_caja.filter((sesion) => sesion.moneda === cobro.moneda).map((sesion) => <option key={sesion.id} value={sesion.id}>{sesion.cajas?.nombre ?? sesion.cajas?.codigo ?? 'Caja'} · {sesion.moneda}</option>)}</select>}<Button className="w-full" variant="destructive" onClick={() => void revertirCobro(cobro)} disabled={locked || motivo.trim().length < 3}><Undo2 className="mr-2 h-4 w-4" /> {saving === cobro.id ? 'Devolviendo…' : 'Devolver y revertir'}</Button></div>}
                      </div>
                    </div>
                  )
                })}
              </section>
            )}

            {state.estado_flujo === 'LISTO_PARA_FINALIZAR' && (
              <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"><h3 className="font-bold">3. Finalizar anulación</h3><p className="mt-1 text-sm text-muted-foreground">No quedan cobros activos y la nota tiene CDR aceptado.</p><Button className="mt-4" onClick={() => void finalizar()} disabled={locked}>{saving === 'finalizar' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Finalizar ahora</Button></section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/35 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}
