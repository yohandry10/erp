'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeDollarSign,
  Boxes,
  Check,
  Eye,
  Layers3,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { useApi } from '@/hooks/use-api'

type Catalogos = {
  productos: Array<{ id: string; codigo?: string; nombre: string; marca?: string; precio_venta?: number }>
  clientes: Array<{ id: string; codigo?: string; razon_social?: string; nombre?: string }>
  vendedores: Array<{ id: string; nombre?: string; apellido?: string; email?: string }>
}

type ListaPrecio = {
  id: string; codigo: string; nombre: string; moneda: string; prioridad: number
  vendedor_id?: string; cliente_id?: string; vigencia_desde: string; vigencia_hasta?: string
  activo: boolean; detalles?: Array<{ id: string; producto_id?: string; marca?: string; cantidad_minima: number; precio_unitario: number }>
}

type ReglaComision = {
  id: string; codigo: string; nombre: string; vendedor_id?: string; producto_id?: string
  marca?: string; porcentaje: number; prioridad: number; activo: boolean
}

type MovimientoComision = {
  id: string; tipo: 'DEVENGO' | 'REVERSA' | 'REINTEGRO'; vendedor_id: string
  moneda: string; base_comisionable: number; porcentaje: number; monto: number
  marca?: string; snapshot?: { marca_origen?: 'SNAPSHOT_VENTA' | 'PRODUCTO_ACTUAL' }
  created_at: string; producto?: { codigo?: string; nombre?: string; marca?: string }
  regla?: { codigo?: string; nombre?: string }
}

type Candidato = {
  source_type: 'POS' | 'DOCUMENTO'; source_id: string; fecha: string; numero: string
  cliente_nombre?: string; moneda: string; subtotal: number; impuestos: number; total: number
}

type Consolidado = {
  id: string; numero: string; fecha: string; moneda: string; cantidad_fuentes: number
  subtotal: number; impuestos: number; total: number; created_at: string
}

type ConsolidadoDetalle = {
  id: string; orden: number; source_type: 'POS' | 'DOCUMENTO'; source_id: string
  fecha: string; documento_numero: string; cliente_nombre?: string
  moneda: string; subtotal: number; impuestos: number; total: number
}

type ConsolidadoConDetalle = Consolidado & { detalles: ConsolidadoDetalle[] }

type PriceLine = { scope: 'PRODUCTO' | 'MARCA'; producto_id: string; marca: string; cantidad_minima: string; precio_unitario: string }

const emptyLine = (): PriceLine => ({
  scope: 'PRODUCTO', producto_id: '', marca: '', cantidad_minima: '1', precio_unitario: '',
})

const unwrap = <T,>(value: any, fallback: T): T =>
  (value && typeof value === 'object' && 'data' in value ? value.data : value) ?? fallback

// Sin moneda conocida se imprime el número solo. El respaldo era 'PEN', así que
// un importe argentino sin moneda en la fila salía etiquetado en soles.
const money = (value: number, currency?: string | null) => new Intl.NumberFormat('es-PE', {
  style: currency ? 'currency' : 'decimal', currency: currency || undefined, minimumFractionDigits: 2,
}).format(Number(value || 0))

const operationKey = (kind: string) => {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `commercial-ui:${kind}:${id}`
}

const candidateKey = (candidate: Pick<Candidato, 'source_type' | 'source_id'>) =>
  `${candidate.source_type}:${candidate.source_id}`

const localDate = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

