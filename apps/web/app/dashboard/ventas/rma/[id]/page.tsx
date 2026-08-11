'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  BadgeDollarSign,
  Boxes,
  CheckCircle2,
  FileCheck2,
  History,
  RotateCcw,
  ShieldAlert,
  Truck,
  XCircle,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuth } from '@/contexts/AuthContext'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type RmaItem = {
  id: string
  producto_id: string
  cantidad_autorizada: number
  cantidad_devuelta: number
  motivo_item?: string
  estado: string
  metadata?: { es_servicio?: boolean; controla_stock?: boolean; classification_snapshot?: string }
  productos?: { codigo?: string; nombre?: string; es_servicio?: boolean; controla_stock?: boolean }
  detalle?: { descripcion?: string }
  documento_detalle?: { orden?: number; descripcion?: string; total_item?: number }
}
type Rma = {
  id: string
  numero: string
  estado: string
  motivo_general?: string
  created_by?: string
  aprobado_por?: string
  aprobado_en?: string
  recibido_por?: string
  recibido_en?: string
  pedido_id?: string
  documento_origen_id?: string
  cpe_origen_id?: string
  cxc_origen_id?: string
  nota_credito_documento_id?: string
  nota_credito_cpe_id?: string
  almacen_retorno_id?: string
  created_at: string
  items: RmaItem[]
  eventos: Array<{ id: string; tipo: string; descripcion: string; usuario_id?: string; created_at: string; metadata?: any }>
  saldo_favor?: { id: string; moneda: string; monto_original: number; monto_disponible: number; estado: string } | null
}
type Recursos = {
  control_calidad_requerido: boolean
  almacenes: Array<{ id: string; codigo?: string; nombre?: string; es_principal?: boolean }>
  ubicaciones: Array<{ id: string; almacen_id: string; codigo?: string; nombre?: string; estado?: string }>
}

const unwrap = <T,>(response: any, fallback: T): T =>
  (response && 'data' in response ? response.data : response) ?? fallback
const key = (kind: string) => `rma-ui:${kind}:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`

const steps = [
  { state: 'CREADA', label: 'Solicitud' },
  { state: 'APROBADA', label: 'Decisión' },
  { state: 'RECIBIDA', label: 'Recepción' },
  { state: 'CERRADA', label: 'Nota de crédito' },
]
const stateRank: Record<string, number> = { CREADA: 0, APROBADA: 1, PARCIAL: 2, RECIBIDA: 2, CERRADA: 3, RECHAZADA: 1 }
const isServiceItem = (item: RmaItem) =>
  item.metadata?.classification_snapshot === 'SERVICIO' ||
  item.metadata?.es_servicio === true ||
  (item.metadata?.es_servicio == null && Boolean(item.productos?.es_servicio))
const controlsStock = (item: RmaItem) =>
  item.metadata?.controla_stock ?? item.productos?.controla_stock ?? true
const isPhysicalItem = (item: RmaItem) => !isServiceItem(item) && controlsStock(item)

