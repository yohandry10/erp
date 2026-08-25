'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { AlertCircle, Coins, Loader2, PlusCircle, RefreshCw, Trash2, Download } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TipoCambio {
  id: string
  moneda_origen: string
  moneda_destino: string
  fecha: string
  compra: number
  venta: number
  fuente: string
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

const hoy = () => new Date().toISOString().slice(0, 10)

export default function TiposCambioPage() {
  const { get, post, del } = useApi()

  const [tipos, setTipos] = useState<TipoCambio[]>([])
  const [monedaLocal, setMonedaLocal] = useState('PEN')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importando, setImportando] = useState(false)
  const [avisoImportacion, setAvisoImportacion] = useState<string | null>(null)

  const [form, setForm] = useState({
    moneda_origen: 'USD',
    fecha: hoy(),
    compra: '',
    venta: '',
    fuente: 'SUNAT',
  })

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [listado, local] = await Promise.all([
        get('/api/contabilidad/tipos-cambio'),
        get('/api/contabilidad/moneda-local'),
      ])

      if (listado?.success) setTipos(listado.data || [])
      if (local?.success && local.data?.moneda) setMonedaLocal(local.data.moneda)
    } catch (err: any) {
      setError(err.message || 'Error al cargar los tipos de cambio')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    cargar()
  }, [cargar])

  /**
   * Trae la cotización oficial del día. No la impone: lo que no pase el
   * contraste contra la última conocida no se guarda y se dice por qué, porque
   * la fuente no es la SBS directamente --publica en una página, no en un
   * servicio-- y ya se ha visto devolver un dato corrupto.
   */
  const importar = async () => {
    try {
      setImportando(true)
      setError(null)
      setAvisoImportacion(null)

      // La fecha del calendario de quien mira, no la del meridiano de Greenwich:
      // a las 20:00 en Lima `toISOString()` ya devuelve el día siguiente y se
      // pediría una cotización que aún no existe.
      const ahora = new Date()
      const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
        ahora.getDate(),
      ).padStart(2, '0')}`
      const response = await post(
        `/api/contabilidad/tipos-cambio/importar?desde=${form.fecha || hoy}`,
        {},
      )

      if (!response?.success) throw new Error(response?.message || 'No se pudo importar')

      const guardados = Number(response.data?.guardados ?? 0)
      const omitidos: Array<{ fecha: string; motivo?: string }> = response.data?.omitidos ?? []

      if (guardados > 0) {
        setAvisoImportacion(`Se importó la cotización del ${form.fecha || hoy}.`)
      } else {
        const motivo = omitidos[0]?.motivo ?? 'la fuente no devolvió una cotización utilizable'
        setAvisoImportacion(`No se importó nada: ${motivo}`)
      }

      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo importar el tipo de cambio')
    } finally {
      setImportando(false)
    }
  }

  const registrar = async () => {
    if (!form.compra && !form.venta) {
      setError('Informe al menos una cotización: compra o venta.')
      return
    }

    try {
      setGuardando(true)
      setError(null)

      const response = await post('/api/contabilidad/tipos-cambio', {
        moneda_origen: form.moneda_origen.toUpperCase(),
        moneda_destino: monedaLocal,
        fecha: form.fecha,
        ...(form.compra ? { compra: Number(form.compra) } : {}),
        ...(form.venta ? { venta: Number(form.venta) } : {}),
        fuente: form.fuente,
      })

      if (!response?.success) throw new Error(response?.message || 'No se pudo registrar')

      setForm({ ...form, compra: '', venta: '' })
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar el tipo de cambio')
    } finally {
      setGuardando(false)
    }
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta cotización?')) return
    try {
      setError(null)
      await del(`/api/contabilidad/tipos-cambio/${id}`)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo eliminar la cotización')
    }
  }

  const formatFecha = (fecha: string) =>
    parseDateLocal(String(fecha).slice(0, 10))?.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) ?? fecha

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <Coins className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Tipos de cambio</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Cotizaciones contra la moneda local ({monedaLocal}). Los activos se valúan al tipo
                  de cambio compra y los pasivos al de venta.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={importar}
                disabled={importando}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                {importando ? 'Importando…' : 'Importar oficial'}
              </Button>
              <Button
                type="button"
                onClick={cargar}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
            </div>
          </div>
        </section>

        {avisoImportacion && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {avisoImportacion}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Registrar cotización</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 md:grid-cols-5">
            <div>
              <label htmlFor="tipos-cambio-moneda" className={labelClass}>Moneda</label>
              <input id="tipos-cambio-moneda"
                value={form.moneda_origen}
                onChange={(e) => setForm({ ...form, moneda_origen: e.target.value })}
                maxLength={3}
                className={`${inputClass} mt-2 uppercase`}
                placeholder="USD"
              />
            </div>
            <div>
              <label htmlFor="tipos-cambio-fecha" className={labelClass}>Fecha</label>
              <input id="tipos-cambio-fecha"
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className={`${inputClass} mt-2`}
              />
            </div>
            <div>
              <label htmlFor="tipos-cambio-compra" className={labelClass}>Compra</label>
              <input id="tipos-cambio-compra"
                type="number"
                step="0.000001"
                value={form.compra}
                onChange={(e) => setForm({ ...form, compra: e.target.value })}
                className={`${inputClass} mt-2`}
                placeholder="3.742"
              />
            </div>
            <div>
              <label htmlFor="tipos-cambio-venta" className={labelClass}>Venta</label>
              <input id="tipos-cambio-venta"
                type="number"
                step="0.000001"
                value={form.venta}
                onChange={(e) => setForm({ ...form, venta: e.target.value })}
                className={`${inputClass} mt-2`}
                placeholder="3.749"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                onClick={registrar}
                disabled={guardando}
                className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
              >
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                Registrar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-5">
              Si informa solo un lado, se replica en el otro. Volver a registrar el mismo par y fecha
              reemplaza la cotización anterior.
            </p>
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Cotizaciones registradas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando cotizaciones...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <th className="px-4 py-3">Par</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3 text-right">Compra</th>
                      <th className="px-4 py-3 text-right">Venta</th>
                      <th className="px-4 py-3">Fuente</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {tipos.length > 0 ? (
                      tipos.map((tipo) => (
                        <tr key={tipo.id} className="border-b border-cyan-400/10 text-sm text-foreground/90">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {tipo.moneda_origen} / {tipo.moneda_destino}
                          </td>
                          <td className="px-4 py-3">{formatFecha(tipo.fecha)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">
                            {Number(tipo.compra).toFixed(6)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-primary dark:text-blue-200">
                            {Number(tipo.venta).toFixed(6)}
                          </td>
                          <td className="px-4 py-3">{tipo.fuente}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              onClick={() => eliminar(tipo.id)}
                              variant="outline"
                              className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Todavía no hay cotizaciones registradas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
