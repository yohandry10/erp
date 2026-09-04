'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Boxes, CheckCircle2, FileText, ShieldCheck } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { useToast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCountryContext } from '@/hooks/use-country-context'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'

type Detail = {
  id: string
  producto_id: string
  descripcion: string
  cantidad: number
  cantidad_despachada?: number
  cantidad_facturada?: number
  cantidad_retornable?: number
  precio_unitario?: number
  productos?: { codigo?: string; nombre?: string; es_servicio?: boolean; controla_stock?: boolean }
}
type Candidate = {
  id: string
  numero: string
  estado: string
  moneda?: string
  total?: number
  clientes?: { razon_social?: string; nombre?: string; ruc?: string }
  detalle: Detail[]
  documentos: Array<{ id: string; tipo_documento: string; serie: string; numero: string; fecha_emision: string; total: number; estado: string }>
}

const unwrap = <T,>(response: any, fallback: T): T =>
  (response && 'data' in response ? response.data : response) ?? fallback

const operationKey = () => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `rma-ui:create:${random}`
}

export default function NuevaRmaPage() {
  const router = useRouter()
  const { get, post } = useApi({ throwOnError: true })
  const { toast } = useToast()
  const { formatCurrency } = useLocalizedMoney()
  const country = useCountryContext()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [pedidoId, setPedidoId] = useState('')
  const [documentoId, setDocumentoId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [selected, setSelected] = useState<Record<string, { enabled: boolean; cantidad: string; motivo: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fiscalFlowStep = country.paisCodigo === 'CO'
    ? 'Nota crédito DIAN 91; CxC tras aceptación'
    : country.paisCodigo === 'AR'
      ? 'Nota crédito ARCA; CxC tras CAE'
      : country.paisCodigo === 'PE'
        ? 'NC/CPE 07, CxC y asiento'
        : 'Nota fiscal y efecto financiero'

  useEffect(() => {
    void (async () => {
      try {
        const response = await get('/api/ventas/rma/candidatos')
        setCandidates(unwrap<Candidate[]>(response, []))
      } finally {
        setLoading(false)
      }
    })()
  }, [get])

  const pedido = useMemo(() => candidates.find((item) => item.id === pedidoId), [candidates, pedidoId])

  const choosePedido = (id: string) => {
    setPedidoId(id)
    const next = candidates.find((item) => item.id === id)
    setDocumentoId(next?.documentos.length === 1 ? next.documentos[0].id : '')
    setSelected(Object.fromEntries((next?.detalle ?? []).map((line) => [
      line.id,
      { enabled: false, cantidad: String(Number(line.cantidad_retornable ?? 0)), motivo: '' },
    ])))
  }

  const submit = async () => {
    if (!pedido || !motivo.trim()) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Selecciona un pedido y registra el motivo general.' })
      return
    }
    if (pedido.documentos.length > 1 && !documentoId) {
      toast({ variant: 'destructive', title: 'Documento requerido', description: 'El pedido tiene más de un comprobante; selecciona el origen exacto.' })
      return
    }
    const items = pedido.detalle.flatMap((line) => {
      const choice = selected[line.id]
      if (!choice?.enabled) return []
      const cantidad = Number(choice.cantidad)
      if (!Number.isFinite(cantidad) || cantidad <= 0) return []
      return [{
        detalle_id: line.id,
        producto_id: line.producto_id,
        cantidad,
        motivo_item: choice.motivo.trim() || motivo.trim(),
      }]
    })
    if (items.length === 0) {
      toast({ variant: 'destructive', title: 'Sin líneas', description: 'Selecciona al menos una línea y una cantidad válida.' })
      return
    }
    setSaving(true)
    try {
      const response = await post('/api/ventas/rma', {
        pedido_id: pedido.id,
        ...(documentoId ? { documento_origen_id: documentoId } : {}),
        motivo_general: motivo.trim(),
        items,
      }, { headers: { 'Idempotency-Key': operationKey() } })
      const result = unwrap<any>(response, response)
      if (!result?.rma_id) throw new Error('La creación no devolvió el identificador RMA')
      toast({ title: 'RMA creada', description: `${result.numero ?? 'La solicitud'} quedó pendiente de aprobación segregada.` })
      router.push(`/dashboard/ventas/rma/${result.rma_id}`)
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo crear la RMA', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <div><Button asChild variant="ghost" className="mb-3 -ml-3"><Link href="/dashboard/ventas/rma"><ArrowLeft className="mr-2 h-4 w-4" /> Volver a RMA</Link></Button><h1 className="text-3xl font-black tracking-tight">Nueva devolución de cliente</h1><p className="mt-2 text-muted-foreground">La solicitud no mueve stock ni emite documentos hasta superar aprobación y recepción.</p></div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" /></div><div><h2 className="font-bold">1. Venta de origen</h2><p className="text-sm text-muted-foreground">Sólo pedidos facturados o despachados con comprobante vigente.</p></div></div>
            {loading ? <p className="text-sm text-muted-foreground">Cargando pedidos elegibles…</p> : (
              <div className="space-y-4">
                <label className="block"><span className="mb-1.5 block text-sm font-medium">Pedido</span><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={pedidoId} onChange={(event) => choosePedido(event.target.value)}><option value="">Selecciona un pedido</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.numero} · {item.clientes?.razon_social ?? item.clientes?.nombre ?? 'Cliente'} · {item.estado}</option>)}</select></label>
                {pedido && <div className="grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-3"><Info label="Cliente" value={pedido.clientes?.razon_social ?? pedido.clientes?.nombre ?? '—'} /><Info label="Estado" value={pedido.estado} /><Info label="Total" value={formatCurrency(Number(pedido.total ?? 0), pedido.moneda)} /></div>}
                {pedido && <label className="block"><span className="mb-1.5 block text-sm font-medium">Comprobante de origen</span><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={documentoId} onChange={(event) => setDocumentoId(event.target.value)}><option value="">{pedido.documentos.length === 0 ? 'Sin comprobante elegible' : 'Selecciona el comprobante'}</option>{pedido.documentos.map((documento) => <option key={documento.id} value={documento.id}>{documento.tipo_documento} {formatFiscalDocumentNumber(country.paisCodigo, documento.serie, documento.numero)} · {formatCurrency(Number(documento.total ?? 0), pedido.moneda)}</option>)}</select></label>}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Boxes className="h-5 w-5" /></div><div><h2 className="font-bold">2. Líneas a devolver</h2><p className="text-sm text-muted-foreground">Servicios y productos sin stock se acreditan lógicamente, sin crear movimiento físico.</p></div></div>
            {!pedido ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Selecciona primero una venta.</p> : (
              <div className="space-y-3">
                {pedido.detalle.map((line) => {
                  const choice = selected[line.id] ?? { enabled: false, cantidad: '', motivo: '' }
                  const max = Number(line.cantidad_retornable ?? 0)
                  const classification = line.productos?.es_servicio ? 'Servicio' : line.productos?.controla_stock === false ? 'Sin control de stock' : 'Stock físico'
                  return <div key={line.id} className={`rounded-xl border p-4 transition ${choice.enabled ? 'border-primary bg-primary/5' : 'border-border'}`}><div className="flex items-start gap-3"><input aria-label="Enabled" type="checkbox" className="mt-1 h-4 w-4" checked={choice.enabled} disabled={max <= 0} onChange={(event) => setSelected((current) => ({ ...current, [line.id]: { ...choice, enabled: event.target.checked } }))} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{line.productos?.codigo ? `${line.productos.codigo} · ` : ''}{line.descripcion}</p><p className="text-xs text-muted-foreground">{classification} · despachado/facturado disponible: {max}</p></div><p className="font-semibold">{formatCurrency(Number(line.precio_unitario ?? 0), pedido.moneda)}</p></div>{choice.enabled && <div className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr]"><label><span className="mb-1 block text-xs font-medium">Cantidad</span><Input type="number" min="0.01" step="0.01" max={max} value={choice.cantidad} onChange={(event) => setSelected((current) => ({ ...current, [line.id]: { ...choice, cantidad: event.target.value } }))} /></label><label><span className="mb-1 block text-xs font-medium">Motivo específico (opcional)</span><Input value={choice.motivo} onChange={(event) => setSelected((current) => ({ ...current, [line.id]: { ...choice, motivo: event.target.value } }))} /></label></div>}</div></div></div>
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><h2 className="font-bold">3. Motivo general</h2><p className="mb-4 text-sm text-muted-foreground">Queda registrado en la solicitud y en su huella idempotente.</p><Textarea aria-label="Describe el defecto, disconformidad o causa de devolución" rows={4} maxLength={1000} value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Describe el defecto, disconformidad o causa de devolución" /></section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-primary" /> Control del flujo</div><ol className="mt-4 space-y-3 text-sm text-muted-foreground"><Step done label="Crear solicitud" /><Step label="Aprobación por otro usuario" /><Step label="Recepción parcial o completa" /><Step label={fiscalFlowStep} /></ol></div>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100"><strong>No es una anulación total.</strong><p className="mt-1">La nota acredita únicamente las líneas devueltas y conserva vigente el comprobante original.</p></div>
          <Button className="w-full" size="lg" disabled={saving || !pedido} onClick={() => void submit()}>{saving ? 'Creando…' : 'Crear RMA'} <CheckCircle2 className="ml-2 h-4 w-4" /></Button>
        </aside>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate font-semibold">{value}</p></div> }
function Step({ label, done = false }: { label: string; done?: boolean }) { return <li className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{done ? '✓' : '○'}</span>{label}</li> }
