'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { AlertCircle, BarChart3, Building2, CheckCircle, Edit, Filter, Loader2, Plus, RefreshCw, Search, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface CentroCosto {
  id: string
  tenant_id: string
  codigo: string
  nombre: string
  descripcion?: string
  activo: boolean
  created_at: string
  updated_at: string
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

export default function CentrosCostoPage() {
  const router = useRouter()
  const { get } = useApi()

  const [centros, setCentros] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS')

  const loadCentrosCosto = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await get('/api/contabilidad/centros-costo')

      if (response?.success && response.data) {
        setCentros(response.data)
      } else {
        setError('No se pudieron cargar los centros de costo')
      }
    } catch (err: any) {
      console.error('Error loading centros de costo:', err)
      setError(err.message || 'Error al cargar los centros de costo')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadCentrosCosto()
  }, [loadCentrosCosto])

  const getEstadoBadge = (activo: boolean) => {
    const Icon = activo ? CheckCircle : XCircle
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
        <Icon className="h-3 w-3" />
        {activo ? 'Activo' : 'Inactivo'}
      </span>
    )
  }

  const filteredCentros = centros.filter((centro) => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesSearch =
        centro.codigo.toLowerCase().includes(search) ||
        centro.nombre.toLowerCase().includes(search) ||
        (centro.descripcion && centro.descripcion.toLowerCase().includes(search))

      if (!matchesSearch) return false
    }

    if (estadoFilter !== 'TODOS') {
      if (estadoFilter === 'ACTIVO' && !centro.activo) return false
      if (estadoFilter === 'INACTIVO' && centro.activo) return false
    }

    return true
  })

  const stats = {
    total: centros.length,
    activos: centros.filter((c) => c.activo).length,
    inactivos: centros.filter((c) => !c.activo).length,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-slate-950/70 text-slate-100">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
            <span className="text-sm font-medium text-slate-300">Cargando centros de costo...</span>
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
                <Building2 className="h-6 w-6" />
              </span>
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  ERP Cost Center
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Centros de Costo</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Control presupuestal y análisis de gastos por unidad operativa.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={loadCentrosCosto}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button
                type="button"
                onClick={() => router.push('/dashboard/contabilidad/centros-costo/nuevo')}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                Nuevo centro
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            ['Total centros', stats.total],
            ['Activos', stats.activos],
            ['Inactivos', stats.inactivos],
          ].map(([label, value]) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="p-4">
                <div className={labelClass}>{label}</div>
                <div className="mt-3 text-3xl font-bold text-white">{value}</div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <Filter className="h-5 w-5 text-cyan-200" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-end">
            <label className="space-y-2">
              <span className={labelClass}>Buscar</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/60" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Codigo, nombre o descripcion..."
                  className={cn(inputClass, 'pl-10')}
                />
              </div>
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Estado</span>
              <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className={inputClass}>
                <option value="TODOS">Todos</option>
                <option value="ACTIVO">Activos</option>
                <option value="INACTIVO">Inactivos</option>
              </select>
            </label>

            <Button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setEstadoFilter('TODOS')
              }}
              variant="outline"
              className="border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white"
            >
              Limpiar
            </Button>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Lista de centros</CardTitle>
            <p className="text-xs text-slate-400">
              Mostrando {filteredCentros.length} de {centros.length} centros de costo.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {error && (
              <div className="m-4 flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                <AlertCircle className="h-5 w-5" />
                {error}
              </div>
            )}

            {filteredCentros.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                  <Building2 className="h-10 w-10 text-cyan-100" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">No hay centros de costo</h3>
                  <p className="mt-2 text-sm text-slate-400">
                    {centros.length === 0 ? 'Aun no se han creado centros de costo.' : 'Los filtros actuales no devuelven resultados.'}
                  </p>
                </div>
                {centros.length === 0 && (
                  <Button
                    type="button"
                    onClick={() => router.push('/dashboard/contabilidad/centros-costo/nuevo')}
                    className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
                  >
                    <Plus className="h-4 w-4" />
                    Crear primer centro
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead className="bg-cyan-400/10">
                    <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">
                      <th className="px-4 py-3">Codigo</th>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Descripcion</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCentros.map((centro) => (
                      <tr
                        key={centro.id}
                        className="cursor-pointer border-b border-cyan-400/10 text-sm text-slate-200 transition hover:bg-cyan-400/10"
                        onClick={() => router.push(`/dashboard/contabilidad/centros-costo/${centro.id}`)}
                      >
                        <td className="px-4 py-3 font-semibold text-white">{centro.codigo}</td>
                        <td className="px-4 py-3 font-semibold text-white">{centro.nombre}</td>
                        <td className="max-w-[360px] truncate px-4 py-3 text-slate-300">{centro.descripcion || '-'}</td>
                        <td className="px-4 py-3 text-center">{getEstadoBadge(centro.activo)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/dashboard/contabilidad/centros-costo/${centro.id}`)
                              }}
                              className="border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white"
                              title="Ver detalles"
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/dashboard/contabilidad/centros-costo/${centro.id}/editar`)
                              }}
                              className="border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white"
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
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
      </div>
    </div>
  )
}
