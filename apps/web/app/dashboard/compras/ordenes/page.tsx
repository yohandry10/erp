'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle,
  Clock,
  Download,
  Edit,
  Eye,
  FileText,
  LayoutGrid,
  List,
  Package,
  Plus,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface OrdenCompra {
  id: string
  numero: string
  proveedor_id: string
  fecha_orden: string
  fecha_entrega_esperada?: string
  estado: string
  subtotal: number
  igv: number
  total: number
  moneda: string
  observaciones?: string
  proveedores?: {
    razon_social: string
    ruc: string
  }
  detalles?: any[]
}

type EstadoOrden = 'BORRADOR' | 'APROBACION' | 'APROBADA' | 'PARCIAL' | 'RECIBIDA' | 'CERRADA' | 'ANULADA'

type EstadoConfig = {
  label: string
  icon: LucideIcon
  badge: string
  panel: string
  border: string
}

const ESTADOS_CONFIG: Record<EstadoOrden, EstadoConfig> = {
  BORRADOR: {
    label: 'Borrador',
    icon: Edit,
    badge: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
    panel: 'from-slate-500/15 to-slate-500/5',
    border: 'border-slate-400/25',
  },
  APROBACION: {
    label: 'En aprobacion',
    icon: Clock,
    badge: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    panel: 'from-amber-300/15 to-amber-300/5',
    border: 'border-amber-300/25',
  },
  APROBADA: {
    label: 'Aprobada',
    icon: CheckCircle,
    badge: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
    panel: 'from-cyan-300/15 to-cyan-300/5',
    border: 'border-cyan-300/25',
  },
  PARCIAL: {
    label: 'Parcial',
    icon: Package,
    badge: 'border-blue-300/30 bg-blue-300/10 text-blue-100',
    panel: 'from-blue-300/15 to-blue-300/5',
    border: 'border-blue-300/25',
  },
  RECIBIDA: {
    label: 'Recibida',
    icon: CheckCircle,
    badge: 'border-teal-300/30 bg-teal-300/10 text-teal-100',
    panel: 'from-teal-300/15 to-teal-300/5',
    border: 'border-teal-300/25',
  },
  CERRADA: {
    label: 'Cerrada',
    icon: FileText,
    badge: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100',
    panel: 'from-cyan-400/15 to-cyan-400/5',
    border: 'border-cyan-400/20',
  },
  ANULADA: {
    label: 'Anulada',
    icon: XCircle,
    badge: 'border-slate-300/30 bg-slate-300/10 text-slate-100',
    panel: 'from-slate-300/15 to-slate-300/5',
    border: 'border-slate-300/20',
  },
}

const ESTADO_QUICK_FILTERS: Array<{ label: string; value: '' | EstadoOrden }> = [
  { label: 'Todas', value: '' },
  { label: 'Borrador', value: 'BORRADOR' },
  { label: 'En aprobacion', value: 'APROBACION' },
  { label: 'Aprobada', value: 'APROBADA' },
  { label: 'Parcial', value: 'PARCIAL' },
  { label: 'Recibida', value: 'RECIBIDA' },
  { label: 'Anulada', value: 'ANULADA' },
]

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-slate-950/75 px-3 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200/70'

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizeOrden = (raw: any): OrdenCompra => ({
  id: raw?.id || '',
  numero: raw?.numero || 'N/A',
  proveedor_id: raw?.proveedor_id || '',
  fecha_orden: raw?.fecha_orden || raw?.fecha || '',
  fecha_entrega_esperada: raw?.fecha_entrega_esperada,
  estado: String(raw?.estado || 'BORRADOR').toUpperCase(),
  subtotal: toNumber(raw?.subtotal),
  igv: toNumber(raw?.igv),
  total: toNumber(raw?.total),
  moneda: raw?.moneda || 'PEN',
  observaciones: raw?.observaciones,
  proveedores: raw?.proveedores,
  detalles: Array.isArray(raw?.detalles) ? raw.detalles : [],
})

