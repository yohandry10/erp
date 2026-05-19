'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Calendar, Lock, Loader2, PlusCircle, RefreshCw, Unlock } from 'lucide-react'
import PeriodoCierreWizard from '@/components/contabilidad/PeriodoCierreWizard'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Periodo {
  id: string
  tenant_id: string
  anio: number
  mes: number
  estado: 'ABIERTO' | 'CERRADO' | 'BLOQUEADO'
  fecha_cierre?: string
  cerrado_por?: string
  created_at: string
  updated_at: string
}

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

export default function PeriodosPage() {
  const router = useRouter()
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [selectedPeriodo, setSelectedPeriodo] = useState<Periodo | null>(null)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  const fetchPeriodos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await apiCall('/contabilidad/periodos')
      const periodosData = result?.data || []
      const sorted = [...periodosData].sort((a: Periodo, b: Periodo) => {
        if (a.anio !== b.anio) return b.anio - a.anio
        return b.mes - a.mes
      })

      setPeriodos(sorted)
    } catch (err) {
      console.error('Error fetching periodos:', err)
      setError('Error al cargar los periodos contables')
    } finally {
      setLoading(false)
    }
  }, [apiCall])

  useEffect(() => {
    fetchPeriodos()
  }, [fetchPeriodos])

  const formatPeriodo = (anio: number, mes: number) => {
    const meses = [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ]
    return `${meses[mes - 1]} ${anio}`
  }

  const getEstadoIcon = (estado: string) => {
    if (estado === 'ABIERTO') return Unlock
    if (estado === 'CERRADO') return Lock
    return AlertCircle
  }

  const getEstadoBadge = (estado: string) => {
    const Icon = getEstadoIcon(estado)
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
        <Icon className="h-4 w-4" />
        {estado}
      </span>
    )
  }

  const stats = [
    ['Total periodos', periodos.length],
    ['Abiertos', periodos.filter((p) => p.estado === 'ABIERTO').length],
    ['Cerrados', periodos.filter((p) => p.estado === 'CERRADO').length],
    ['Bloqueados', periodos.filter((p) => p.estado === 'BLOQUEADO').length],
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-slate-950/70 text-slate-100">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
            <span className="text-sm font-medium text-slate-300">Cargando periodos contables...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-100">
                <Calendar className="h-6 w-6" />
              </span>
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  ERP Period Control
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Periodos Contables</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Control de apertura, cierre y bloqueo por mes fiscal.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={fetchPeriodos}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button
                type="button"
                onClick={() => router.push('/dashboard/contabilidad/periodos/nuevo')}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
              >
                <PlusCircle className="h-4 w-4" />
                Crear periodo
              </Button>
            </div>
          </div>
        </section>

        {error && (
          <Card className="border-cyan-400/20 bg-cyan-400/10 text-cyan-50">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3 text-sm font-medium">
                <AlertCircle className="h-5 w-5" />
                {error}
              </div>
              <Button type="button" onClick={fetchPeriodos} className="bg-blue-600 text-white hover:bg-blue-500">
                Reintentar
              </Button>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(([label, value]) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="p-4">
                <div className={labelClass}>{label}</div>
                <div className="mt-3 text-3xl font-bold text-white">{value}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="overflow-hidden border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Calendario contable</CardTitle>
            <p className="text-xs text-slate-400">Periodos ordenados por ano y mes descendente.</p>
          </CardHeader>
          <CardContent className="p-0">
            {periodos.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                  <Calendar className="h-10 w-10 text-cyan-100" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">No hay periodos contables</h3>
                  <p className="mt-2 text-sm text-slate-400">Crea el primer periodo para habilitar control de cierre.</p>
                </div>
                <Button
                  type="button"
                  onClick={() => router.push('/dashboard/contabilidad/periodos/nuevo')}
                  className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
                >
                  <PlusCircle className="h-4 w-4" />
                  Crear periodo
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">
                      <th className="px-4 py-3">Periodo</th>
                      <th className="px-4 py-3">Ano</th>
                      <th className="px-4 py-3">Mes</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fecha cierre</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodos.map((periodo) => (
                      <tr key={periodo.id} className="border-b border-cyan-400/10 text-sm text-slate-200 transition hover:bg-cyan-400/10">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="rounded-lg border border-cyan-400/15 bg-cyan-400/10 p-2 text-cyan-100">
                              <Calendar className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block font-semibold text-white">{formatPeriodo(periodo.anio, periodo.mes)}</span>
                              <span className="font-mono text-xs text-slate-500">{periodo.id.substring(0, 8)}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{periodo.anio}</td>
                        <td className="px-4 py-3 font-semibold text-white">{String(periodo.mes).padStart(2, '0')}</td>
                        <td className="px-4 py-3">{getEstadoBadge(periodo.estado)}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {periodo.fecha_cierre
                            ? new Date(periodo.fecha_cierre).toLocaleDateString('es-PE', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {periodo.estado === 'ABIERTO' && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setSelectedPeriodo(periodo)
                                  setShowWizard(true)
                                }}
                                className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
                              >
                                <Lock className="h-4 w-4" />
                                Cerrar
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/dashboard/contabilidad/periodos/${periodo.id}`)}
                              className="border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white"
                            >
                              Ver detalle
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardContent className="grid gap-3 p-5 md:grid-cols-3">
            {[
              ['Abierto', 'Permite registrar asientos y operaciones del mes.'],
              ['Cerrado', 'Impide nuevos movimientos contables ordinarios.'],
              ['Bloqueado', 'Restringe el periodo para revisión o auditoria.'],
            ].map(([title, description]) => (
              <div key={title} className="rounded-xl border border-cyan-400/15 bg-white/[0.03] p-4">
                <div className="text-sm font-bold text-white">{title}</div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {showWizard && selectedPeriodo && (
          <PeriodoCierreWizard
            periodoId={selectedPeriodo.id}
            anio={selectedPeriodo.anio}
            mes={selectedPeriodo.mes}
            onClose={() => {
              setShowWizard(false)
              setSelectedPeriodo(null)
            }}
            onSuccess={() => {
              setShowWizard(false)
              setSelectedPeriodo(null)
              fetchPeriodos()
            }}
          />
        )}
      </div>
    </div>
  )
}
