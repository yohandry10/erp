'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { History, Loader2, RotateCcw, X } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'

type Movimiento = {
  id: string
  tipo: string
  monto: number
  movimiento_caja_id?: string | null
  movimiento_bancario_id?: string | null
  reversa_de_movimiento_id?: string | null
  created_at: string
  metadata?: { motivo?: string } | null
}

type SaldoDetalle = {
  id: string
  moneda: string
  monto_original: number
  monto_disponible: number
  movimientos: Movimiento[]
  clientes?: { razon_social?: string; nombre?: string }
  rma?: { numero?: string }
}

type SesionCaja = {
  id: string
  moneda: string
  cajas?: { codigo?: string; nombre?: string }
}

type Props = {
  saldoId: string
  onClose: () => void
  onUpdated: () => void | Promise<void>
}

const unwrap = <T,>(response: any, fallback: T): T =>
  (response && typeof response === 'object' && 'data' in response ? response.data : response) ?? fallback

const newKey = (movementId: string) => {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `rma-ui:revertir-reembolso:${movementId}:${suffix}`
}

export function SaldoFavorMovimientosModal({ saldoId, onClose, onUpdated }: Props) {
  const { get, post } = useApi({ throwOnError: true })
  const { formatCurrency } = useLocalizedMoney()
  const { toast } = useToast()
  const keys = useRef<Record<string, string>>({})
  const [saldo, setSaldo] = useState<SaldoDetalle | null>(null)
  const [sesiones, setSesiones] = useState<SesionCaja[]>([])
  const [sesionByMovement, setSesionByMovement] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('Reversa de reembolso solicitada por el cliente')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const detailResponse = await get(`/api/ventas/rma/saldos-favor/${saldoId}`)
      setSaldo(unwrap<SaldoDetalle | null>(detailResponse, null))
      try {
        const mediaResponse = await get('/api/ventas/rma/medios-reembolso')
        const media = unwrap<{ sesiones_caja?: SesionCaja[] }>(mediaResponse, {})
        setSesiones(media.sesiones_caja ?? [])
      } catch {
        // El historial sigue disponible; sólo la reversa por caja queda sin opciones.
        setSesiones([])
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el historial', description: error?.message ?? 'Error inesperado' })
    } finally {
      setLoading(false)
    }
  }, [get, saldoId, toast])

  useEffect(() => { void load() }, [load])

  const revertir = async (movimiento: Movimiento) => {
    const cash = movimiento.tipo === 'REEMBOLSO_CAJA'
    const sesionId = sesionByMovement[movimiento.id]
    if (cash && !sesionId) {
      toast({ variant: 'destructive', title: 'Selecciona una sesión propia abierta', description: 'La reposición de caja debe ingresar a una sesión explícita de la misma moneda.' })
      return
    }
    keys.current[movimiento.id] ??= newKey(movimiento.id)
    setSaving(movimiento.id)
    try {
      await post(
        `/api/ventas/rma/saldos-favor/${saldoId}/reembolsos/${movimiento.id}/revertir`,
        {
          motivo: motivo.trim(),
          ...(cash ? { sesion_caja_id: sesionId } : {}),
        },
        { headers: { 'Idempotency-Key': keys.current[movimiento.id] } },
      )
      toast({ title: 'Reembolso revertido', description: 'El saldo a favor y la tesorería fueron repuestos con asiento inverso trazable.' })
      await load()
      await onUpdated()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo revertir el reembolso', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(null)
    }
  }

  const movements = [...(saldo?.movimientos ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const reversed = new Set(movements.filter((item) => item.tipo === 'REVERSA').map((item) => item.reversa_de_movimiento_id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label="Historial de saldo a favor" data-testid="credit-balance-history-dialog">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background/95 p-5 backdrop-blur">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Tesorería y saldo a favor</p><h2 className="mt-1 text-xl font-black">Historial de movimientos</h2>{saldo && <p className="mt-1 text-sm text-muted-foreground">{saldo.clientes?.razon_social ?? saldo.clientes?.nombre ?? 'Cliente'} · {saldo.rma?.numero ?? 'RMA'}</p>}</div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={Boolean(saving)} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Cargando trazabilidad…</div>
        ) : !saldo ? (
          <div className="p-10 text-center text-muted-foreground">No se pudo recuperar el saldo.</div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2"><Summary label="Saldo original" value={formatCurrency(Number(saldo.monto_original), saldo.moneda)} /><Summary label="Disponible actual" value={formatCurrency(Number(saldo.monto_disponible), saldo.moneda)} /></div>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Motivo para la reversa</span><Input value={motivo} minLength={3} maxLength={500} onChange={(event) => setMotivo(event.target.value)} /></label>
            <section className="space-y-3">
              {movements.map((movimiento) => {
                const refundable = ['REEMBOLSO_CAJA', 'REEMBOLSO_BANCO'].includes(movimiento.tipo)
                const canReverse = refundable && !reversed.has(movimiento.id)
                const cash = movimiento.tipo === 'REEMBOLSO_CAJA'
                return (
                  <article key={movimiento.id} className="rounded-xl border border-border p-4" data-testid={`credit-balance-movement-${movimiento.id}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div><p className="font-bold">{movementLabel(movimiento.tipo)}</p><p className="mt-1 text-lg font-black">{formatCurrency(Number(movimiento.monto), saldo.moneda)}</p><p className="text-xs text-muted-foreground">{new Date(movimiento.created_at).toLocaleString('es-PE')} · {movimiento.id.slice(0, 8)}</p>{reversed.has(movimiento.id) && <p className="mt-2 text-xs font-bold text-emerald-600">Reembolso revertido</p>}</div>
                      {canReverse && <div className="w-full space-y-2 sm:max-w-xs">{cash ? <select aria-label="Sesión de caja para la reversión" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={sesionByMovement[movimiento.id] ?? ''} onChange={(event) => setSesionByMovement((current) => ({ ...current, [movimiento.id]: event.target.value }))}><option value="">Sesión propia de caja…</option>{sesiones.filter((session) => session.moneda === saldo.moneda).map((session) => <option key={session.id} value={session.id}>{session.cajas?.nombre ?? session.cajas?.codigo ?? 'Caja'} · {session.moneda}</option>)}</select> : <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Se repone la misma cuenta bancaria del egreso original.</p>}<Button className="w-full" variant="destructive" onClick={() => void revertir(movimiento)} disabled={saving === movimiento.id || motivo.trim().length < 3}><RotateCcw className="mr-2 h-4 w-4" /> {saving === movimiento.id ? 'Revirtiendo…' : 'Revertir reembolso'}</Button></div>}
                    </div>
                  </article>
                )
              })}
              {movements.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground"><History className="mx-auto mb-2 h-5 w-5" /> Este saldo aún no tiene movimientos.</div>}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/35 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>
}

function movementLabel(type: string) {
  const labels: Record<string, string> = {
    ORIGEN_NC: 'Origen por nota de crédito',
    APLICACION_CXC: 'Aplicación a cuenta por cobrar',
    REEMBOLSO_CAJA: 'Reembolso por caja',
    REEMBOLSO_BANCO: 'Reembolso por banco',
    REVERSA: 'Reversa de reembolso',
  }
  return labels[type] ?? type.replaceAll('_', ' ')
}
