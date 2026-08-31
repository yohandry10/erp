'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Undo2, X } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'

type Cobro = {
  id: string
  monto: number
  moneda: string
  fecha_pago?: string
  metodo_pago?: string
  referencia?: string
  cuenta_bancaria_id?: string
  estado?: string
  activo?: boolean
  reversa?: { id: string; medio: string; motivo?: string; created_at?: string } | null
}

type SesionCaja = {
  id: string
  moneda: string
  cajas?: { codigo?: string; nombre?: string }
}

type EstadoAnulacion = {
  cpe: { id: string; serie?: string; numero: number; moneda: string; estado: string; tipo_documento?: string }
  nota_credito?: { id: string; serie?: string; numero: number; estado: string; estado_sunat?: string; cdr_sunat?: string } | null
  cxc?: { id: string; numero_documento?: string; estado: string; monto_pendiente?: number; saldo_pendiente?: number; saldo?: number } | null
  cobros: Cobro[]
  ajustes_financieros: Array<{
    id: string
    tipo: string
    monto: number
    moneda: string
    referencia?: string
    estado?: string
    activo?: boolean
    operacion_fiscal?: { id: string; tipo: string; estado: string } | null
  }>
  ajustes_activos: EstadoAnulacion['ajustes_financieros']
  sesiones_caja: SesionCaja[]
  nota_aceptada: boolean
  cobros_activos: number
  estado_flujo: 'ANULADO' | 'REQUIERE_NOTA_CREDITO' | 'PENDIENTE_CDR' | 'REQUIERE_REEMBOLSOS' | 'BLOQUEADO_AJUSTE_REQUIERE_REVERSA' | 'LISTO_PARA_FINALIZAR'
}

type Props = {
  cpeId: string
  label: string
  onClose: () => void
  onCompleted: () => void | Promise<void>
}

const unwrap = <T,>(response: any): T =>
  (response && typeof response === 'object' && 'data' in response ? response.data : response) as T

const newKey = (kind: string) => {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `cpe-ui:${kind}:${suffix}`
}

const isCash = (cobro: Cobro) =>
  ['EFECTIVO', 'CAJA', 'CASH'].includes(String(cobro.metodo_pago ?? '').toUpperCase())

