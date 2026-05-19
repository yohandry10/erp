'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { CotizacionCompra, Proveedor } from '@/types/compras'
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
      alert('Error: No se pudieron cargar las cotizaciones')
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
    alert('📥 Funcionalidad de exportación próximamente')
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
      <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-3 font-medium text-white">
        {badge.icon}
        {badge.text}
      </span>
    )
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const isFilterActive = estadoFilter || proveedorFilter || fechaDesde || fechaHasta

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Cotizaciones de Compra</h1>
          <p className="dashboard-subtitle">Gestiona las cotizaciones de tus proveedores</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={() => router.push('/dashboard/compras/cotizaciones/nueva')}
        >
          <Plus size={20} />
          Nueva Cotización
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL</h3>
            <FileText className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">{totalCotizaciones}</div>
          <div className="stat-subtitle">Cotizaciones</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>BORRADORES</h3>
            <Edit className="stat-icon text-amber-500" />
          </div>
          <div className="stat-value">
            {cotizaciones.filter(c => c.estado === 'BORRADOR').length}
          </div>
          <div className="stat-subtitle">En edición</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ENVIADAS</h3>
            <Send className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">
            {cotizaciones.filter(c => c.estado === 'ENVIADA').length}
          </div>
          <div className="stat-subtitle">Pendientes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>APROBADAS</h3>
            <CheckCircle className="stat-icon text-[#10b981]" />
          </div>
          <div className="stat-value">
            {cotizaciones.filter(c => c.estado === 'APROBADA').length}
          </div>
          <div className="stat-subtitle">Aprobadas</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>VENCIDAS</h3>
            <Clock className="stat-icon text-red-500" />
          </div>
          <div className="stat-value warning">
            {cotizaciones.filter(c => c.estado === 'VENCIDA').length}
          </div>
          <div className="stat-subtitle">Expiradas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section">
        <div className="flex gap-4 mb-6 flex-wrap items-end">
          <div className="flex-[1] min-w-[200px]">
            <label className="block text-[0.875rem] font-medium mb-2 text-gray-700">
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => handleEstadoFilterChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-2 border text-[0.875rem] bg-white"
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
            <label className="block text-[0.875rem] font-medium mb-2 text-gray-700">
              Proveedor
            </label>
            <select
              value={proveedorFilter}
              onChange={(e) => handleProveedorFilterChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-2 border text-[0.875rem] bg-white"
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
            <label className="block text-[0.875rem] font-medium mb-2 text-gray-700">
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => handleFechaDesdeChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-2 border text-[0.875rem] bg-white"
            />
          </div>

          <div className="flex-[1] min-w-[180px]">
            <label className="block text-[0.875rem] font-medium mb-2 text-gray-700">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => handleFechaHastaChange(e.target.value)} className="w-[100%] py-3 px-4 rounded-2 border text-[0.875rem] bg-white"
            />
          </div>

          {isFilterActive && (
            <button
              onClick={handleClearFilters} className="py-3 px-4 rounded-2 border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium text-red-500"
            >
              <XCircle size={16} />
              Limpiar Filtros
            </button>
          )}

          <button
            onClick={handleExport} className="py-3 px-4 rounded-2 border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Download size={16} />
            Exportar
          </button>

          <button
            onClick={loadCotizaciones}
            className="refresh-btn py-3 px-4"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* Table */}
        <div className="activity-card">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Cargando cotizaciones...</p>
            </div>
          ) : cotizaciones.length === 0 ? (
            <div className="text-center p-12 text-gray-500">
              <FileText size={48} className="text-gray-400" />
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
                  className="refresh-btn"
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
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        N° Cotización
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Proveedor
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Fecha Cotización
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Vencimiento
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
                        Total
                      </th>
                      <th className="text-center p-4 font-semibold text-3 text-gray-500">
                        Estado
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
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
                          <div className="text-[0.875rem] font-semibold text-gray-900">
                            {cotizacion.proveedores?.razon_social || 'N/A'}
                          </div>
                          {cotizacion.proveedores?.ruc && (
                            <div className="text-3 text-gray-500">
                              RUC: {cotizacion.proveedores.ruc}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-[0.875rem] text-gray-700">
                          {formatDate(cotizacion.fecha_cotizacion)}
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] text-gray-700">
                            {formatDate(cotizacion.fecha_vencimiento)}
                          </div>
                          <div className="text-3 text-gray-500">
                            ({cotizacion.validez_dias} días)
                          </div>
                        </td>
                        <td className="p-4 text-right text-[0.875rem] font-semibold text-gray-700">
                          {formatCurrency(cotizacion.total)}
                        </td>
                        <td className="p-4 text-center">
                          {getEstadoBadge(cotizacion.estado)}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/compras/cotizaciones/${cotizacion.id}`)} className="p-2 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            {cotizacion.estado === 'BORRADOR' && (
                              <button
                                onClick={() => router.push(`/dashboard/compras/cotizaciones/${cotizacion.id}/editar`)} className="p-2 rounded-[6px] border-0 bg-[#10b981] text-white cursor-pointer"
                                title="Editar"
                              >
                                <Edit size={16} />
                              </button>
                            )}
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
                  <div className="text-[0.875rem] text-gray-700">
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
