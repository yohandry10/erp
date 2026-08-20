'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Calculator, CheckCircle, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Posicion {
  tipo: 'CXC' | 'CXP'
  documento_id: string
  referencia?: string
  moneda: string
  saldo_moneda_origen: number
  tipo_cambio_origen: number
  tipo_cambio_cierre: number
  valor_contabilizado: number
  valor_a_cierre: number
  diferencia: number
}

interface Revaluacion {
  fecha: string
  moneda_local: string
  posiciones: Posicion[]
  total_ganancia: number
  total_perdida: number
  diferencia_neta: number
  excluidas?: Array<{ tipo: string; documento_id: string; motivo: string }>
  asiento_id?: string
  numero_asiento?: string | number
}

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function RevaluacionPage() {
  const router = useRouter()
  const { get, post } = useApi()

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [resultado, setResultado] = useState<Revaluacion | null>(null)
  const [simulando, setSimulando] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const simular = useCallback(async () => {
    try {
      setSimulando(true)
      setError(null)
      setResultado(null)

      const response = await get(`/api/contabilidad/revaluacion/simular?fecha=${fecha}`)
      if (!response?.success) throw new Error(response?.message || 'No se pudo simular')
      setResultado(response.data)
    } catch (err: any) {
      setError(err.message || 'No se pudo simular la revaluación')
    } finally {
      setSimulando(false)
    }
  }, [fecha, get])

  const ejecutar = async () => {
    if (!confirm(`Se generará el asiento de diferencia de cambio al ${fecha}. ¿Continuar?`)) return

    try {
      setEjecutando(true)
      setError(null)

      const response = await post('/api/contabilidad/revaluacion', { fecha })
      if (!response?.success) throw new Error(response?.message || 'No se pudo ejecutar')

      if (response.data?.asiento_id) {
        router.push(`/dashboard/contabilidad/asientos/${response.data.asiento_id}`)
        return
      }
      setResultado(response.data)
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar la revaluación')
    } finally {
      setEjecutando(false)
    }
  }

  const money = (valor: number) =>
    new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
              <Calculator className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Diferencia de cambio
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Revalúa los saldos por cobrar y por pagar en moneda extranjera a una fecha de corte.
                Simule primero: nada se escribe hasta que registre el asiento.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="revaluacion-fecha-de-corte" className={labelClass}>Fecha de corte</label>
              <input id="revaluacion-fecha-de-corte"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-2 rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              />
            </div>
            <Button
              type="button"
              onClick={simular}
              disabled={simulando}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
            >
              {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Simular
            </Button>
            <Button
              type="button"
              onClick={ejecutar}
              disabled={ejecutando || !resultado || resultado.posiciones.length === 0}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {ejecutando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Registrar asiento
            </Button>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        {resultado && (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              {[
                ['Ganancia', resultado.total_ganancia, TrendingUp],
                ['Pérdida', resultado.total_perdida, TrendingDown],
                ['Efecto neto', resultado.diferencia_neta, Calculator],
              ].map(([label, valor, Icon]: any) => (
                <div key={label} className="rounded-2xl border border-cyan-400/20 bg-card/70 p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                    <Icon className="h-4 w-4" />
                    {label}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">
                    {resultado.moneda_local} {money(valor)}
                  </div>
                </div>
              ))}
            </section>

            <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className="text-base text-foreground">
                  Posiciones revaluadas al {resultado.fecha}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse">
                    <thead className="bg-cyan-400/10">
                      <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Referencia</th>
                        <th className="px-4 py-3 text-right">Saldo</th>
                        <th className="px-4 py-3 text-right">TC origen</th>
                        <th className="px-4 py-3 text-right">TC cierre</th>
                        <th className="px-4 py-3 text-right">Contabilizado</th>
                        <th className="px-4 py-3 text-right">A cierre</th>
                        <th className="px-4 py-3 text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.posiciones.length > 0 ? (
                        resultado.posiciones.map((posicion) => (
                          <tr
                            key={`${posicion.tipo}-${posicion.documento_id}`}
                            className="border-b border-cyan-400/10 text-sm text-foreground/90"
                          >
                            <td className="px-4 py-3 font-semibold text-primary/80">{posicion.tipo}</td>
                            <td className="px-4 py-3">{posicion.referencia || posicion.documento_id}</td>
                            <td className="px-4 py-3 text-right">
                              {posicion.moneda} {money(posicion.saldo_moneda_origen)}
                            </td>
                            <td className="px-4 py-3 text-right">{posicion.tipo_cambio_origen}</td>
                            <td className="px-4 py-3 text-right">{posicion.tipo_cambio_cierre}</td>
                            <td className="px-4 py-3 text-right">{money(posicion.valor_contabilizado)}</td>
                            <td className="px-4 py-3 text-right">{money(posicion.valor_a_cierre)}</td>
                            <td className="px-4 py-3 text-right font-bold text-primary">
                              {money(posicion.diferencia)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No hay diferencia de cambio que registrar a esta fecha.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {resultado.excluidas && resultado.excluidas.length > 0 && (
              <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
                <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                  <CardTitle className="text-base text-foreground">
                    Posiciones excluidas ({resultado.excluidas.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 p-5">
                  {resultado.excluidas.map((excluida) => (
                    <div
                      key={`${excluida.tipo}-${excluida.documento_id}`}
                      className="rounded-xl border border-cyan-400/15 bg-card/70 p-3 text-sm"
                    >
                      <span className="font-semibold text-primary/80">{excluida.tipo}</span>{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {excluida.documento_id}
                      </span>
                      <p className="mt-1 text-foreground/90">{excluida.motivo}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