export default function OrdenesCompraPage() {
  const router = useRouter()
  const { get } = useApi()

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [proveedorFilter, setProveedorFilter] = useState<string>('')
  const [fechaDesde, setFechaDesde] = useState<string>('')
  const [fechaHasta, setFechaHasta] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalOrdenes, setTotalOrdenes] = useState(0)
  const itemsPerPage = 10

  const loadOrdenes = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (estadoFilter) params.append('estado', estadoFilter)
      if (proveedorFilter) params.append('proveedor_id', proveedorFilter)
      if (fechaDesde) params.append('fecha_desde', fechaDesde)
      if (fechaHasta) params.append('fecha_hasta', fechaHasta)

      if (viewMode === 'list') {
        const offset = (currentPage - 1) * itemsPerPage
        params.append('limit', itemsPerPage.toString())
        params.append('offset', offset.toString())
      }

      const response = await get(`/compras/ordenes?${params.toString()}`)

      if (response?.success) {
        const data = (Array.isArray(response.data) ? response.data : []).map(normalizeOrden)
        setOrdenes(data)
        const count = toNumber(response.count) || data.length
        setTotalOrdenes(count)
        setTotalPages(Math.max(1, Math.ceil(count / itemsPerPage)))
      }
    } catch (error) {
      console.error('Error loading ordenes:', error)
      alert('Error: No se pudieron cargar las ordenes de compra')
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, proveedorFilter, fechaDesde, fechaHasta, currentPage, viewMode, get])

  const loadProveedores = useCallback(async () => {
    try {
      const response = await get('/compras/proveedores?activo=true')
      if (response?.success) setProveedores(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error loading proveedores:', error)
    }
  }, [get])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  useEffect(() => {
    loadOrdenes()
  }, [loadOrdenes])

  const handleEstadoFilterChange = (value: string) => {
    setEstadoFilter(value)
    setCurrentPage(1)
  }

  const handleClearFilters = () => {
    setEstadoFilter('')
    setProveedorFilter('')
    setFechaDesde('')
    setFechaHasta('')
    setCurrentPage(1)
  }

  const handleExport = () => {
    alert('Funcionalidad de exportacion proximamente')
  }

  const formatCurrency = (amount: number | undefined) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(toNumber(amount))
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '-'
    const parsed = new Date(dateString)
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const getOrdenesByEstado = (estado: EstadoOrden) => ordenes.filter((orden) => orden.estado === estado)
  const isFilterActive = estadoFilter || proveedorFilter || fechaDesde || fechaHasta

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoOrden]
    if (!config) return null
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${config.badge}`}>
        <Icon className="h-3.5 w-3.5" />
        {config.label}
      </span>
    )
  }

  const statCards = [
    { label: 'Total', value: ordenes.length, icon: FileText },
    { label: 'En aprobacion', value: ordenes.filter((orden) => orden.estado === 'APROBACION').length, icon: Clock },
    { label: 'Aprobadas', value: ordenes.filter((orden) => orden.estado === 'APROBADA').length, icon: CheckCircle },
    { label: 'Recibidas', value: ordenes.filter((orden) => orden.estado === 'RECIBIDA').length, icon: Package },
  ]

  const renderOrderCard = (orden: OrdenCompra, config: EstadoConfig) => (
    <button
      key={orden.id}
      type="button"
      onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}`)}
      className={`group w-full rounded-2xl border ${config.border} bg-slate-950/70 p-4 text-left shadow-xl shadow-blue-950/20 transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-slate-900/90`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold text-white">{orden.numero}</div>
          <div className="mt-1 text-xs text-slate-400">{formatDate(orden.fecha_orden)}</div>
        </div>
        {getEstadoBadge(orden.estado)}
      </div>

      <div className="mt-4 min-h-14">
        <div className="line-clamp-2 text-sm font-semibold text-slate-100">{orden.proveedores?.razon_social || 'Proveedor N/A'}</div>
        {orden.proveedores?.ruc && <div className="mt-1 text-xs text-cyan-200/60">RUC: {orden.proveedores.ruc}</div>}
      </div>

      <div className={`mt-4 rounded-xl border ${config.border} bg-gradient-to-br ${config.panel} p-3`}>
        <div className={labelClass}>Total</div>
        <div className="mt-1 text-xl font-bold text-cyan-50">{formatCurrency(orden.total)}</div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-cyan-400/10 pt-3 text-xs text-slate-400">
        <span>{orden.fecha_entrega_esperada ? `Entrega: ${formatDate(orden.fecha_entrega_esperada)}` : 'Sin entrega programada'}</span>
        <span className="inline-flex items-center gap-1 text-cyan-200">
          <Eye className="h-3.5 w-3.5" />
          Ver
        </span>
      </div>
    </button>
  )

  const renderKanbanColumn = (estado: EstadoOrden) => {
    const config = ESTADOS_CONFIG[estado]
    const ordenesEstado = getOrdenesByEstado(estado)
    const Icon = config.icon

    return (
      <div key={estado} className="flex min-w-[280px] flex-1 flex-col gap-3">
        <div className={`rounded-2xl border ${config.border} bg-gradient-to-br ${config.panel} p-4 shadow-xl shadow-blue-950/20`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`rounded-xl border ${config.border} bg-slate-950/70 p-3 text-cyan-100`}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{config.label}</h3>
                <p className="text-xs text-cyan-100/60">{ordenesEstado.length} ordenes</p>
              </div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-sm font-bold ${config.badge}`}>{ordenesEstado.length}</span>
          </div>
        </div>

        <div className="flex max-h-[64vh] min-h-[300px] flex-col gap-3 overflow-y-auto rounded-2xl border border-cyan-400/10 bg-slate-950/35 p-3">
          {ordenesEstado.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-400/20 bg-slate-950/45 p-5 text-center text-slate-400">
              <Icon className="mb-2 h-7 w-7 text-cyan-200/40" />
              <p className="text-sm">Sin ordenes en {config.label.toLowerCase()}</p>
            </div>
          ) : (
            ordenesEstado.map((orden) => renderOrderCard(orden, config))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-cyan-100">
                ERP Purchasing Board
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Ordenes de Compra</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Seguimiento compacto de ordenes, aprobaciones, recepciones y proveedores activos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-1">
                <Button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`gap-2 rounded-xl ${viewMode === 'kanban' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Kanban
                </Button>
                <Button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`gap-2 rounded-xl ${viewMode === 'list' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                >
                  <List className="h-4 w-4" />
                  Lista
                </Button>
              </div>
              <Button type="button" onClick={loadOrdenes} variant="outline" className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={() => router.push('/dashboard/compras/ordenes/nueva')} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
                <Plus className="h-4 w-4" />
                Nueva orden
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-2xl font-bold text-white">{value}</div>
                  <div className="mt-1 text-xs text-cyan-100/55">Ordenes</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-100">
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={labelClass}>Estados</span>
              {ESTADO_QUICK_FILTERS.map((filter) => {
                const isActive = estadoFilter === filter.value
                return (
                  <Button
                    key={filter.label}
                    type="button"
                    onClick={() => handleEstadoFilterChange(filter.value)}
                    variant="outline"
                    className={`h-9 rounded-full border-cyan-400/20 px-4 text-xs ${isActive ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-950/50 text-slate-300 hover:bg-white/10 hover:text-white'}`}
                  >
                    {filter.label}
                  </Button>
                )
              })}
            </div>

            {viewMode === 'list' && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[180px_minmax(220px,1fr)_170px_170px_auto_auto] xl:items-end">
                <label className="space-y-2">
                  <span className={labelClass}>Estado</span>
                  <select className={inputClass} value={estadoFilter} onChange={(e) => handleEstadoFilterChange(e.target.value)}>
                    <option value="">Todos los estados</option>
                    {Object.entries(ESTADOS_CONFIG).map(([value, config]) => (
                      <option key={value} value={value}>
                        {config.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Proveedor</span>
                  <select className={inputClass} value={proveedorFilter} onChange={(e) => setProveedorFilter(e.target.value)}>
                    <option value="">Todos los proveedores</option>
                    {proveedores.map((proveedor) => (
                      <option key={proveedor.id} value={proveedor.id}>
                        {proveedor.razon_social}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Desde</span>
                  <input className={inputClass} type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Hasta</span>
                  <input className={inputClass} type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                </label>
                {isFilterActive && (
                  <Button type="button" onClick={handleClearFilters} variant="outline" className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                    <XCircle className="h-4 w-4" />
                    Limpiar
                  </Button>
                )}
                <Button type="button" onClick={handleExport} variant="outline" className="gap-2 border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                  <Download className="h-4 w-4" />
                  Exportar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-slate-950/65 text-slate-100 shadow-xl shadow-blue-950/20">
          <CardContent className="p-4">
            {loading ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-slate-300">
                <RefreshCw className="h-8 w-8 animate-spin text-cyan-200" />
                <p>Cargando ordenes de compra...</p>
              </div>
            ) : viewMode === 'kanban' ? (
              <div className="grid gap-3 xl:grid-cols-4 2xl:grid-cols-7">
                {renderKanbanColumn('BORRADOR')}
                {renderKanbanColumn('APROBACION')}
                {renderKanbanColumn('APROBADA')}
                {renderKanbanColumn('PARCIAL')}
                {renderKanbanColumn('RECIBIDA')}
                {renderKanbanColumn('CERRADA')}
                {renderKanbanColumn('ANULADA')}
              </div>
            ) : ordenes.length === 0 ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-400/20 bg-slate-950/45 p-8 text-center">
                <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-white">No hay ordenes de compra</h3>
                <p className="mt-2 text-sm text-slate-400">
                  {isFilterActive ? 'No se encontraron ordenes con los filtros aplicados.' : 'Comienza creando tu primera orden de compra.'}
                </p>
                {!isFilterActive && (
                  <Button type="button" onClick={() => router.push('/dashboard/compras/ordenes/nueva')} className="mt-4 gap-2 bg-blue-600 text-white hover:bg-blue-500">
                    <Plus className="h-4 w-4" />
                    Crear primera orden
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-cyan-400/10">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse text-sm">
                    <thead className="bg-slate-950/80 text-xs uppercase tracking-[0.12em] text-cyan-200/70">
                      <tr>
                        <th className="px-4 py-3 text-left">N Orden</th>
                        <th className="px-4 py-3 text-left">Proveedor</th>
                        <th className="px-4 py-3 text-left">Fecha orden</th>
                        <th className="px-4 py-3 text-left">Fecha entrega</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-400/10">
                      {ordenes.map((orden) => (
                        <tr key={orden.id} className="bg-slate-950/35 text-slate-200 transition hover:bg-slate-900/70">
                          <td className="px-4 py-3 font-mono font-semibold text-white">{orden.numero}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-100">{orden.proveedores?.razon_social || 'N/A'}</div>
                            {orden.proveedores?.ruc && <div className="text-xs text-cyan-100/55">RUC: {orden.proveedores.ruc}</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-300">{formatDate(orden.fecha_orden)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDate(orden.fecha_entrega_esperada)}</td>
                          <td className="px-4 py-3 text-right font-bold text-cyan-50">{formatCurrency(orden.total)}</td>
                          <td className="px-4 py-3 text-center">{getEstadoBadge(orden.estado)}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {(orden.estado === 'APROBADA' || orden.estado === 'PARCIAL') && (
                                <Button type="button" size="sm" onClick={() => router.push(`/dashboard/inventario/recepciones?oc=${orden.id}`)} className="bg-cyan-600 text-white hover:bg-cyan-500" title="Recepcionar OC">
                                  <Package className="h-4 w-4" />
                                </Button>
                              )}
                              <Button type="button" size="sm" onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}`)} className="bg-blue-600 text-white hover:bg-blue-500" title="Ver detalle">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {orden.estado === 'BORRADOR' && (
                                <Button type="button" size="sm" onClick={() => router.push(`/dashboard/compras/ordenes/${orden.id}/editar`)} variant="outline" className="border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white" title="Editar">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-col gap-3 border-t border-cyan-400/10 bg-slate-950/70 p-4 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
                    <div>
                      Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                      <strong>{Math.min(currentPage * itemsPerPage, totalOrdenes)}</strong> de <strong>{totalOrdenes}</strong> ordenes
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} variant="outline" className="border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                        Anterior
                      </Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                        let pageNum
                        if (totalPages <= 5) pageNum = index + 1
                        else if (currentPage <= 3) pageNum = index + 1
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + index
                        else pageNum = currentPage - 2 + index

                        return (
                          <Button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPage(pageNum)}
                            className={currentPage === pageNum ? 'bg-blue-600 text-white hover:bg-blue-500' : 'border border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white'}
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                      <Button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} variant="outline" className="border-cyan-400/20 bg-white/10 text-cyan-50 hover:bg-white/15 hover:text-white">
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
