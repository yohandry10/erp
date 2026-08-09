'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Centro = { id: string; codigo: string; nombre: string; eje?: string; activo: boolean }
type Distribucion = { centro_costo_id: string; eje: string; porcentaje: number; monto: number }
type Linea = { centro_costo_id: string; porcentaje: string }

type Props = {
  detalleId: string
  cuenta: string
  importe: number
  formatCurrency: (amount: number) => string
  onClose: () => void
}

export function DistribucionAnaliticaPanel({ detalleId, cuenta, importe, formatCurrency, onClose }: Props) {
  const { get, post, del } = useApi()
  const [centros, setCentros] = useState<Centro[]>([])
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([])
  const [eje, setEje] = useState('CENTRO_COSTO')
  const [lineas, setLineas] = useState<Linea[]>([{ centro_costo_id: '', porcentaje: '100' }])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [centrosResponse, distribucionResponse] = await Promise.all([
        get('/api/contabilidad/centros-costo'),
        get(`/api/contabilidad/distribucion-analitica/${detalleId}`),
      ])
      if (!centrosResponse?.success || !distribucionResponse?.success) throw new Error('No se pudo cargar la distribución analítica')
      setCentros((centrosResponse.data || []).filter((centro: Centro) => centro.activo !== false))
      setDistribuciones(distribucionResponse.data || [])
    } catch (err: any) {
      setError(err?.message || 'Error al cargar distribución analítica')
    } finally {
      setLoading(false)
    }
  }, [detalleId, get])

  useEffect(() => {
    loadData()
  }, [loadData])

  const ejes = useMemo(() => {
    const values = new Set(centros.map((centro) => String(centro.eje || 'CENTRO_COSTO').toUpperCase()))
    distribuciones.forEach((item) => values.add(item.eje))
    return [...values]
  }, [centros, distribuciones])

  useEffect(() => {
    const current = distribuciones.filter((item) => item.eje === eje)
    setLineas(current.length ? current.map((item) => ({ centro_costo_id: item.centro_costo_id, porcentaje: String(item.porcentaje) })) : [{ centro_costo_id: '', porcentaje: '100' }])
  }, [distribuciones, eje])

  const centrosDelEje = centros.filter((centro) => String(centro.eje || 'CENTRO_COSTO').toUpperCase() === eje)
  const totalPorcentaje = lineas.reduce((sum, item) => sum + Number(item.porcentaje || 0), 0)
  const valid = lineas.length > 0 && lineas.every((item) => item.centro_costo_id && Number(item.porcentaje) > 0) && Math.abs(totalPorcentaje - 100) <= 0.001 && new Set(lineas.map((item) => item.centro_costo_id)).size === lineas.length

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError(null)
    try {
      const response = await post('/api/contabilidad/distribucion-analitica', {
        detalle_asiento_id: detalleId,
        eje,
        imputaciones: lineas.map((item) => ({ centro_costo_id: item.centro_costo_id, porcentaje: Number(item.porcentaje) })),
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo guardar el reparto')
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Error al guardar distribución analítica')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await del(`/api/contabilidad/distribucion-analitica/${detalleId}?eje=${encodeURIComponent(eje)}`)
      if (!response?.success) throw new Error(response?.message || 'No se pudo eliminar el reparto')
      await loadData()
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar distribución analítica')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="min-w-0 border-cyan-400/25 bg-card/75 text-foreground shadow-xl shadow-blue-950/20">
      <CardHeader className="gap-3 border-b border-cyan-400/10 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><CardTitle className="text-base">Distribución analítica · {cuenta}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Importe de la línea: {formatCurrency(Math.abs(importe))}</p></div><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></CardHeader>
      <CardContent className="space-y-4 p-5">
        {loading ? <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
          <>
            <label className="block max-w-sm space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Eje analítico</span><select value={eje} onChange={(event) => setEje(event.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3">{ejes.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
            {centrosDelEje.length === 0 ? <p className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 text-sm text-amber-700 dark:text-amber-200">No hay destinos activos configurados para el eje {eje.replaceAll('_', ' ')}.</p> : (
              <div className="space-y-3">
                {lineas.map((linea, index) => (
                  <div key={`${index}-${linea.centro_costo_id}`} className="grid min-w-0 gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-end">
                    <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Destino</span><select value={linea.centro_costo_id} onChange={(event) => setLineas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, centro_costo_id: event.target.value } : item))} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3"><option value="">Seleccionar</option>{centrosDelEje.map((centro) => <option key={centro.id} value={centro.id}>{centro.codigo} · {centro.nombre}</option>)}</select></label>
                    <label className="min-w-0 space-y-2"><span className="text-xs font-semibold uppercase text-muted-foreground">Porcentaje</span><input type="number" min="0.0001" max="100" step="0.01" value={linea.porcentaje} onChange={(event) => setLineas((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, porcentaje: event.target.value } : item))} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3" /></label>
                    <Button type="button" variant="outline" disabled={lineas.length === 1} onClick={() => setLineas((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Quitar destino ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="outline" className="gap-2" onClick={() => setLineas((current) => [...current, { centro_costo_id: '', porcentaje: '0' }])}><Plus className="h-4 w-4" />Agregar destino</Button><p className={`text-sm font-semibold ${Math.abs(totalPorcentaje - 100) <= 0.001 ? 'text-emerald-500' : 'text-rose-500'}`}>Total: {totalPorcentaje.toFixed(2)}%</p></div>
              </div>
            )}
            {error && <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
            <div className="flex flex-wrap gap-2"><Button type="button" onClick={save} disabled={!valid || saving} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar reparto</Button>{distribuciones.some((item) => item.eje === eje) && <Button type="button" variant="outline" onClick={remove} disabled={saving} className="gap-2"><Trash2 className="h-4 w-4" />Eliminar eje</Button>}</div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