export default function ComercialVentasPage() {
  const { get, post, apiCall } = useApi({ throwOnError: true })
  const { toast } = useToast()
  const [tab, setTab] = useState<'precios' | 'comisiones' | 'consolidados'>('precios')
  const [catalogos, setCatalogos] = useState<Catalogos>({ productos: [], clientes: [], vendedores: [] })
  const [listas, setListas] = useState<ListaPrecio[]>([])
  const [reglas, setReglas] = useState<ReglaComision[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoComision[]>([])
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [consolidados, setConsolidados] = useState<Consolidado[]>([])
  const [consolidadoDetalle, setConsolidadoDetalle] = useState<ConsolidadoConDetalle | null>(null)
  const [loadingConsolidadoId, setLoadingConsolidadoId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const keys = useRef<Record<string, string>>({})

  const [listaForm, setListaForm] = useState({
    codigo: '', nombre: '', moneda: 'PEN', prioridad: '0', vendedor_id: '', cliente_id: '',
    vigencia_desde: localDate(), vigencia_hasta: '',
  })
  const [priceLines, setPriceLines] = useState<PriceLine[]>([emptyLine()])
  const [comisionForm, setComisionForm] = useState({
    codigo: '', nombre: '', vendedor_id: '', producto_id: '', marca: '', porcentaje: '',
    prioridad: '0', vigencia_desde: localDate(), vigencia_hasta: '',
  })
  const [batchNotes, setBatchNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [catalogResponse, listResponse, ruleResponse, movementResponse, candidateResponse, batchResponse] = await Promise.all([
        get('/api/ventas/comercial/catalogos'),
        get('/api/ventas/comercial/listas-precios'),
        get('/api/ventas/comercial/comisiones/reglas'),
        get('/api/ventas/comercial/comisiones/movimientos'),
        get('/api/ventas/comercial/consolidados/candidatos?limit=100'),
        get('/api/ventas/comercial/consolidados'),
      ])
      setCatalogos(unwrap<Catalogos>(catalogResponse, { productos: [], clientes: [], vendedores: [] }))
      setListas(unwrap<ListaPrecio[]>(listResponse, []))
      setReglas(unwrap<ReglaComision[]>(ruleResponse, []))
      setMovimientos(unwrap<MovimientoComision[]>(movementResponse, []))
      setCandidatos(unwrap<Candidato[]>(candidateResponse, []))
      setConsolidados(unwrap<Consolidado[]>(batchResponse, []))
      setSelected((current) => current.filter((key) =>
        unwrap<Candidato[]>(candidateResponse, []).some((row) => candidateKey(row) === key),
      ))
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se cargó la gestión comercial', description: error?.message })
    } finally {
      setLoading(false)
    }
  }, [get, toast])

  useEffect(() => { void load() }, [load])

  const netCommission = useMemo(() => {
    const totals = movimientos.reduce<Record<string, number>>((acc, item) => {
      const currency = item.moneda || 'PEN'
      acc[currency] = (acc[currency] || 0) + Number(item.monto || 0)
      return acc
    }, {})
    const entries = Object.entries(totals)
    return entries.length ? entries.map(([currency, total]) => money(total, currency)).join(' · ') : money(0)
  },
    [movimientos],
  )
  const selectedRows = useMemo(
    () => candidatos.filter((candidate) => selected.includes(candidateKey(candidate))),
    [candidatos, selected],
  )
  const selectedTotal = selectedRows.reduce((sum, row) => sum + Number(row.total || 0), 0)

  const keyFor = (slot: string) => (keys.current[slot] ??= operationKey(slot))

  const savePriceList = async () => {
    const details = priceLines.map((line) => ({
      ...(line.scope === 'PRODUCTO' ? { producto_id: line.producto_id } : { marca: line.marca.trim() }),
      cantidad_minima: Number(line.cantidad_minima),
      precio_unitario: Number(line.precio_unitario),
    }))
    if (!listaForm.codigo.trim() || !listaForm.nombre.trim()
        || details.some((line: any, index) => (!line.producto_id && !line.marca)
          || !priceLines[index].precio_unitario.trim() || !Number.isFinite(line.precio_unitario))) {
      toast({ variant: 'destructive', title: 'Completa la lista', description: 'Código, nombre, alcance y precio son obligatorios.' })
      return
    }
    const payload = {
      codigo: listaForm.codigo.trim().toUpperCase(), nombre: listaForm.nombre.trim(),
      moneda: listaForm.moneda.toUpperCase(), prioridad: Number(listaForm.prioridad || 0),
      vendedor_id: listaForm.vendedor_id || undefined, cliente_id: listaForm.cliente_id || undefined,
      vigencia_desde: listaForm.vigencia_desde, vigencia_hasta: listaForm.vigencia_hasta || undefined,
      detalles: details,
    }
    setSaving(true)
    try {
      await post('/api/ventas/comercial/listas-precios', payload, {
        headers: { 'Idempotency-Key': keyFor(`price:${JSON.stringify(payload)}`) },
      })
      keys.current = {}
      setListaForm((current) => ({ ...current, codigo: '', nombre: '' }))
      setPriceLines([emptyLine()])
      toast({ title: 'Lista registrada', description: 'Las ventas nuevas resolverán este precio según vigencia y prioridad.' })
      await load()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se guardó la lista', description: error?.message })
    } finally { setSaving(false) }
  }

  const saveCommission = async () => {
    const payload = {
      codigo: comisionForm.codigo.trim().toUpperCase(), nombre: comisionForm.nombre.trim(),
      vendedor_id: comisionForm.vendedor_id || undefined,
      producto_id: comisionForm.producto_id || undefined,
      marca: comisionForm.marca.trim() || undefined,
      porcentaje: Number(comisionForm.porcentaje), prioridad: Number(comisionForm.prioridad || 0),
      vigencia_desde: comisionForm.vigencia_desde,
      vigencia_hasta: comisionForm.vigencia_hasta || undefined,
    }
    if (!payload.codigo || !payload.nombre || !comisionForm.porcentaje.trim()
        || !Number.isFinite(payload.porcentaje)) {
      toast({ variant: 'destructive', title: 'Completa la regla', description: 'Código, nombre y porcentaje son obligatorios.' })
      return
    }
    setSaving(true)
    try {
      await post('/api/ventas/comercial/comisiones/reglas', payload, {
        headers: { 'Idempotency-Key': keyFor(`commission:${JSON.stringify(payload)}`) },
      })
      keys.current = {}
      setComisionForm((current) => ({ ...current, codigo: '', nombre: '', porcentaje: '' }))
      toast({ title: 'Regla registrada', description: 'Sólo ventas o comprobantes válidos devengarán comisión.' })
      await load()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se guardó la regla', description: error?.message })
    } finally { setSaving(false) }
  }

  const toggleRule = async (kind: 'listas-precios' | 'comisiones/reglas', row: { id: string; activo: boolean }) => {
    const payload = { activo: !row.activo }
    setSaving(true)
    try {
      await apiCall(`/api/ventas/comercial/${kind}/${row.id}/estado`, {
        method: 'PATCH', body: JSON.stringify(payload),
        headers: { 'Idempotency-Key': operationKey(`status-${row.id}-${payload.activo}`) },
      })
      await load()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se cambió el estado', description: error?.message })
    } finally { setSaving(false) }
  }

  const toggleCandidate = (candidate: Candidato) => {
    const key = candidateKey(candidate)
    setSelected((current) => {
      if (current.includes(key)) return current.filter((value) => value !== key)
      if (current.length >= 10) return current
      const first = candidatos.find((row) => candidateKey(row) === current[0])
      if (first && first.moneda !== candidate.moneda) {
        toast({ variant: 'destructive', title: 'Monedas distintas', description: 'Cada consolidado debe usar una sola moneda.' })
        return current
      }
      return [...current, key]
    })
  }

  const selectFirstTen = () => {
    const currency = candidatos[0]?.moneda
    setSelected(candidatos
      .filter((row) => row.moneda === currency)
      .slice(0, 10)
      .map(candidateKey))
  }

  const openConsolidado = async (row: Consolidado) => {
    setLoadingConsolidadoId(row.id)
    try {
      const response = await get(`/api/ventas/comercial/consolidados/${row.id}`)
      setConsolidadoDetalle(unwrap<ConsolidadoConDetalle>(response, { ...row, detalles: [] }))
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se abrió el consolidado', description: error?.message })
    } finally {
      setLoadingConsolidadoId(null)
    }
  }

  const consolidate = async () => {
    if (selectedRows.length === 0) return
    const payload = {
      fuentes: selectedRows.map((row) => ({ tipo: row.source_type, id: row.source_id })),
      notas: batchNotes.trim() || undefined,
    }
    setSaving(true)
    try {
      await post('/api/ventas/comercial/consolidados', payload, {
        headers: { 'Idempotency-Key': keyFor(`batch:${JSON.stringify(payload)}`) },
      })
      keys.current = {}
      setSelected([])
      setBatchNotes('')
      toast({ title: 'Bloque consolidado', description: `${selectedRows.length} ventas quedaron congeladas sin duplicar asientos.` })
      await load()
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'No se creó el bloque', description: error?.message })
    } finally { setSaving(false) }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 text-foreground md:p-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card/95 p-6 shadow-lg before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex md:items-center md:justify-between md:p-8">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Control comercial</p>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Precios, comisiones y bloques de venta</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">Reglas con vigencia y prioridad, comisión reversible y consolidación operativa inmutable.</p>
        </div>
        <Button variant="outline" className="mt-4 gap-2 md:mt-0" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Tags} label="Listas activas" value={String(listas.filter((row) => row.activo).length)} />
        <Metric icon={BadgeDollarSign} label="Comisión neta" value={netCommission} />
        <Metric icon={ListChecks} label="Ventas por agrupar" value={String(candidatos.length)} />
        <Metric icon={Layers3} label="Bloques emitidos" value={String(consolidados.length)} />
      </section>

      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2">
        {([
          ['precios', 'Listas de precios', Tags],
          ['comisiones', 'Comisiones', BadgeDollarSign],
          ['consolidados', 'Consolidados', Layers3],
        ] as const).map(([value, label, Icon]) => (
          <Button key={value} variant={tab === value ? 'default' : 'ghost'} className="gap-2" onClick={() => setTab(value)}>
            <Icon className="h-4 w-4" /> {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-56 items-center justify-center rounded-2xl border border-border bg-card"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : tab === 'precios' ? (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Panel title="Nueva lista" subtitle="El producto exacto prevalece sobre marca; luego aplican vendedor/cliente, prioridad y vigencia.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Código"><Input aria-label="MAYORISTA-LIMA" value={listaForm.codigo} onChange={(e) => setListaForm({ ...listaForm, codigo: e.target.value })} placeholder="MAYORISTA-LIMA" /></Field>
              <Field label="Nombre"><Input aria-label="Mayoristas Lima" value={listaForm.nombre} onChange={(e) => setListaForm({ ...listaForm, nombre: e.target.value })} placeholder="Mayoristas Lima" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Moneda"><Input aria-label="Moneda" maxLength={3} value={listaForm.moneda} onChange={(e) => setListaForm({ ...listaForm, moneda: e.target.value.toUpperCase() })} /></Field>
                <Field label="Prioridad"><Input aria-label="Prioridad" type="number" value={listaForm.prioridad} onChange={(e) => setListaForm({ ...listaForm, prioridad: e.target.value })} /></Field>
              </div>
              <Field label="Vendedor (opcional)"><Select value={listaForm.vendedor_id} onChange={(value) => setListaForm({ ...listaForm, vendedor_id: value })} options={catalogos.vendedores.map((v) => ({ value: v.id, label: `${v.nombre || ''} ${v.apellido || ''}`.trim() || v.email || v.id }))} empty="Todos" /></Field>
              <Field label="Cliente (opcional)"><Select value={listaForm.cliente_id} onChange={(value) => setListaForm({ ...listaForm, cliente_id: value })} options={catalogos.clientes.map((c) => ({ value: c.id, label: c.razon_social || c.nombre || c.codigo || c.id }))} empty="Todos" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde"><Input aria-label="Vigencia desde" type="date" value={listaForm.vigencia_desde} onChange={(e) => setListaForm({ ...listaForm, vigencia_desde: e.target.value })} /></Field>
                <Field label="Hasta"><Input aria-label="Vigencia hasta" type="date" value={listaForm.vigencia_hasta} onChange={(e) => setListaForm({ ...listaForm, vigencia_hasta: e.target.value })} /></Field>
              </div>
            </div>
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              {priceLines.map((line, index) => (
                <div key={index} className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex gap-2">
                    <Button size="sm" variant={line.scope === 'PRODUCTO' ? 'default' : 'outline'} onClick={() => setPriceLines((rows) => rows.map((row, i) => i === index ? { ...row, scope: 'PRODUCTO', marca: '' } : row))}>Producto</Button>
                    <Button size="sm" variant={line.scope === 'MARCA' ? 'default' : 'outline'} onClick={() => setPriceLines((rows) => rows.map((row, i) => i === index ? { ...row, scope: 'MARCA', producto_id: '' } : row))}>Marca</Button>
                  </div>
                  {line.scope === 'PRODUCTO' ? (
                    <Select value={line.producto_id} onChange={(value) => setPriceLines((rows) => rows.map((row, i) => i === index ? { ...row, producto_id: value } : row))} options={catalogos.productos.map((p) => ({ value: p.id, label: `${p.codigo || ''} · ${p.nombre}` }))} empty="Selecciona producto" />
                  ) : <Input aria-label="Marca exacta" value={line.marca} onChange={(e) => setPriceLines((rows) => rows.map((row, i) => i === index ? { ...row, marca: e.target.value } : row))} placeholder="Marca exacta" />}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input aria-label="Cantidad mínima" type="number" min="0" step="0.01" value={line.cantidad_minima} onChange={(e) => setPriceLines((rows) => rows.map((row, i) => i === index ? { ...row, cantidad_minima: e.target.value } : row))} placeholder="Cantidad mínima" />
                    <Input aria-label="Precio" type="number" min="0" step="0.01" value={line.precio_unitario} onChange={(e) => setPriceLines((rows) => rows.map((row, i) => i === index ? { ...row, precio_unitario: e.target.value } : row))} placeholder="Precio" />
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full gap-2" onClick={() => setPriceLines((rows) => [...rows, emptyLine()])}><Plus className="h-4 w-4" /> Añadir alcance</Button>
            </div>
            <Button className="mt-4 w-full gap-2" onClick={() => void savePriceList()} disabled={saving}><Save className="h-4 w-4" /> Guardar lista</Button>
          </Panel>
          <Panel title="Listas registradas" subtitle="Desactivar conserva todos los snapshots históricos.">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Lista</Th><Th>Alcance</Th><Th>Vigencia</Th><Th>Estado</Th></tr></thead><tbody>
              {listas.map((row) => <tr key={row.id} className="border-t border-border"><Td><strong>{row.codigo}</strong><div className="text-muted-foreground">{row.nombre} · {row.moneda} · prioridad {row.prioridad}</div></Td><Td>{row.detalles?.length || 0} precio(s)<div className="text-xs text-muted-foreground">{row.vendedor_id ? 'Vendedor específico' : 'Todos los vendedores'} · {row.cliente_id ? 'Cliente específico' : 'Todos los clientes'}</div></Td><Td>{row.vigencia_desde}<div className="text-xs text-muted-foreground">hasta {row.vigencia_hasta || 'sin límite'}</div></Td><Td><Button size="sm" variant={row.activo ? 'outline' : 'secondary'} disabled={saving} onClick={() => void toggleRule('listas-precios', row)}>{row.activo ? 'Activa' : 'Inactiva'}</Button></Td></tr>)}
            </tbody></table></div>
          </Panel>
        </div>
      ) : tab === 'comisiones' ? (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Panel title="Nueva regla" subtitle="El devengo nace sólo de venta/factura válida; NC y anulaciones agregan reversas.">
            <div className="space-y-3">
              <Field label="Código"><Input aria-label="COM-MARCA-A" value={comisionForm.codigo} onChange={(e) => setComisionForm({ ...comisionForm, codigo: e.target.value })} placeholder="COM-MARCA-A" /></Field>
              <Field label="Nombre"><Input aria-label="Nombre" value={comisionForm.nombre} onChange={(e) => setComisionForm({ ...comisionForm, nombre: e.target.value })} /></Field>
              <Field label="Vendedor (opcional)"><Select value={comisionForm.vendedor_id} onChange={(value) => setComisionForm({ ...comisionForm, vendedor_id: value })} options={catalogos.vendedores.map((v) => ({ value: v.id, label: `${v.nombre || ''} ${v.apellido || ''}`.trim() || v.email || v.id }))} empty="Todos" /></Field>
              <Field label="Producto (opcional)"><Select value={comisionForm.producto_id} onChange={(value) => setComisionForm({ ...comisionForm, producto_id: value })} options={catalogos.productos.map((p) => ({ value: p.id, label: `${p.codigo || ''} · ${p.nombre}` }))} empty="Todos" /></Field>
              <Field label="Marca (opcional)"><Input aria-label="Marca" value={comisionForm.marca} onChange={(e) => setComisionForm({ ...comisionForm, marca: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3"><Field label="Porcentaje"><Input aria-label="Porcentaje" type="number" min="0" max="100" step="0.01" value={comisionForm.porcentaje} onChange={(e) => setComisionForm({ ...comisionForm, porcentaje: e.target.value })} /></Field><Field label="Prioridad"><Input aria-label="Prioridad" type="number" value={comisionForm.prioridad} onChange={(e) => setComisionForm({ ...comisionForm, prioridad: e.target.value })} /></Field></div>
              <div className="grid grid-cols-2 gap-3"><Field label="Desde"><Input aria-label="Vigencia desde" type="date" value={comisionForm.vigencia_desde} onChange={(e) => setComisionForm({ ...comisionForm, vigencia_desde: e.target.value })} /></Field><Field label="Hasta"><Input aria-label="Vigencia hasta" type="date" value={comisionForm.vigencia_hasta} onChange={(e) => setComisionForm({ ...comisionForm, vigencia_hasta: e.target.value })} /></Field></div>
              <Button className="w-full gap-2" onClick={() => void saveCommission()} disabled={saving}><Save className="h-4 w-4" /> Guardar regla</Button>
            </div>
            <div className="mt-6 space-y-2 border-t border-border pt-4">{reglas.map((row) => <div key={row.id} className="flex items-center justify-between rounded-lg border border-border p-3"><div><strong>{row.codigo}</strong><div className="text-xs text-muted-foreground">{row.porcentaje}% · prioridad {row.prioridad}</div></div><Button size="sm" variant="outline" onClick={() => void toggleRule('comisiones/reglas', row)}>{row.activo ? 'Activa' : 'Inactiva'}</Button></div>)}</div>
          </Panel>
          <Panel title="Libro de comisiones" subtitle="Append-only: devengos, reversas y reintegros quedan visibles.">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>Fecha / tipo</Th><Th>Producto</Th><Th>Base</Th><Th>Comisión</Th></tr></thead><tbody>{movimientos.map((row) => <tr key={row.id} className="border-t border-border"><Td>{new Date(row.created_at).toLocaleString('es-PE')}<div><Badge tone={row.tipo === 'DEVENGO' ? 'green' : row.tipo === 'REVERSA' ? 'red' : 'blue'}>{row.tipo}</Badge></div></Td><Td>{row.producto?.codigo || '—'} · {row.producto?.nombre || 'Sin producto'}<div className="text-xs text-muted-foreground">Marca congelada: {row.marca || '—'} · {row.regla?.codigo || 'Regla histórica'}</div></Td><Td>{money(row.base_comisionable, row.moneda)} · {row.porcentaje}%</Td><Td><strong className={Number(row.monto) < 0 ? 'text-red-600' : 'text-emerald-600'}>{money(row.monto, row.moneda)}</strong></Td></tr>)}</tbody></table></div>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <Panel title="Ventas disponibles" subtitle="Selecciona hasta diez para formar el bloque operativo. Una venta sólo puede pertenecer a un bloque.">
            <div className="mb-4 flex flex-wrap items-center gap-2"><Button variant="outline" className="gap-2" onClick={selectFirstTen}><ListChecks className="h-4 w-4" /> Seleccionar primeras 10</Button><span className="text-sm text-muted-foreground">{selected.length}/10 seleccionadas</span></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th></Th><Th>Venta</Th><Th>Cliente</Th><Th>Fecha</Th><Th>Total</Th></tr></thead><tbody>{candidatos.map((row) => { const checked = selected.includes(candidateKey(row)); return <tr key={candidateKey(row)} className="border-t border-border"><Td><button aria-label={`Seleccionar ${row.numero}`} onClick={() => toggleCandidate(row)} className={`flex h-6 w-6 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{checked && <Check className="h-4 w-4" />}</button></Td><Td><strong>{row.numero}</strong><div className="text-xs text-muted-foreground">{row.source_type}</div></Td><Td>{row.cliente_nombre || 'Consumidor final'}</Td><Td>{new Date(row.fecha).toLocaleString('es-PE')}</Td><Td>{money(row.total,row.moneda)}</Td></tr> })}</tbody></table></div>
          </Panel>
          <div className="space-y-6">
            <Panel title="Cerrar bloque" subtitle="El reporte congela cabeceras y líneas; no vuelve a generar asientos.">
              <div className="rounded-xl bg-muted/50 p-4"><div className="text-sm text-muted-foreground">Seleccionadas</div><div className="text-3xl font-black">{selectedRows.length}</div><div className="mt-2 text-sm text-muted-foreground">Total del bloque</div><div className="text-2xl font-bold">{money(selectedTotal, selectedRows[0]?.moneda)}</div></div>
              <Field label="Notas"><Input aria-label="Turno mañana, ruta norte…" value={batchNotes} onChange={(e) => setBatchNotes(e.target.value)} placeholder="Turno mañana, ruta norte…" /></Field>
              <Button className="mt-3 w-full gap-2" onClick={() => void consolidate()} disabled={saving || selectedRows.length === 0}><Boxes className="h-4 w-4" /> Generar consolidado</Button>
            </Panel>
            <Panel title="Historial" subtitle="Los bloques emitidos no se editan ni eliminan.">
              {consolidados.map((row) => <div key={row.id} className="mb-2 rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-3"><div><strong>{row.numero}</strong><div className="mt-1 text-sm text-muted-foreground">{row.fecha} · {money(row.total,row.moneda)}</div></div><div className="flex items-center gap-2"><Badge tone="blue">{row.cantidad_fuentes} ventas</Badge><Button size="sm" variant="outline" className="gap-1" disabled={loadingConsolidadoId === row.id} onClick={() => void openConsolidado(row)}>{loadingConsolidadoId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Ver</Button></div></div></div>)}
              {consolidadoDetalle && <div className="mt-4 border-t border-border pt-4"><div className="mb-3 flex items-center justify-between"><div><strong>{consolidadoDetalle.numero}</strong><div className="text-xs text-muted-foreground">Snapshot inmutable · {consolidadoDetalle.detalles.length} fuentes</div></div><Button size="sm" variant="ghost" onClick={() => setConsolidadoDetalle(null)}>Cerrar</Button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><Th>#</Th><Th>Venta</Th><Th>Cliente</Th><Th>Total</Th></tr></thead><tbody>{consolidadoDetalle.detalles.map((detalle) => <tr key={detalle.id} className="border-t border-border"><Td>{detalle.orden}</Td><Td><strong>{detalle.documento_numero}</strong><div className="text-xs text-muted-foreground">{detalle.source_type} · {new Date(detalle.fecha).toLocaleString('es-PE')}</div></Td><Td>{detalle.cliente_nombre || 'Consumidor final'}</Td><Td>{money(detalle.total, detalle.moneda)}</Td></tr>)}</tbody></table></div></div>}
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card/95 p-5 shadow-md"><h2 className="text-xl font-black">{title}</h2><p className="mb-5 mt-1 text-sm text-muted-foreground">{subtitle}</p>{children}</section>
}

function Metric({ icon: Icon, label, value }: { icon: typeof Tags; label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div><div className="mt-2 text-2xl font-black">{value}</div></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-semibold"><span>{label}</span>{children}</label>
}

function Select({ value, onChange, options, empty }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; empty: string }) {
  // etiqueta-por-composicion: este Select siempre se renderiza dentro de <Field>,
  // que envuelve a sus hijos en una <label>. Poner aquí un aria-label pisaría esa
  // etiqueta con un nombre peor.
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{empty}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'green' | 'red' | 'blue' }) {
  const classes = tone === 'green' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : tone === 'red' ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${classes}`}>{children}</span>
}

function Th({ children }: { children?: React.ReactNode }) { return <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">{children}</th> }
function Td({ children }: { children?: React.ReactNode }) { return <td className="px-3 py-3 align-top">{children}</td> }
