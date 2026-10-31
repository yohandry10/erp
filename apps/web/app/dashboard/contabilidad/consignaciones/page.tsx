'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Boxes, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/use-permission'
import { readConsignmentRegister, readConsignmentProducts, consignmentTotals, consignmentDestinations } from '@/lib/contabilidad/consignment-read-contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Consignacion = import('@/lib/contabilidad/consignment-read-contract').ConsignmentRow
type Producto = import('@/lib/contabilidad/consignment-read-contract').ConsignmentProduct

const estados = ['PENDIENTE', 'VENDIDA', 'DEVUELTA', 'CERRADA', 'ANULADA']
const todayLocal = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function ConsignacionesPage() {
  const { session } = useAuth()
  return <ConsignacionesWorkspace key={`${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`} />
}

function ConsignacionesWorkspace() {
  const { session } = useAuth()
  const tenantId = session?.user?.tenant_id || ''
  const actorId = session?.user?.id || ''
  const createPermission = usePermission('contabilidad', 'crear', 'consignaciones')
  const updatePermission = usePermission('contabilidad', 'actualizar', 'consignaciones')
  const canCreate = !createPermission.loading && createPermission.hasPermission
  const canUpdate = !updatePermission.loading && updatePermission.hasPermission
  const { get, post } = useApi({ requireLive: true, retries: 0, throwOnError: true, showErrorToast: false })
  const country = useCountryContext()
  const [items, setItems] = useState<Consignacion[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [estado, setEstado] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const latestRead = useRef(0)
  const createIntent = useRef<{ signature: string; key: string } | null>(null)
  const transitionIntent = useRef<{ signature: string; key: string } | null>(null)
  const [form, setForm] = useState({
    numero: '',
    fecha_registro: todayLocal(),
    fecha_entrega: todayLocal(),
    producto_id: '',
    consignatario_nombre: '',
    cantidad: '1',
    valor_unitario: '0',
  })

  const loadData = useCallback(async () => {
    if (!tenantId || !actorId) return
    const request = ++latestRead.current
    setLoading(true)
    setError(null)
    setReadError(null)
    try {
      const query = estado ? `?estado=${encodeURIComponent(estado)}` : ''
      const [consignacionesResponse, productosResponse] = await Promise.all([
        get(`/api/contabilidad/registro-consignaciones${query}`),
        get('/api/contabilidad/registro-consignaciones/productos'),
      ])
      const register = readConsignmentRegister(consignacionesResponse, tenantId, estado)
      const productData = readConsignmentProducts(productosResponse, tenantId)
      if (request !== latestRead.current) return
      setItems(register)
      setProductos(productData)
    } catch (err: any) {
      if (request !== latestRead.current) return
      setItems([]); setProductos([])
      setReadError(err?.message || 'Error al cargar consignaciones')
    } finally {
      if (request === latestRead.current) setLoading(false)
    }
  }, [estado, get, tenantId, actorId])

  useEffect(() => {
    loadData()
    return () => { latestRead.current += 1 }
  }, [loadData])

  const totals = useMemo(() => consignmentTotals(items), [items])
  const formatMoney = (value: number, currency = country.moneda || 'PEN') => new Intl.NumberFormat(country.locale || 'es-PE', { style: 'currency', currency }).format(value || 0)

  const createItem = async (event: FormEvent) => {
    event.preventDefault()
    if (!canCreate || loading || readError || saving || country.loading || country.error || !country.moneda) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...(form.numero.trim() ? { numero: form.numero.trim() } : {}),
        fecha_registro: form.fecha_registro,
        fecha_entrega: form.fecha_entrega,
        ...(form.producto_id ? { producto_id: form.producto_id } : {}),
        consignatario_nombre: form.consignatario_nombre.trim(),
        cantidad: Number(form.cantidad),
        valor_unitario: Number(form.valor_unitario),
        moneda: country.moneda || 'PEN',
      }
      const signature = JSON.stringify(payload)
      if (createIntent.current?.signature !== signature) {
        createIntent.current = { signature, key: crypto.randomUUID() }
      }
      const response = await post('/api/contabilidad/registro-consignaciones', payload, {
        headers: { 'Idempotency-Key': createIntent.current.key },
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar la consignación')
      createIntent.current = null
      setShowForm(false)
      setForm((current) => ({ ...current, numero: '', producto_id: '', consignatario_nombre: '', cantidad: '1', valor_unitario: '0' }))
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Error al registrar la consignación')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (item: Consignacion, nextStatus: string) => {
    if (!canUpdate || !consignmentDestinations(item.estado).includes(nextStatus) || loading || readError || saving) return
    setSaving(true)
    setError(null)
    try {
      const signature = JSON.stringify({ id: item.id, estado: nextStatus })
      if (transitionIntent.current?.signature !== signature) {
        transitionIntent.current = { signature, key: crypto.randomUUID() }
      }
      const response = await post(`/api/contabilidad/registro-consignaciones/${item.id}/estado`, { estado: nextStatus }, {
        headers: { 'Idempotency-Key': transitionIntent.current.key },
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo actualizar el estado')
      transitionIntent.current = null
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Error al actualizar la consignación')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4"><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3"><Boxes className="h-6 w-6 text-primary" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Control de terceros</p><h1 className="mt-1 text-3xl font-bold">Mercadería en consignación</h1><p className="mt-2 text-sm text-muted-foreground">Entrega, venta, devolución y cierre sin confundir propiedad con stock propio.</p></div></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={loadData} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>{canCreate && <Button onClick={() => setShowForm((value) => !value)} disabled={loading || !!readError || saving || country.loading || !!country.error} className="gap-2 bg-blue-600 text-white hover:bg-blue-500"><Plus className="h-4 w-4" />Nueva consignación</Button>}</div>
          </div>
        </section>

        {(error || readError) && <div role="alert" className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0" /><span>{error || readError}</span></div>}

        {showForm && canCreate && (
          <Card className="border-cyan-400/20 bg-card/70">
            <CardHeader><CardTitle className="text-base">Registrar entrega en consignación</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createItem} className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Número</span><input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} placeholder="Autogenerado" className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
                <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Fecha registro *</span><input required type="date" value={form.fecha_registro} onChange={(e) => setForm({ ...form, fecha_registro: e.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
                <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Fecha entrega *</span><input required type="date" value={form.fecha_entrega} onChange={(e) => setForm({ ...form, fecha_entrega: e.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
                <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Producto</span><select value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3"><option value="">Sin producto asociado</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} · ` : ''}{p.nombre}</option>)}</select></label>
                <label className="min-w-0 space-y-2 md:col-span-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Consignatario *</span><input required value={form.consignatario_nombre} onChange={(e) => setForm({ ...form, consignatario_nombre: e.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
                <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Cantidad *</span><input required min="0.001" step="0.001" type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
                <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Valor unitario *</span><input required min="0" step="0.01" type="number" value={form.valor_unitario} onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
                <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4"><Button type="submit" disabled={!canCreate || saving || loading || !!readError || country.loading || !!country.error} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button></div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0 border-cyan-400/20 bg-card/70">
          <CardHeader className="gap-4 border-b border-border sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">Registro operativo</CardTitle><p className="mt-1 text-sm text-muted-foreground">{loading ? 'Cargando registro…' : readError ? 'Registro no disponible' : `${items.length} consignación(es)${totals.map(t => ` · ${formatMoney(t.total,t.moneda)}`).join('')}`}</p></div><select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm"><option value="">Todos los estados</option>{estados.map((value) => <option key={value} value={value}>{value}</option>)}</select></CardHeader>
          <CardContent className="p-0">
            {readError ? <div className="p-6 text-sm text-muted-foreground">Reintente la consulta para ver el registro.</div> : loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
              <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[980px] border-collapse"><thead><tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground"><th className="px-4 py-3">Número / fecha</th><th className="px-4 py-3">Consignatario</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Valor unitario</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id} className="border-b border-border text-sm"><td className="px-4 py-3"><p className="font-semibold">{item.numero}</p><p className="text-xs text-muted-foreground">{item.fecha_registro}</p></td><td className="px-4 py-3">{item.consignatario_nombre}</td><td className="px-4 py-3 text-right">{Number(item.cantidad).toFixed(3)}</td><td className="px-4 py-3 text-right">{formatMoney(item.valor_unitario, item.moneda)}</td><td className="px-4 py-3 text-right font-semibold">{formatMoney(item.valor_total, item.moneda)}</td><td className="px-4 py-3"><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-primary">{item.estado}</span></td><td className="px-4 py-3">{canUpdate && consignmentDestinations(item.estado).length > 0 ? <select aria-label={`Cambiar estado de ${item.numero}`} value={item.estado} disabled={saving || loading || !!readError} onChange={(e) => updateStatus(item, e.target.value)} className="h-9 min-w-[130px] rounded-lg border border-border bg-background px-2 text-xs"><option value={item.estado}>{item.estado}</option>{consignmentDestinations(item.estado).map((value) => <option key={value} value={value}>{value}</option>)}</select> : <span className="text-muted-foreground">{consignmentDestinations(item.estado).length ? 'Sin permiso para cambiar' : 'Estado final'}</span>}</td></tr>) : <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No hay consignaciones para el filtro seleccionado.</td></tr>}</tbody></table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
