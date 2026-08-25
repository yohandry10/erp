'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Boxes, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useCountryContext } from '@/hooks/use-country-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Consignacion = {
  id: string
  numero: string
  fecha_registro: string
  fecha_entrega?: string
  consignatario_nombre: string
  cantidad: number
  valor_unitario: number
  valor_total: number
  moneda: string
  estado: string
  producto_id?: string
}

type Producto = { id: string; codigo?: string; nombre: string }

const estados = ['PENDIENTE', 'VENDIDA', 'DEVUELTA', 'CERRADA', 'ANULADA']
const todayLocal = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export default function ConsignacionesPage() {
  const { get, post } = useApi()
  const country = useCountryContext()
  const [items, setItems] = useState<Consignacion[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [estado, setEstado] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    setLoading(true)
    setError(null)
    try {
      const query = estado ? `?estado=${encodeURIComponent(estado)}` : ''
      const [consignacionesResponse, productosResponse] = await Promise.all([
        get(`/api/contabilidad/registro-consignaciones${query}`),
        get('/api/inventario/productos'),
      ])
      if (!consignacionesResponse?.success) throw new Error(consignacionesResponse?.message || 'No se pudo cargar el registro')
      setItems(Array.isArray(consignacionesResponse.data) ? consignacionesResponse.data : [])
      const productData = productosResponse?.data?.productos ?? productosResponse?.data ?? productosResponse ?? []
      setProductos(Array.isArray(productData) ? productData : [])
    } catch (err: any) {
      setError(err?.message || 'Error al cargar consignaciones')
    } finally {
      setLoading(false)
    }
  }, [estado, get])

  useEffect(() => {
    loadData()
  }, [loadData])

  const total = useMemo(() => items.reduce((sum, item) => sum + Number(item.valor_total || 0), 0), [items])
  const formatMoney = (value: number, currency = country.moneda || 'PEN') => new Intl.NumberFormat(country.locale || 'es-PE', { style: 'currency', currency }).format(value || 0)

  const createItem = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await post('/api/contabilidad/registro-consignaciones', {
        ...(form.numero.trim() ? { numero: form.numero.trim() } : {}),
        fecha_registro: form.fecha_registro,
        fecha_entrega: form.fecha_entrega,
        ...(form.producto_id ? { producto_id: form.producto_id } : {}),
        consignatario_nombre: form.consignatario_nombre.trim(),
        cantidad: Number(form.cantidad),
        valor_unitario: Number(form.valor_unitario),
        moneda: country.moneda || 'PEN',
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar la consignación')
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
    setSaving(true)
    setError(null)
    try {
      const response = await post(`/api/contabilidad/registro-consignaciones/${item.id}/estado`, { estado: nextStatus })
      if (!response?.success) throw new Error(response?.message || 'No se pudo actualizar el estado')
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
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={loadData} disabled={loading} className="gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button><Button onClick={() => setShowForm((value) => !value)} className="gap-2 bg-blue-600 text-white hover:bg-blue-500"><Plus className="h-4 w-4" />Nueva consignación</Button></div>
          </div>
        </section>

        {error && <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0" /><span>{error}</span></div>}

        {showForm && (
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
                <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4"><Button type="submit" disabled={saving} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button></div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="min-w-0 border-cyan-400/20 bg-card/70">
          <CardHeader className="gap-4 border-b border-border sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-base">Registro operativo</CardTitle><p className="mt-1 text-sm text-muted-foreground">{items.length} consignación(es) · {formatMoney(total)}</p></div><select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm"><option value="">Todos los estados</option>{estados.map((value) => <option key={value} value={value}>{value}</option>)}</select></CardHeader>
          <CardContent className="p-0">
            {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
              <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[980px] border-collapse"><thead><tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground"><th className="px-4 py-3">Número / fecha</th><th className="px-4 py-3">Consignatario</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Valor unitario</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead><tbody>{items.length ? items.map((item) => <tr key={item.id} className="border-b border-border text-sm"><td className="px-4 py-3"><p className="font-semibold">{item.numero}</p><p className="text-xs text-muted-foreground">{item.fecha_registro}</p></td><td className="px-4 py-3">{item.consignatario_nombre}</td><td className="px-4 py-3 text-right">{Number(item.cantidad).toFixed(3)}</td><td className="px-4 py-3 text-right">{formatMoney(item.valor_unitario, item.moneda)}</td><td className="px-4 py-3 text-right font-semibold">{formatMoney(item.valor_total, item.moneda)}</td><td className="px-4 py-3"><span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-primary">{item.estado}</span></td><td className="px-4 py-3"><select aria-label={`Cambiar estado de ${item.numero}`} value={item.estado} disabled={saving} onChange={(e) => updateStatus(item, e.target.value)} className="h-9 min-w-[130px] rounded-lg border border-border bg-background px-2 text-xs">{estados.map((value) => <option key={value} value={value}>{value}</option>)}</select></td></tr>) : <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No hay consignaciones para el filtro seleccionado.</td></tr>}</tbody></table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
