'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { CotizacionCompra, Proveedor } from '@/types/compras'
import toast from 'react-hot-toast'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import {
  Search,
  Plus,
  Download,
  Edit,
  Eye,
  FileText,
  RefreshCw,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Send
} from 'lucide-react'

export default function CotizacionesCompraPage() {
  const router = useRouter()
  const { get } = useApi()
  const { formatCurrency: formatLocalizedCurrency, locale, taxIdLabel } = useLocalizedMoney()

  const [cotizaciones, setCotizaciones] = useState<CotizacionCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [proveedorFilter, setProveedorFilter] = useState<string>('')
  const [fechaDesde, setFechaDesde] = useState<string>('')
  const [fechaHasta, setFechaHasta] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCotizaciones, setTotalCotizaciones] = useState(0)
  const itemsPerPage = 10

  const loadCotizaciones = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()

      if (estadoFilter) params.append('estado', estadoFilter)
      if (proveedorFilter) params.append('proveedor_id', proveedorFilter)
      if (fechaDesde) params.append('fecha_desde', fechaDesde)
      if (fechaHasta) params.append('fecha_hasta', fechaHasta)

      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage
      params.append('limit', itemsPerPage.toString())
      params.append('offset', offset.toString())

      const response = await get(`/api/compras/cotizaciones?${params.toString()}`)

      if (response?.success) {
        const data = response.data || []
        setCotizaciones(data)
        setTotalCotizaciones(response.count || data.length)
        setTotalPages(Math.ceil((response.count || data.length) / itemsPerPage))
      }
    } catch (error) {
      console.error('Error loading cotizaciones:', error)
      toast.error('Error: No se pudieron cargar las cotizaciones')
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, proveedorFilter, fechaDesde, fechaHasta, currentPage, get])

  const loadProveedores = useCallback(async () => {
    try {
      const response = await get('/api/compras/proveedores?activo=true')
      if (response?.success) {
        setProveedores(response.data || [])
      }
    } catch (error) {
      console.error('Error loading proveedores:', error)
    }
  }, [get])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  useEffect(() => {
    loadCotizaciones()
  }, [loadCotizaciones])

  const handleEstadoFilterChange = (value: string) => {
    setEstadoFilter(value)
    setCurrentPage(1)
  }

  const handleProveedorFilterChange = (value: string) => {
    setProveedorFilter(value)
    setCurrentPage(1)
  }

  const handleFechaDesdeChange = (value: string) => {
    setFechaDesde(value)
    setCurrentPage(1)
  }

  const handleFechaHastaChange = (value: string) => {
    setFechaHasta(value)
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
    toast('📥 Funcionalidad de exportación próximamente')
  }

  const getEstadoBadge = (estado: string) => {
    const badges = {
      BORRADOR: { bg: '#f59e0b', icon: <Edit size={14} />, text: 'Borrador' },
      ENVIADA: { bg: '#3b82f6', icon: <Send size={14} />, text: 'Enviada' },
      APROBADA: { bg: '#10b981', icon: <CheckCircle size={14} />, text: 'Aprobada' },
      RECHAZADA: { bg: '#ef4444', icon: <XCircle size={14} />, text: 'Rechazada' },
      VENCIDA: { bg: '#6b7280', icon: <Clock size={14} />, text: 'Vencida' }
    }

    const badge = badges[estado as keyof typeof badges] || badges.BORRADOR

    return (
      <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-medium text-white">
        {badge.icon}
        {badge.text}
      </span>
    )
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return formatLocalizedCurrency(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const isFilterActive = estadoFilter || proveedorFilter || fechaDesde || fechaHasta

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Cotizaciones de Compra</h1>
          <p className="mt-2 text-base text-muted-foreground">Gestiona las cotizaciones de tus proveedores</p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => router.push('/dashboard/compras/cotizaciones/nueva')}
        >
          <Plus size={20} />
          Nueva Cotización
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] mb-8">
        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>TOTAL</h3>
            <FileText className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-blue-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{totalCotizaciones}</div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Cotizaciones</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>BORRADORES</h3>
            <Edit className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-amber-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">
            {cotizaciones.filter(c => c.estado === 'BORRADOR').length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">En edición</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>ENVIADAS</h3>
            <Send className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-blue-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">
            {cotizaciones.filter(c => c.estado === 'ENVIADA').length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Pendientes</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>APROBADAS</h3>
            <CheckCircle className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-[#10b981]" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">
            {cotizaciones.filter(c => c.estado === 'APROBADA').length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Aprobadas</div>
        </div>

        <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border border-l-4 border-l-amber-500 bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
            <h3>VENCIDAS</h3>
            <Clock className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-red-500" />
          </div>
          <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-400 dark:text-amber-400">
            {cotizaciones.filter(c => c.estado === 'VENCIDA').length}
          </div>
          <div className="mt-2 text-[0.8125rem] text-muted-foreground">Expiradas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex gap-4 mb-6 flex-wrap items-end">
          <div className="flex-[1] min-w-[200px]">
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => handleEstadoFilterChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-lg border text-[0.875rem] bg-card"
            >
              <option value="">Todos los estados</option>
              <option value="BORRADOR">Borrador</option>
              <option value="ENVIADA">Enviada</option>
              <option value="APROBADA">Aprobada</option>
              <option value="RECHAZADA">Rechazada</option>
              <option value="VENCIDA">Vencida</option>
            </select>
          </div>

          <div className="flex-[1] min-w-[200px]">
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Proveedor
            </label>
            <select
              value={proveedorFilter}
              onChange={(e) => handleProveedorFilterChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-lg border text-[0.875rem] bg-card"
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-[1] min-w-[180px]">
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => handleFechaDesdeChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-lg border text-[0.875rem] bg-card"
            />
          </div>

          <div className="flex-[1] min-w-[180px]">
            <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => handleFechaHastaChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-lg border text-[0.875rem] bg-card"
            />
          </div>

          {isFilterActive && (
            <button
              onClick={handleClearFilters} className="py-3 px-4 rounded-lg border bg-card cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium text-red-500"
            >
              <XCircle size={16} />
              Limpiar Filtros
            </button>
          )}

          <button
            onClick={handleExport} className="py-3 px-4 rounded-lg border bg-card cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Download size={16} />
            Exportar
          </button>

          <button
            onClick={loadCotizaciones}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-3 px-4"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* Table */}
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center">
              <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
              <p>Cargando cotizaciones...</p>
            </div>
          ) : cotizaciones.length === 0 ? (
            <div className="text-center p-12 text-muted-foreground">
              <FileText size={48} className="text-muted-foreground" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay cotizaciones
              </h3>
              <p className="mb-6">
                {isFilterActive
                  ? 'No se encontraron cotizaciones con los filtros aplicados'
                  : 'Comienza creando tu primera cotización de compra'}
              </p>
              {!isFilterActive && (
                <button
                  onClick={() => router.push('/dashboard/compras/cotizaciones/nueva')}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus size={16} />
                  Crear Primera Cotización
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        N° Cotización
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Proveedor
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Fecha Cotización
                      </th>
                      <th className="text-left p-4 font-semibold text-xs text-muted-foreground">
                        Vencimiento
                      </th>
                      <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
                        Total
                      </th>
                      <th className="text-center p-4 font-semibold text-xs text-muted-foreground">
                        Estado
                      </th>
                      <th className="text-right p-4 font-semibold text-xs text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotizaciones.map((cotizacion) => (
                      <tr key={cotizacion.id} className="border-b">
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold">
                            {cotizacion.numero}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold text-foreground">
                            {cotizacion.proveedores?.razon_social || 'N/A'}
                          </div>
                          {cotizacion.proveedores?.ruc && (
                            <div className="text-xs text-muted-foreground">
                              {taxIdLabel}: {cotizacion.proveedores.ruc}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-[0.875rem] text-foreground/85">
                          {formatDate(cotizacion.fecha_cotizacion)}
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] text-foreground/85">
                            {formatDate(cotizacion.fecha_vencimiento)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ({cotizacion.validez_dias} días)
                          </div>
                        </td>
                        <td className="p-4 text-right text-[0.875rem] font-semibold text-foreground/85">
                          {formatCurrency(cotizacion.total)}
                        </td>
                        <td className="p-4 text-center">
                          {getEstadoBadge(cotizacion.estado)}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/compras/cotizaciones/${cotizacion.id}`)} className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            {/* No hay pantalla de edición de cotización: la ruta
                                `/editar` no existe y el botón terminaba en un 404.
                                Se retira en vez de prometer algo que no está. */}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t flex justify-between items-center">
                  <div className="text-[0.875rem] text-foreground/85">
                    Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                    <strong>{Math.min(currentPage * itemsPerPage, totalCotizaciones)}</strong> de{' '}
                    <strong>{totalCotizaciones}</strong> cotizaciones
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1} className="py-2 px-4 rounded-[6px] border text-[0.875rem]"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)} className="py-2 px-4 rounded-[6px] border cursor-pointer text-[0.875rem] min-w-10"
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages} className="py-2 px-4 rounded-[6px] border text-[0.875rem]"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
