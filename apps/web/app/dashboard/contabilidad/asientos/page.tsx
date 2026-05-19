'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Edit3,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  XCircle,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AsientoContable {
  id: string
  numero_asiento: string
  fecha: string
  concepto: string
  referencia?: string
  total_debe: number
  total_haber: number
  estado: 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'
  origen?: string
  source_event_id?: string
  created_at: string
}

type EstadoAsiento = 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'

const ESTADOS_CONFIG: Record<EstadoAsiento, { label: string; icon: typeof FileText }> = {
  BORRADOR: { label: 'Borrador', icon: FileText },
  CONFIRMADO: { label: 'Confirmado', icon: CheckCircle },
  ANULADO: { label: 'Anulado', icon: XCircle },
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-slate-950/65 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

export default function AsientosPage() {
  const router = useRouter()
  const { get } = useApi()

  const [asientos, setAsientos] = useState<AsientoContable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [numeroAsientoSearch, setNumeroAsientoSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS')
  const [origenFilter, setOrigenFilter] = useState<string>('TODOS')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const loadAsientos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await get('/api/contabilidad/asientos')

      if (response?.success && response.data) {
        setAsientos(response.data)
      } else {
        setError('No se pudieron cargar los asientos contables')
      }
    } catch (err: any) {
      console.error('Error loading asientos:', err)
      setError(err.message || 'Error al cargar los asientos contables')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadAsientos()
  }, [loadAsientos])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoAsiento]
    if (!config) return null
    const Icon = config.icon

    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    )
  }

  const getOrigenBadge = (asiento: AsientoContable) => {
    const isAutomatic = asiento.source_event_id || asiento.origen
    const Icon = isAutomatic ? Zap : Edit3

    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-100"
        title={isAutomatic ? asiento.origen || 'Generado automáticamente' : 'Creado manualmente'}
      >
        <Icon className="h-3 w-3" />
        {isAutomatic ? 'Automático' : 'Manual'}
      </span>
    )
  }

  const isBalanced = (asiento: AsientoContable) => Math.abs(asiento.total_debe - asiento.total_haber) < 0.01

  const filteredAsientos = asientos.filter((asiento) => {
    if (numeroAsientoSearch && !asiento.numero_asiento.toLowerCase().includes(numeroAsientoSearch.toLowerCase())) {
      return false
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesSearch =
        asiento.concepto.toLowerCase().includes(search) ||
        (asiento.referencia && asiento.referencia.toLowerCase().includes(search))
      if (!matchesSearch) return false
    }

    if (estadoFilter !== 'TODOS' && asiento.estado !== estadoFilter) return false

    if (origenFilter !== 'TODOS') {
      const isAutomatic = asiento.source_event_id || asiento.origen
      if (origenFilter === 'AUTOMATICO' && !isAutomatic) return false
      if (origenFilter === 'MANUAL' && isAutomatic) return false
    }

    if (fechaDesde && asiento.fecha < fechaDesde) return false
    if (fechaHasta && asiento.fecha > fechaHasta) return false

    return true
  })

  const stats = {
    total: asientos.length,
    automaticos: asientos.filter((a) => a.source_event_id || a.origen).length,
    manuales: asientos.filter((a) => !a.source_event_id && !a.origen).length,
    descuadrados: asientos.filter((a) => !isBalanced(a)).length,
  }

  const clearFilters = () => {
    setNumeroAsientoSearch('')
    setSearchTerm('')
    setEstadoFilter('TODOS')
    setOrigenFilter('TODOS')
    setFechaDesde('')
    setFechaHasta('')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-slate-950/70 text-slate-100">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <RefreshCw className="h-7 w-7 animate-spin text-cyan-200" />
            <span className="text-sm font-medium text-slate-300">Cargando asientos contables...</span>
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
                <FileText className="h-6 w-6" />
              </span>
              <div>
                <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  ERP Journal Center
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Asientos Contables</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Gestione asientos manuales y trazabilidad de asientos generados por operaciones reales.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={loadAsientos}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button
                type="button"
                onClick={() => router.push('/dashboard/contabilidad/asientos/nuevo')}
                className="gap-2 bg-blue-600 text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                Nuevo Asiento Manual
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total asientos', stats.total],
            ['Automáticos', stats.automaticos],
            ['Manuales', stats.manuales],
            ['Descuadrados', stats.descuadrados],
          ].map(([label, value]) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/70">{label}</div>
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
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">Número</span>
                <div className="relative">
                  <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/60" />
                  <input
                    type="text"
                    value={numeroAsientoSearch}
                    onChange={(e) => setNumeroAsientoSearch(e.target.value)}
                    placeholder="Ej: ASI-2024-001"
                    className={cn(inputClass, 'pl-10')}
                  />
                </div>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">Concepto</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/60" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Concepto, referencia..."
                    className={cn(inputClass, 'pl-10')}
                  />
                </div>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">Estado</span>
                <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className={inputClass}>
                  <option value="TODOS">Todos</option>
                  <option value="BORRADOR">Borrador</option>
                  <option value="CONFIRMADO">Confirmado</option>
                  <option value="ANULADO">Anulado</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">Origen</span>
                <select value={origenFilter} onChange={(e) => setOrigenFilter(e.target.value)} className={inputClass}>
                  <option value="TODOS">Todos</option>
                  <option value="AUTOMATICO">Automático</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">Desde</span>
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className={inputClass} />
              </label>

              <label className="space-y-2">
                <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70">Hasta</span>
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className={inputClass} />
              </label>
            </div>

            {(numeroAsientoSearch || searchTerm || estadoFilter !== 'TODOS' || origenFilter !== 'TODOS' || fechaDesde || fechaHasta) && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={clearFilters} className="border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                  Limpiar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-white">Lista de asientos</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {error && (
              <div className="m-4 flex items-center gap-3 rounded-xl border border-blue-300/20 bg-blue-400/10 p-4 text-sm text-blue-50">
                <AlertCircle className="h-5 w-5" />
                {error}
              </div>
            )}

            {filteredAsientos.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center text-slate-400">
                <FileText className="mb-4 h-12 w-12 text-cyan-200/60" />
                <h3 className="text-lg font-semibold text-white">No hay asientos contables</h3>
                <p className="mt-2 max-w-md text-sm">
                  {asientos.length === 0
                    ? 'Aún no se han creado asientos contables.'
                    : 'No se encontraron asientos con los filtros aplicados.'}
                </p>
                {asientos.length === 0 && (
                  <Button
                    type="button"
                    onClick={() => router.push('/dashboard/contabilidad/asientos/nuevo')}
                    className="mt-5 gap-2 bg-blue-600 text-white hover:bg-blue-500"
                  >
                    <Plus className="h-4 w-4" />
                    Crear primer asiento
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-sm">
                  <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-cyan-200/70">
                    <tr>
                      {['Número', 'Fecha', 'Concepto', 'Origen', 'Total', 'Estado', 'Balance'].map((header) => (
                        <th key={header} className={cn('px-5 py-3 font-semibold', header === 'Total' ? 'text-right' : header === 'Estado' || header === 'Balance' ? 'text-center' : 'text-left')}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAsientos.map((asiento) => (
                      <tr
                        key={asiento.id}
                        onClick={() => router.push(`/dashboard/contabilidad/asientos/${asiento.id}`)}
                        className="cursor-pointer border-t border-cyan-400/10 transition hover:bg-cyan-400/10"
                      >
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">{asiento.numero_asiento}</div>
                          {asiento.referencia && <div className="mt-1 text-xs text-slate-500">Ref: {asiento.referencia}</div>}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-slate-300">
                            <Calendar className="h-4 w-4 text-cyan-200/60" />
                            {formatDate(asiento.fecha)}
                          </div>
                        </td>
                        <td className="max-w-[360px] px-5 py-4">
                          <div className="truncate text-slate-300">{asiento.concepto}</div>
                        </td>
                        <td className="px-5 py-4">{getOrigenBadge(asiento)}</td>
                        <td className="px-5 py-4 text-right font-semibold text-white">{formatCurrency(asiento.total_debe)}</td>
                        <td className="px-5 py-4 text-center">{getEstadoBadge(asiento.estado)}</td>
                        <td className="px-5 py-4 text-center">
                          {isBalanced(asiento) ? (
                            <CheckCircle className="mx-auto h-5 w-5 text-cyan-200" />
                          ) : (
                            <AlertCircle className="mx-auto h-5 w-5 text-blue-200" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredAsientos.length > 0 && (
              <div className="flex items-center justify-between border-t border-cyan-400/10 px-5 py-4 text-sm text-slate-400">
                Mostrando {filteredAsientos.length} de {asientos.length} asientos
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
