'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseDateLocal } from '@/lib/date-utils'
import { AlertCircle, Link2, Loader2, RefreshCw } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Cuenta {
  id: string
  codigo: string
  nombre: string
  conciliable?: boolean
}

interface Partida {
  detalle_id: string
  asiento_id: string
  numero_asiento?: string | number
  fecha: string
  concepto?: string
  referencia?: string
  debe: number
  haber: number
  monto_conciliado: number
  pendiente: number
}

interface Resumen {
  cuenta_id: string
  total_deudor: number
  total_acreedor: number
  saldo_abierto: number
  partidas: Partida[]
}

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function PartidasAbiertasPage() {
  const { get, post } = useApi()

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cuentaId, setCuentaId] = useState('')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [conciliando, setConciliando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargarCuentas = useCallback(async () => {
    try {
      const response = await get('/api/contabilidad/plan-cuentas')
      if (response?.success) {
        setCuentas((response.data || []).filter((cuenta: Cuenta) => cuenta.conciliable))
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar el plan de cuentas')
    }
  }, [get])

  useEffect(() => {
    cargarCuentas()
  }, [cargarCuentas])

  const cargarPartidas = useCallback(async () => {
    if (!cuentaId) return
    try {
      setLoading(true)
      setError(null)
      setSeleccion([])

      const response = await get(`/api/contabilidad/partidas-abiertas?cuenta_id=${cuentaId}`)
      if (!response?.success) throw new Error(response?.message || 'No se pudo cargar')
      setResumen(response.data)
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar las partidas abiertas')
      setResumen(null)
    } finally {
      setLoading(false)
    }
  }, [cuentaId, get])

  const alternar = (detalleId: string) => {
    setSeleccion((actual) =>
      actual.includes(detalleId)
        ? actual.filter((id) => id !== detalleId)
        : [...actual, detalleId]
    )
  }

  const seleccionadas = (resumen?.partidas ?? []).filter((p) =>
    seleccion.includes(p.detalle_id)
  )
  const netoSeleccion = seleccionadas.reduce((sum, p) => sum + p.pendiente, 0)
  const hayAmbosLados =
    seleccionadas.some((p) => p.pendiente > 0) && seleccionadas.some((p) => p.pendiente < 0)

  const conciliar = async () => {
    try {
      setConciliando(true)
      setError(null)
      setAviso(null)

      const response = await post('/api/contabilidad/conciliaciones-partidas', {
        detalle_ids: seleccion,
      })
      if (!response?.success) throw new Error(response?.message || 'No se pudo conciliar')

      setAviso(
        `Conciliación ${response.data.estado} por ${money(response.data.monto_conciliado)}.` +
          (response.data.estado === 'PARCIAL'
            ? ` Queda abierto ${money(Math.abs(response.data.saldo_no_conciliado))}.`
            : '')
      )
      await cargarPartidas()
    } catch (err: any) {
      setError(err.message || 'No se pudo conciliar')
    } finally {
      setConciliando(false)
    }
  }

  const money = (valor: number) =>
    new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      valor || 0
    )

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
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
              <Link2 className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Partidas abiertas
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Case los apuntes de una cuenta de terceros entre sí para saber qué sigue pendiente.
                Si los importes no coinciden, la conciliación es parcial y el resto queda abierto.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[280px]">
              <label htmlFor="partidas-cuenta-conciliable" className={labelClass}>Cuenta conciliable</label>
              <select id="partidas-cuenta-conciliable"
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="mt-2 w-full rounded-xl border border-cyan-400/20 bg-card/70 px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10"
              >
                <option value="">Seleccione una cuenta…</option>
                {cuentas.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.codigo} — {cuenta.nombre}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              onClick={cargarPartidas}
              disabled={!cuentaId || loading}
              variant="outline"
              className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Ver partidas
            </Button>
            <Button
              type="button"
              onClick={conciliar}
              disabled={conciliando || seleccion.length < 2 || !hayAmbosLados}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500 disabled:bg-muted"
            >
              {conciliando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Conciliar {seleccion.length > 0 ? `(${seleccion.length})` : ''}
            </Button>
            {seleccion.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {hayAmbosLados
                  ? `Neto de la selección: ${money(netoSeleccion)}`
                  : 'Seleccione partidas de los dos lados: cargos y abonos.'}
              </p>
            )}
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium text-primary">{error}</p>
          </div>
        )}

        {aviso && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
            <p className="text-sm font-medium text-primary">{aviso}</p>
          </div>
        )}

        {resumen && (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              {[
                ['Total deudor abierto', resumen.total_deudor],
                ['Total acreedor abierto', resumen.total_acreedor],
                ['Saldo abierto', resumen.saldo_abierto],
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
                <CardTitle className="text-base text-foreground">
                  Partidas sin casar ({resumen.partidas.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse">
                    <thead className="bg-cyan-400/10">
                      <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                        <th className="px-4 py-3" />
                        <th className="px-4 py-3">Asiento</th>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Concepto</th>
                        <th className="px-4 py-3 text-right">Debe</th>
                        <th className="px-4 py-3 text-right">Haber</th>
                        <th className="px-4 py-3 text-right">Aplicado</th>
                        <th className="px-4 py-3 text-right">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.partidas.length > 0 ? (
                        resumen.partidas.map((partida) => (
                          <tr
                            key={partida.detalle_id}
                            className={`border-b border-cyan-400/10 text-sm text-foreground/90 ${
                              seleccion.includes(partida.detalle_id) ? 'bg-cyan-400/5' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              <input aria-label="Includes"
                                type="checkbox"
                                checked={seleccion.includes(partida.detalle_id)}
                                onChange={() => alternar(partida.detalle_id)}
                                className="size-4 accent-blue-600"
                              />
                            </td>
                            <td className="px-4 py-3 font-semibold text-primary/80">
                              {partida.numero_asiento ?? '—'}
                            </td>
                            <td className="px-4 py-3">{formatFecha(partida.fecha)}</td>
                            <td className="px-4 py-3">{partida.concepto || partida.referencia || '—'}</td>
                            <td className="px-4 py-3 text-right">
                              {partida.debe > 0 ? money(partida.debe) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {partida.haber > 0 ? money(partida.haber) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {partida.monto_conciliado > 0 ? money(partida.monto_conciliado) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-primary">
                              {money(partida.pendiente)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No hay partidas abiertas en esta cuenta.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