export default function RmaDetailPage() {
  const params = useParams<{ id: string }>()
  const id = String(params.id)
  const { get, post } = useApi({ throwOnError: true })
  const { session } = useAuth()
  const { formatCurrency } = useLocalizedMoney()
  const { toast } = useToast()
  const [rma, setRma] = useState<Rma | null>(null)
  const [recursos, setRecursos] = useState<Recursos>({ control_calidad_requerido: false, almacenes: [], ubicaciones: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [location, setLocation] = useState('')
  const [receipt, setReceipt] = useState<Record<string, string>>({})
  const [reverseReason, setReverseReason] = useState('Corrección de recepción')
  const [creditReason, setCreditReason] = useState('Devolución por ítems')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await get(`/api/ventas/rma/${id}`)
      const value = unwrap<Rma | null>(response, null)
      setRma(value)
      if (value) {
        setWarehouse((current) => current || value.almacen_retorno_id || '')
        setReceipt(Object.fromEntries((value.items ?? []).map((item) => [item.id, ''])))
      }
    } finally {
      setLoading(false)
    }
  }, [get, id])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!rma || !['APROBADA', 'PARCIAL', 'RECIBIDA'].includes(rma.estado)) return
    void (async () => {
      const response = await get('/api/ventas/rma/recursos-recepcion')
      const value = unwrap<Recursos>(response, { control_calidad_requerido: false, almacenes: [], ubicaciones: [] })
      setRecursos(value)
      setWarehouse((current) => current || value.almacenes.find((item) => item.es_principal)?.id || '')
    })()
  }, [get, rma?.estado])

  const currentActor = session?.user?.id
  const isCreator = Boolean(currentActor && rma?.created_by === currentActor)
  const filteredLocations = recursos.ubicaciones.filter((item) => item.almacen_id === warehouse)
  const eventTimeline = useMemo(() => [...(rma?.eventos ?? [])].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)), [rma?.eventos])

  const run = async (kind: string, endpoint: string, payload: any, success: string) => {
    setSaving(true)
    try {
      await post(endpoint, payload, { headers: { 'Idempotency-Key': key(kind) } })
      toast({ title: success, description: 'La operación quedó registrada con trazabilidad durable.' })
      await load()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Operación rechazada', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(false)
    }
  }

  const receive = async () => {
    if (!rma) return
    const items = rma.items.flatMap((item) => {
      const amount = Number(receipt[item.id])
      return Number.isFinite(amount) && amount > 0
        ? [{ rma_item_id: item.id, cantidad_recibida: amount }]
        : []
    })
    if (items.length === 0) {
      toast({ variant: 'destructive', title: 'Sin cantidades', description: 'Ingresa al menos una cantidad a recibir.' })
      return
    }
    const hasPhysical = rma.items.some((item) => {
      const amount = Number(receipt[item.id])
      return amount > 0 && isPhysicalItem(item)
    })
    if (hasPhysical && !warehouse) {
      toast({ variant: 'destructive', title: 'Almacén requerido', description: 'Los productos con stock necesitan un almacén de retorno.' })
      return
    }
    if (hasPhysical && recursos.control_calidad_requerido && !location) {
      toast({ variant: 'destructive', title: 'Ubicación requerida', description: 'El control de calidad exige una ubicación dentro del almacén.' })
      return
    }
    await run('receive', `/api/ventas/rma/${rma.id}/recepcionar`, {
      ...(warehouse ? { almacen_id: warehouse } : {}),
      ...(location ? { ubicacion_id: location } : {}),
      items,
    }, 'Recepción registrada')
  }

  if (loading) return <div className="p-12 text-center text-muted-foreground">Cargando flujo RMA…</div>
  if (!rma) return <div className="p-12 text-center"><p className="font-semibold">RMA no encontrada</p><Button asChild variant="link"><Link href="/dashboard/ventas/rma">Volver</Link></Button></div>

  const rank = stateRank[rma.estado] ?? 0
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-6">
      <div><Button asChild variant="ghost" className="mb-3 -ml-3"><Link href="/dashboard/ventas/rma"><ArrowLeft className="mr-2 h-4 w-4" /> Volver a RMA</Link></Button><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Devolución de cliente</p><h1 className="mt-1 text-3xl font-black tracking-tight">{rma.numero}</h1><p className="mt-2 text-muted-foreground">{rma.motivo_general}</p></div><span className="inline-flex self-start rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary">{rma.estado}</span></div></div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          {steps.map((step, index) => {
            const done = rank >= index && rma.estado !== 'RECHAZADA'
            const active = (index === 1 && rma.estado === 'RECHAZADA') || rank === index
            return <div key={step.state} className={`rounded-xl border p-4 ${done ? 'border-primary/40 bg-primary/5' : 'border-border'}`}><div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-primary text-primary-foreground' : active ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>{done ? '✓' : index + 1}</span><span className="font-semibold">{step.label}</span></div></div>
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card shadow-sm"><div className="flex items-center gap-3 border-b border-border p-5"><Boxes className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Líneas autorizadas</h2><p className="text-sm text-muted-foreground">La cantidad y clasificación quedan congeladas al crear la RMA.</p></div></div><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground"><th className="p-4">Producto</th><th className="p-4">Clasificación</th><th className="p-4 text-right">Autorizada</th><th className="p-4 text-right">Recibida</th><th className="p-4">Estado</th></tr></thead><tbody>{rma.items.map((item) => { const classification = isServiceItem(item) ? 'Servicio · sin stock' : !controlsStock(item) ? 'No-stock · lógico' : 'Stock físico'; return <tr key={item.id} className="border-b border-border"><td className="p-4"><p className="font-semibold">{item.productos?.codigo ? `${item.productos.codigo} · ` : ''}{item.detalle?.descripcion ?? item.documento_detalle?.descripcion ?? item.productos?.nombre ?? 'Producto'}</p><p className="text-xs text-muted-foreground">{item.motivo_item}</p></td><td className="p-4 text-sm">{classification}</td><td className="p-4 text-right font-semibold">{Number(item.cantidad_autorizada)}</td><td className="p-4 text-right">{Number(item.cantidad_devuelta)}</td><td className="p-4 text-sm">{item.estado}</td></tr> })}</tbody></table></div></section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><History className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Trazabilidad</h2><p className="text-sm text-muted-foreground">Eventos operativos independientes del asiento contable.</p></div></div><div className="space-y-4">{eventTimeline.map((event, index) => <div key={event.id} className="relative flex gap-3 pb-2"><div className="flex flex-col items-center"><span className="mt-1 h-3 w-3 rounded-full bg-primary" />{index < eventTimeline.length - 1 && <span className="mt-1 h-full w-px bg-border" />}</div><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-primary">{event.tipo}</span><span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString('es-PE')}</span></div><p className="mt-1 text-sm">{event.descripcion}</p></div></div>)}{eventTimeline.length === 0 && <p className="text-sm text-muted-foreground">Sin eventos.</p>}</div></section>
        </div>

        <aside className="space-y-4">
          {rma.estado === 'CREADA' && <ActionCard icon={ShieldAlert} title="Decisión segregada" description="Quien creó la RMA no puede aprobarla."><Textarea rows={3} placeholder="Notas de decisión" value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} /><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="destructive" disabled={saving} onClick={() => void run('reject', `/api/ventas/rma/${rma.id}/aprobar`, { aprobar: false, notas: decisionNotes || 'Solicitud rechazada' }, 'RMA rechazada')}><XCircle className="mr-2 h-4 w-4" /> Rechazar</Button><Button disabled={saving || isCreator} title={isCreator ? 'Otro usuario debe aprobar' : undefined} onClick={() => void run('approve', `/api/ventas/rma/${rma.id}/aprobar`, { aprobar: true, notas: decisionNotes || undefined }, 'RMA aprobada')}><CheckCircle2 className="mr-2 h-4 w-4" /> Aprobar</Button></div>{isCreator && <p className="mt-2 text-xs text-amber-600">Inicia sesión con un aprobador distinto para continuar.</p>}</ActionCard>}

          {['APROBADA', 'PARCIAL'].includes(rma.estado) && <ActionCard icon={Truck} title="Recepción" description="Puedes recibir parcialmente. Servicios/no-stock sólo avanzan el saldo lógico."><label className="block"><span className="mb-1 block text-xs font-medium">Almacén (sólo stock físico)</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={warehouse} onChange={(event) => { setWarehouse(event.target.value); setLocation('') }}><option value="">Selecciona</option>{recursos.almacenes.map((item) => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} · ` : ''}{item.nombre}</option>)}</select></label>{recursos.control_calidad_requerido && <label className="mt-3 block"><span className="mb-1 block text-xs font-medium">Ubicación de calidad</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Selecciona</option>{filteredLocations.map((item) => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} · ` : ''}{item.nombre}</option>)}</select></label>}<div className="mt-4 space-y-3">{rma.items.filter((item) => Number(item.cantidad_autorizada) > Number(item.cantidad_devuelta)).map((item) => { const pending = Number(item.cantidad_autorizada) - Number(item.cantidad_devuelta); return <label key={item.id} className="grid grid-cols-[1fr_110px] items-center gap-3"><span className="truncate text-sm">{item.productos?.codigo ?? item.detalle?.descripcion ?? 'Ítem'} <small className="block text-muted-foreground">Pendiente {pending}</small></span><Input type="number" min="0" max={pending} step="0.01" value={receipt[item.id] ?? ''} onChange={(event) => setReceipt((current) => ({ ...current, [item.id]: event.target.value }))} /></label> })}</div><Button className="mt-4 w-full" disabled={saving} onClick={() => void receive()}>Registrar recepción</Button></ActionCard>}

          {['PARCIAL', 'RECIBIDA'].includes(rma.estado) && !rma.nota_credito_documento_id && <ActionCard icon={RotateCcw} title="Revertir recepción" description="Revierte todos los ingresos físicos activos y devuelve la RMA a APROBADA."><Input value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /><Button className="mt-3 w-full" variant="outline" disabled={saving || reverseReason.trim().length < 3} onClick={() => void run('reverse', `/api/ventas/rma/${rma.id}/revertir-recepcion`, { motivo: reverseReason }, 'Recepción revertida')}>Revertir íntegramente</Button></ActionCard>}

          {rma.estado === 'RECIBIDA' && <ActionCard icon={FileCheck2} title="Emitir nota de crédito" description="Crea documento interno, deriva una serie FC/BC compatible con el CPE origen, reduce CxC y registra saldo a favor. La transmisión legal espera credenciales del cliente."><label className="block"><span className="mb-1 block text-xs font-medium">Motivo</span><Input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} /></label><p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">La serie no se ingresa manualmente: se deriva del comprobante original para evitar una NC fiscal incompatible.</p><Button className="mt-4 w-full" disabled={saving || creditReason.trim().length < 3} onClick={() => void run('credit-note', `/api/ventas/rma/${rma.id}/nota-credito`, { motivo: creditReason, tipo_nota_credito: '07' }, 'Nota de crédito emitida')}>Emitir NC por líneas devueltas</Button></ActionCard>}

          {rma.estado === 'CERRADA' && <ActionCard icon={BadgeDollarSign} title="Cierre financiero" description="La factura original permanece vigente; sólo se acreditaron las líneas devueltas."><Info label="Documento NC" value={rma.nota_credito_documento_id ?? '—'} /><Info label="CPE 07" value={rma.nota_credito_cpe_id ?? '—'} />{rma.saldo_favor && <div className="mt-4 rounded-xl bg-emerald-500/10 p-4"><p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">Saldo a favor disponible</p><p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(Number(rma.saldo_favor.monto_disponible), rma.saldo_favor.moneda)}</p><Button asChild variant="link" className="mt-1 h-auto p-0"><Link href="/dashboard/ventas/rma">Gestionar aplicación o reembolso</Link></Button></div>}</ActionCard>}

          <div className="rounded-2xl border border-border bg-card p-5 text-sm shadow-sm"><h3 className="font-bold">Referencias inmutables</h3><dl className="mt-3 space-y-2 text-xs"><Ref label="Pedido" value={rma.pedido_id} /><Ref label="Documento origen" value={rma.documento_origen_id} /><Ref label="CPE origen" value={rma.cpe_origen_id} /><Ref label="CxC origen" value={rma.cxc_origen_id} /></dl></div>
        </aside>
      </div>
    </div>
  )
}

function ActionCard({ icon: Icon, title, description, children }: { icon: typeof Truck; title: string; description: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="mb-4 flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div>{children}</section> }
function Info({ label, value }: { label: string; value: string }) { return <div className="mt-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm">{value}</p></div> }
function Ref({ label, value }: { label: string; value?: string }) { return <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="truncate font-mono" title={value}>{value ?? '—'}</dd></div> }
