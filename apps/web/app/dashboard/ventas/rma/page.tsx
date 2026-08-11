'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeDollarSign,
  FilePlus2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  WalletCards,
  X,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { SaldoFavorMovimientosModal } from '@/components/ventas/SaldoFavorMovimientosModal'

type Rma = {
  id: string
  numero: string
  estado: string
  motivo_general?: string
  pedido_id?: string
  documento_origen_id?: string
  nota_credito_documento_id?: string
  created_at: string
  clientes?: { razon_social?: string; nombre?: string; ruc?: string }
}

type SaldoFavor = {
  id: string
  cliente_id: string
  rma_id: string
  moneda: string
  monto_original: number
  monto_disponible: number
  estado: string
  created_at: string
  clientes?: { razon_social?: string; nombre?: string; ruc?: string }
  rma?: { numero?: string; estado?: string }
}

type Cxc = {
  id: string
  numero_documento?: string
  moneda: string
  monto_pendiente?: number
  saldo_pendiente?: number
  saldo?: number
  estado: string
}

type Medios = {
  bancos: Array<{ id: string; nombre?: string; banco?: string; moneda: string; saldo?: number }>
  sesiones_caja: Array<{ id: string; moneda: string; cajas?: { codigo?: string; nombre?: string } }>
}

const unwrap = <T,>(response: any, fallback: T): T =>
  (response && 'data' in response ? response.data : response) ?? fallback

const createOperationKey = (kind: string) => {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `rma-ui:${kind}:${random}`
}

const badgeTone: Record<string, string> = {
  CREADA: 'bg-muted text-muted-foreground',
  APROBADA: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  PARCIAL: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  RECIBIDA: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  CERRADA: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  RECHAZADA: 'bg-red-500/15 text-red-700 dark:text-red-300',
  DISPONIBLE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  AGOTADO: 'bg-muted text-muted-foreground',
}