export function AnulacionFinancieraModal({ cpeId, label, onClose, onCompleted }: Props) {
  const country = useCountryContext()
  const { get, post } = useApi({ throwOnError: true })
  const { toast } = useToast()
  const requestKey = useRef(newKey('solicitar-anulacion'))
  const finalKey = useRef(newKey('finalizar-anulacion'))
  const reversalKeys = useRef<Record<string, string>>({})
  const [state, setState] = useState<EstadoAnulacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('Anulación solicitada por el cliente')
  const [sesiones, setSesiones] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get(`/api/cpe/${cpeId}/anulacion-financiera`)
      setState(unwrap<EstadoAnulacion>(response))
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cargar la anulación',
        description: error?.message ?? 'Error inesperado',
      })
    } finally {
      setLoading(false)
    }
  }, [cpeId, get, toast])

  useEffect(() => { void load() }, [load])

  const solicitar = async () => {
    if (motivo.trim().length < 3) return
    setSaving('solicitud')
    try {
      await post(
        `/api/cpe/${cpeId}/anular`,
        { motivo: motivo.trim(), tipo_nota: '01' },
        { headers: { 'Idempotency-Key': requestKey.current } },
      )
      toast({ title: 'Nota de crédito creada', description: 'Envíala a la autoridad fiscal y vuelve a verificar su CDR.' })
      await load()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo solicitar la anulación', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(null)
    }
  }

  const revertirCobro = async (cobro: Cobro) => {
    const sesionId = sesiones[cobro.id]
    if (isCash(cobro) && !sesionId) {
      toast({ variant: 'destructive', title: 'Selecciona una sesión de caja', description: 'El reintegro en efectivo debe salir de una sesión propia abierta y de la misma moneda.' })
      return
    }
    const key = reversalKeys.current[cobro.id] ?? newKey(`revertir-cobro:${cobro.id}`)
    reversalKeys.current[cobro.id] = key
    setSaving(cobro.id)
    try {
      await post(
        `/api/cpe/${cpeId}/cobros/${cobro.id}/revertir`,
        {
          motivo: motivo.trim(),
          ...(isCash(cobro) ? { sesion_caja_id: sesionId } : {}),
        },
        { headers: { 'Idempotency-Key': key } },
      )
      toast({ title: 'Cobro revertido', description: 'Tesorería y CxC quedaron compensadas; el cierre continúa de forma atómica.' })
      await load()
      await onCompleted()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo revertir el cobro', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(null)
    }
  }

  const revertirAjuste = async (operacionId: string) => {
    const keySlot = `ajuste:${operacionId}`
    const key = reversalKeys.current[keySlot] ?? newKey(`revertir-ajuste:${operacionId}`)
    reversalKeys.current[keySlot] = key
    setSaving(keySlot)
    try {
      await post(
        `/api/cpe/${cpeId}/ajustes/${operacionId}/revertir`,
        { motivo: motivo.trim() },
        { headers: { 'Idempotency-Key': key } },
      )
      toast({ title: 'Ajuste revertido', description: 'La CxC y el asiento fiscal fueron compensados sin mover caja ni banco.' })
      await load()
      await onCompleted()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo revertir el ajuste', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(null)
    }
  }

  const finalizar = async () => {
    if (!state?.nota_credito?.id) return
    setSaving('finalizar')
    try {
      await post(
        `/api/cpe/${state.nota_credito.id}/anulacion/finalizar`,
        undefined,
        { headers: { 'Idempotency-Key': finalKey.current } },
      )
      toast({ title: 'Anulación finalizada', description: 'El comprobante, la CxC y los eventos contables quedaron cerrados.' })
      await load()
      await onCompleted()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo finalizar', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(null)
    }
  }

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
          <Button variant="ghost" size="icon" onClick={onClose} disabled={Boolean(saving)} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Verificando trazabilidad financiera…</div>
        ) : !state ? (
          <div className="p-8 text-center"><p className="text-muted-foreground">No se pudo recuperar el estado financiero.</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" /> Reintentar</Button></div>
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
              <label className="block"><span className="mb-1.5 block text-sm font-semibold">Motivo operativo</span><Input value={motivo} minLength={3} maxLength={500} onChange={(event) => setMotivo(event.target.value)} /></label>
            )}

            {state.estado_flujo === 'REQUIERE_NOTA_CREDITO' && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <h3 className="font-bold">1. Emitir nota de crédito</h3>
                <p className="mt-1 text-sm text-muted-foreground">Se crea la nota; ninguna devolución se ejecuta hasta que la autoridad fiscal acepte el CDR.</p>
                <Button className="mt-4" onClick={() => void solicitar()} disabled={saving === 'solicitud' || motivo.trim().length < 3}>{saving === 'solicitud' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Solicitar anulación</Button>
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
                          disabled={saving === `ajuste:${ajuste.operacion_fiscal.id}` || motivo.trim().length < 3}
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
                <div className="flex items-center justify-between"><div><h3 className="font-bold">2. Devolver cobros aplicados</h3><p className="text-sm text-muted-foreground">Cada reversa conserva banco/caja original, CxC, asiento, outbox e idempotencia.</p></div><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" /> Verificar estado</Button></div>
                {state.cobros.map((cobro) => {
                  const active = activePayments.some((item) => item.id === cobro.id)
                  return (
                    <div key={cobro.id} className="rounded-xl border border-border p-4" data-testid={`cpe-payment-${cobro.id}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><p className="font-bold">{cobro.moneda} {Number(cobro.monto).toFixed(2)} · {cobro.metodo_pago ?? 'Medio no informado'}</p><p className="text-xs text-muted-foreground">{cobro.referencia || cobro.id}</p>{cobro.reversa && <p className="mt-2 text-xs font-semibold text-emerald-600">Revertido · {cobro.reversa.medio}</p>}</div>
                        {active && state.nota_aceptada && <div className="w-full space-y-2 sm:max-w-xs">{isCash(cobro) && <select aria-label="Sesión de caja para la devolución" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={sesiones[cobro.id] ?? ''} onChange={(event) => setSesiones((current) => ({ ...current, [cobro.id]: event.target.value }))}><option value="">Sesión propia de caja…</option>{state.sesiones_caja.filter((sesion) => sesion.moneda === cobro.moneda).map((sesion) => <option key={sesion.id} value={sesion.id}>{sesion.cajas?.nombre ?? sesion.cajas?.codigo ?? 'Caja'} · {sesion.moneda}</option>)}</select>}<Button className="w-full" variant="destructive" onClick={() => void revertirCobro(cobro)} disabled={saving === cobro.id}><Undo2 className="mr-2 h-4 w-4" /> {saving === cobro.id ? 'Devolviendo…' : 'Devolver y revertir'}</Button></div>}
                      </div>
                    </div>
                  )
                })}
              </section>
            )}

            {state.estado_flujo === 'LISTO_PARA_FINALIZAR' && (
              <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"><h3 className="font-bold">3. Finalizar anulación</h3><p className="mt-1 text-sm text-muted-foreground">No quedan cobros activos y la nota tiene CDR aceptado.</p><Button className="mt-4" onClick={() => void finalizar()} disabled={saving === 'finalizar'}>{saving === 'finalizar' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Finalizar ahora</Button></section>
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
