'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { AlertCircle, Building2, CalendarClock, Loader2, RefreshCw, TrendingDown } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ActivoFijo {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  fecha_adquisicion: string
  valor_adquisicion: number
  valor_residual: number
  vida_util_meses: number
  depreciacion_acumulada: number
  valor_neto: number
  situacion: 'ACTIVO' | 'DEPRECIADO' | 'BAJA' | 'VENDIDO'
  fecha_baja?: string
}

interface ResultadoDepreciacion {
  periodo: string
  activos_depreciados: number
  total_depreciado: number
  omitidos?: Array<{ activo_id: string; codigo?: string; motivo: string }>
}

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function ActivosFijosPage() {
  const { get, post } = useApi()

  const [activos, setActivos] = useState<ActivoFijo[]>([])
  const [loading, setLoading] = useState(true)
  const [depreciando, setDepreciando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDepreciacion | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ahora = new Date()
  const [anio, setAnio] = useState(ahora.getFullYear())
  const [mes, setMes] = useState(ahora.getMonth() + 1)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await get('/api/contabilidad/activos-fijos')
      if (response?.success) setActivos(response.data || [])
    } catch (err: any) {
      setError(err.message || 'Error al cargar los activos fijos')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    cargar()
  }, [cargar])

  const depreciar = async () => {
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`
    if (!confirm(`Se registrará la depreciación del período ${periodo}. ¿Continuar?`)) return

    try {
      setDepreciando(true)
      setError(null)
      setResultado(null)

      const response = await post('/api/contabilidad/activos-fijos/depreciar', { anio, mes })
      if (!response?.success) throw new Error(response?.message || 'No se pudo depreciar')

      setResultado(response.data)
      await cargar()
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar la depreciación')
    } finally {
      setDepreciando(false)
    }
  }

  const money = (valor: number) =>
    new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      valor || 0
    )

  const formatFecha = (fecha?: string) =>
    fecha
      ? parseDateLocal(String(fecha).slice(0, 10))?.toLocaleDateString('es-PE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }) ?? fecha
      : '—'

  const totales = activos.reduce(
    (acc, activo) => ({
      adquisicion: acc.adquisicion + Number(activo.valor_adquisicion || 0),
      acumulada: acc.acumulada + Number(activo.depreciacion_acumulada || 0),
      neto: acc.neto + Number(activo.valor_neto || 0),
    }),
    { adquisicion: 0, acumulada: 0, neto: 0 }
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
                <Building2 className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Activos fijos</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Registro de bienes con su vida útil y depreciación acumulada. La depreciación del
                  período genera el asiento por la cadena contable de eventos.
                </p>
              </div>
            </div>
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

          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-4">
            <div>
              <label className={labelClass}>Año</label>
              <input
                type="number"
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="mt-2 w-28 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <div>
              <label className={labelClass}>Mes</label>
              <input
                type="number"
                min={1}
                max={12}
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                className="mt-2 w-24 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <Button
              type="button"
              onClick={depreciar}
              disabled={depreciando}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {depreciando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4" />
              )}
              Depreciar período
            </Button>
            <p className="text-xs text-muted-foreground">
              Un activo deprecia una sola vez por período; repetir la operación no duplica la cuota.
            </p>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        {resultado && (
          <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <TrendingDown className="h-5 w-5 text-primary" />
                Depreciación del período {resultado.periodo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-foreground/90">
                {resultado.activos_depreciados} activo(s) depreciado(s) por un total de{' '}
                <span className="font-bold">{money(resultado.total_depreciado)}</span>.
              </p>
              {resultado.omitidos && resultado.omitidos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                    Omitidos ({resultado.omitidos.length})
                  </p>
                  {resultado.omitidos.map((omitido) => (
                    <div
                      key={omitido.activo_id}
                      className="rounded-xl border border-cyan-400/15 bg-card/70 p-3 text-sm"
                    >
                      <span className="font-semibold text-primary/80">
                        {omitido.codigo || omitido.activo_id}
                      </span>
                      <p className="mt-1 text-foreground/90">{omitido.motivo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ['Valor de adquisición', totales.adquisicion],
            ['Depreciación acumulada', totales.acumulada],
            ['Valor neto en libros', totales.neto],
          ].map(([label, valor]: any) => (
            <div key={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                {label}
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{money(valor)}</div>
            </div>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Registro de activos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[160px] items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando activos...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Activo</th>
                      <th className="px-4 py-3">Adquisición</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-right">Vida útil</th>
                      <th className="px-4 py-3 text-right">Acumulada</th>
                      <th className="px-4 py-3 text-right">Neto</th>
                      <th className="px-4 py-3">Situación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activos.length > 0 ? (
                      activos.map((activo) => (
                        <tr
                          key={activo.id}
                          className="border-b border-cyan-400/10 text-sm text-foreground/90"
                        >
                          <td className="px-4 py-3 font-semibold text-primary/80">{activo.codigo}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{activo.nombre}</div>
                            {activo.descripcion && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {activo.descripcion}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">{formatFecha(activo.fecha_adquisicion)}</td>
                          <td className="px-4 py-3 text-right">{money(activo.valor_adquisicion)}</td>
                          <td className="px-4 py-3 text-right">{activo.vida_util_meses} meses</td>
                          <td className="px-4 py-3 text-right">
                            {money(activo.depreciacion_acumulada)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-primary">
                            {money(activo.valor_neto)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                              {activo.situacion}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Todavía no hay activos registrados.
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