export default function RmaPage() {
  const { get, post } = useApi({ throwOnError: true })
  const { formatCurrency } = useLocalizedMoney()
  const { toast } = useToast()
  const [rmas, setRmas] = useState<Rma[]>([])
  const [saldos, setSaldos] = useState<SaldoFavor[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'rma' | 'saldos'>('rma')
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('')
  const [saldoActivo, setSaldoActivo] = useState<SaldoFavor | null>(null)
  const [saldoHistorialId, setSaldoHistorialId] = useState<string | null>(null)
  const [accion, setAccion] = useState<'aplicar' | 'reembolsar' | null>(null)
  const [monto, setMonto] = useState('')
  const [cxcId, setCxcId] = useState('')
  const [cxc, setCxc] = useState<Cxc[]>([])
  const [medios, setMedios] = useState<Medios>({ bancos: [], sesiones_caja: [] })
  const [medio, setMedio] = useState<'BANCO' | 'CAJA'>('BANCO')
  const [medioId, setMedioId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [saving, setSaving] = useState(false)
  const operationKeys = useRef<Record<string, string>>({})

  const operationKey = (kind: string, signature: string) => {
    const slot = `${kind}:${signature}`
    operationKeys.current[slot] ??= createOperationKey(kind)
    return operationKeys.current[slot]
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rmaResponse, saldosResponse] = await Promise.all([
        get('/api/ventas/rma'),
        get('/api/ventas/rma/saldos-favor'),
      ])
      setRmas(unwrap<Rma[]>(rmaResponse, []))
      setSaldos(unwrap<SaldoFavor[]>(saldosResponse, []))
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => { void load() }, [load])

  const filteredRmas = useMemo(() => rmas.filter((rma) => {
    const term = search.trim().toLowerCase()
    const cliente = rma.clientes?.razon_social ?? rma.clientes?.nombre ?? ''
    return (!term || `${rma.numero} ${cliente} ${rma.motivo_general ?? ''}`.toLowerCase().includes(term))
      && (!estado || rma.estado === estado)
  }), [rmas, search, estado])

  const filteredSaldos = useMemo(() => saldos.filter((saldo) => {
    const term = search.trim().toLowerCase()
    const cliente = saldo.clientes?.razon_social ?? saldo.clientes?.nombre ?? ''
    return (!term || `${cliente} ${saldo.rma?.numero ?? ''}`.toLowerCase().includes(term))
      && (!estado || saldo.estado === estado)
  }), [saldos, search, estado])

  const disponibleTotal = saldos.reduce((sum, saldo) => sum + Number(saldo.monto_disponible || 0), 0)

  const openAction = async (saldo: SaldoFavor, nextAction: 'aplicar' | 'reembolsar') => {
    setSaldoActivo(saldo)
    setAccion(nextAction)
    setMonto(String(Number(saldo.monto_disponible || 0).toFixed(2)))
    setCxcId('')
    setMedioId('')
    setReferencia('')
    if (nextAction === 'aplicar') {
      const response = await get(`/api/ventas/rma/saldos-favor/${saldo.id}/cxc-aplicables`)
      setCxc(unwrap<Cxc[]>(response, []))
    } else {
      const response = await get('/api/ventas/rma/medios-reembolso')
      setMedios(unwrap<Medios>(response, { bancos: [], sesiones_caja: [] }))
    }
  }

  const closeAction = () => {
    if (saving) return
    setSaldoActivo(null)
    setAccion(null)
  }

  const submitAction = async () => {
    if (!saldoActivo || !accion) return
    const amount = Number(monto)
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(saldoActivo.monto_disponible)) {
      toast({ variant: 'destructive', title: 'Monto inválido', description: 'Usa un monto positivo que no exceda el saldo disponible.' })
      return
    }
    setSaving(true)
    try {
      if (accion === 'aplicar') {
        if (!cxcId) throw new Error('Selecciona una cuenta por cobrar compatible')
        const payload = { cxc_id: cxcId, monto: amount }
        await post(
          `/api/ventas/rma/saldos-favor/${saldoActivo.id}/aplicar`,
          payload,
          { headers: { 'Idempotency-Key': operationKey('saldo-aplicar', `${saldoActivo.id}:${JSON.stringify(payload)}`) } },
        )
      } else {
        if (!medioId) throw new Error(`Selecciona ${medio === 'BANCO' ? 'una cuenta bancaria' : 'una sesión de caja'}`)
        const payload = {
          monto: amount,
          medio,
          ...(medio === 'BANCO'
            ? { cuenta_bancaria_id: medioId, referencia: referencia.trim() }
            : { sesion_caja_id: medioId }),
        }
        await post(
          `/api/ventas/rma/saldos-favor/${saldoActivo.id}/reembolsar`,
          payload,
          { headers: { 'Idempotency-Key': operationKey('saldo-reembolsar', `${saldoActivo.id}:${JSON.stringify(payload)}`) } },
        )
      }
      toast({ title: 'Operación registrada', description: 'El saldo y su trazabilidad contable fueron actualizados.' })
      operationKeys.current = {}
      setSaldoActivo(null)
      setAccion(null)
      await load()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se pudo completar', description: error?.message ?? 'Error inesperado' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 text-foreground md:p-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card/95 p-6 shadow-lg before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex md:items-center md:justify-between md:p-8">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Postventa</p>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">RMA y devoluciones de clientes</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">Solicitud, decisión segregada, recepción controlada, nota de crédito y saldo a favor en un solo flujo trazable.</p>
        </div>
        <Button asChild className="mt-5 gap-2 md:mt-0">
          <Link href="/dashboard/ventas/rma/nuevo"><FilePlus2 className="h-4 w-4" /> Nueva RMA</Link>
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={RotateCcw} label="Solicitudes" value={String(rmas.length)} />
        <Metric icon={PackageCheck} label="Por recibir" value={String(rmas.filter((r) => ['APROBADA', 'PARCIAL'].includes(r.estado)).length)} />
        <Metric icon={BadgeDollarSign} label="Cerradas con NC" value={String(rmas.filter((r) => r.estado === 'CERRADA').length)} />
        <Metric icon={WalletCards} label="Saldo disponible" value={formatCurrency(disponibleTotal)} />
      </section>

      <section className="rounded-2xl border border-border bg-card/95 shadow-md">
        <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2">
            <Button variant={view === 'rma' ? 'default' : 'outline'} onClick={() => { setView('rma'); setEstado('') }}>RMA</Button>
            <Button variant={view === 'saldos' ? 'default' : 'outline'} onClick={() => { setView('saldos'); setEstado('') }}>Saldos a favor</Button>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-3xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por número, cliente o motivo" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={estado} onChange={(event) => setEstado(event.target.value)}>
              <option value="">Todos los estados</option>
              {(view === 'rma'
                ? ['CREADA', 'APROBADA', 'PARCIAL', 'RECIBIDA', 'CERRADA', 'RECHAZADA']
                : ['DISPONIBLE', 'PARCIAL', 'AGOTADO']).map((value) => <option key={value}>{value}</option>)}
            </select>
            <Button variant="outline" size="icon" aria-label="Actualizar" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Cargando trazabilidad RMA…</div>
        ) : view === 'rma' ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="p-4">RMA</th><th className="p-4">Cliente</th><th className="p-4">Motivo</th><th className="p-4">Estado</th><th className="p-4">Creación</th><th className="p-4 text-right">Acción</th></tr></thead>
              <tbody>
                {filteredRmas.map((rma) => (
                  <tr key={rma.id} className="border-b border-border transition hover:bg-muted/30">
                    <td className="p-4 font-semibold">{rma.numero}</td>
                    <td className="p-4"><div>{rma.clientes?.razon_social ?? rma.clientes?.nombre ?? 'Cliente'}</div><div className="text-xs text-muted-foreground">{rma.clientes?.ruc ?? ''}</div></td>
                    <td className="max-w-md p-4 text-sm text-muted-foreground">{rma.motivo_general ?? '—'}</td>
                    <td className="p-4"><Status value={rma.estado} /></td>
                    <td className="p-4 text-sm">{new Date(rma.created_at).toLocaleDateString('es-PE')}</td>
                    <td className="p-4 text-right"><Button asChild variant="outline" size="sm"><Link href={`/dashboard/ventas/rma/${rma.id}`}>Ver flujo <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></td>
                  </tr>
                ))}
                {filteredRmas.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">No hay RMA con estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-border bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="p-4">Cliente / origen</th><th className="p-4">Original</th><th className="p-4">Disponible</th><th className="p-4">Estado</th><th className="p-4 text-right">Acciones</th></tr></thead>
              <tbody>
                {filteredSaldos.map((saldo) => (
                  <tr key={saldo.id} className="border-b border-border transition hover:bg-muted/30">
                    <td className="p-4"><div className="font-semibold">{saldo.clientes?.razon_social ?? saldo.clientes?.nombre ?? 'Cliente'}</div><div className="text-xs text-muted-foreground">{saldo.rma?.numero ?? `RMA ${saldo.rma_id.slice(0, 8)}`}</div></td>
                    <td className="p-4">{formatCurrency(Number(saldo.monto_original), saldo.moneda)}</td>
                    <td className="p-4 text-lg font-bold text-emerald-600">{formatCurrency(Number(saldo.monto_disponible), saldo.moneda)}</td>
                    <td className="p-4"><Status value={saldo.estado} /></td>
                    <td className="p-4"><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setSaldoHistorialId(saldo.id)}>Historial / reversas</Button><Button size="sm" variant="outline" disabled={Number(saldo.monto_disponible) <= 0} onClick={() => void openAction(saldo, 'aplicar')}>Aplicar a CxC</Button><Button size="sm" disabled={Number(saldo.monto_disponible) <= 0} onClick={() => void openAction(saldo, 'reembolsar')}>Reembolsar</Button></div></td>
                  </tr>
                ))}
                {filteredSaldos.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">No hay saldos a favor con estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {saldoActivo && accion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={accion === 'aplicar' ? 'Aplicar saldo a favor' : 'Reembolsar saldo a favor'}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{accion === 'aplicar' ? 'Aplicar saldo a una CxC' : 'Reembolsar saldo a favor'}</h2><p className="mt-1 text-sm text-muted-foreground">Disponible: {formatCurrency(Number(saldoActivo.monto_disponible), saldoActivo.moneda)}</p></div><Button variant="ghost" size="icon" onClick={closeAction}><X className="h-4 w-4" /></Button></div>
            <div className="mt-6 space-y-4">
              <Field label={`Monto (${saldoActivo.moneda})`}><Input type="number" min="0.01" step="0.01" max={saldoActivo.monto_disponible} value={monto} onChange={(event) => setMonto(event.target.value)} /></Field>
              {accion === 'aplicar' ? (
                <Field label="Cuenta por cobrar compatible"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={cxcId} onChange={(event) => setCxcId(event.target.value)}><option value="">Selecciona una CxC</option>{cxc.map((item) => <option key={item.id} value={item.id}>{item.numero_documento ?? item.id.slice(0, 8)} · {formatCurrency(Number(item.monto_pendiente ?? item.saldo_pendiente ?? item.saldo ?? 0), item.moneda)}</option>)}</select>{cxc.length === 0 && <p className="mt-2 text-xs text-amber-600">No hay CxC pendientes del mismo cliente y moneda.</p>}</Field>
              ) : (
                <>
                  <Field label="Medio"><div className="grid grid-cols-2 gap-2"><Button type="button" variant={medio === 'BANCO' ? 'default' : 'outline'} onClick={() => { setMedio('BANCO'); setMedioId('') }}>Banco</Button><Button type="button" variant={medio === 'CAJA' ? 'default' : 'outline'} onClick={() => { setMedio('CAJA'); setMedioId('') }}>Caja</Button></div></Field>
                  <Field label={medio === 'BANCO' ? 'Cuenta bancaria explícita' : 'Sesión propia de caja abierta'}><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={medioId} onChange={(event) => setMedioId(event.target.value)}><option value="">Selecciona una opción</option>{(medio === 'BANCO' ? medios.bancos : medios.sesiones_caja).filter((item) => item.moneda === saldoActivo.moneda).map((item: any) => <option key={item.id} value={item.id}>{medio === 'BANCO' ? `${item.nombre ?? item.banco} · ${item.moneda}` : `${item.cajas?.nombre ?? item.cajas?.codigo ?? 'Caja'} · ${item.moneda}`}</option>)}</select></Field>
                  {medio === 'BANCO' && <Field label="Referencia bancaria"><Input value={referencia} onChange={(event) => setReferencia(event.target.value)} placeholder="Operación o transferencia" /></Field>}
                </>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={closeAction} disabled={saving}>Cancelar</Button><Button onClick={() => void submitAction()} disabled={saving}>{saving ? 'Registrando…' : 'Confirmar'}</Button></div>
          </div>
        </div>
      )}

      {saldoHistorialId && (
        <SaldoFavorMovimientosModal
          saldoId={saldoHistorialId}
          onClose={() => setSaldoHistorialId(null)}
          onUpdated={load}
        />
      )}
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof RotateCcw; label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card/95 p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><Icon className="h-5 w-5 text-primary" /></div><p className="mt-3 text-2xl font-black">{value}</p></div>
}

function Status({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${badgeTone[value] ?? 'bg-muted text-muted-foreground'}`}>{value}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium">{label}</span>{children}</label>
}
