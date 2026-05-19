'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cotizacion, EstadoCotizacion } from '@/types/ventas'
import { 
  Search, 
  Plus, 
  FileText,
  Eye,
  Edit,
  Trash2,
  RefreshCw
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADO_COLORS: Record<EstadoCotizacion, { bg: string, text: string }> = {
  [EstadoCotizacion.BORRADOR]: { bg: 'rgba(156, 163, 175, 0.1)', text: '#6b7280' },
  [EstadoCotizacion.ENVIADA]: { bg: 'rgba(59, 130, 246, 0.1)', text: '#2563eb' },
  [EstadoCotizacion.APROBADA]: { bg: 'rgba(16, 185, 129, 0.1)', text: '#059669' },
  [EstadoCotizacion.RECHAZADA]: { bg: 'rgba(239, 68, 68, 0.1)', text: '#dc2626' },
  [EstadoCotizacion.CONVERTIDA]: { bg: 'rgba(139, 92, 246, 0.1)', text: '#7c3aed' },
  [EstadoCotizacion.VENCIDA]: { bg: 'rgba(245, 158, 11, 0.1)', text: '#d97706' },
}

export default function CotizacionesPage() {
  const router = useRouter()
  const { get, delete: del } = useApi()
  
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCotizaciones, setTotalCotizaciones] = useState(0)
  const itemsPerPage = 10

  const loadCotizaciones = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (estadoFilter) params.append('estado', estadoFilter)
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await get(`/api/ventas/cotizaciones?${params.toString()}`)
      
      if (response?.success) {
        setCotizaciones(response.data || [])
        setTotalCotizaciones(response.total || 0)
        setTotalPages(Math.ceil((response.total || 0) / itemsPerPage))
      }
    } catch (error) {
      console.error('Error loading cotizaciones:', error)
      alert('❌ Error: No se pudieron cargar las cotizaciones')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, estadoFilter, currentPage, get])

  useEffect(() => {
    loadCotizaciones()
  }, [loadCotizaciones])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleFilterChange = (value: string) => {
    setEstadoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async (id: string, numero: string) => {
    if (!confirm(`¿Está seguro de eliminar la cotización "${numero}"?`)) {
      return
    }

    try {
      await del(`/api/ventas/cotizaciones/${id}`)
      alert('✅ Cotización eliminada correctamente')
      loadCotizaciones()
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'No se pudo eliminar la cotización'}`)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Cotizaciones</h1>
          <p className="dashboard-subtitle">Gestiona tus cotizaciones de venta</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={() => router.push('/dashboard/ventas/cotizaciones/nueva')}
        >
          <Plus size={20} />
          Nueva Cotización
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL COTIZACIONES</h3>
            <FileText className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">{totalCotizaciones}</div>
          <div className="stat-subtitle">Cotizaciones registradas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section">
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex-[1] min-w-[300px] relative">
            <Search 
              size={20} className="absolute left-4 top-[50%] -translate-y-1/2 text-gray-400" 
            />
            <input
              type="text"
              placeholder="Buscar por número, cliente..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-2 border text-[0.875rem]"
            />
          </div>

          <select
            value={estadoFilter}
            onChange={(e) => handleFilterChange(e.target.value)} className="py-3 px-4 rounded-2 border text-[0.875rem] bg-white"
          >
            <option value="">Todos los estados</option>
            <option value={EstadoCotizacion.BORRADOR}>Borrador</option>
            <option value={EstadoCotizacion.ENVIADA}>Enviada</option>
            <option value={EstadoCotizacion.APROBADA}>Aprobada</option>
            <option value={EstadoCotizacion.RECHAZADA}>Rechazada</option>
            <option value={EstadoCotizacion.CONVERTIDA}>Convertida</option>
            <option value={EstadoCotizacion.VENCIDA}>Vencida</option>
          </select>

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
                {searchTerm || estadoFilter 
                  ? 'No se encontraron cotizaciones con los filtros aplicados'
                  : 'Usa el botón "Nueva Cotización" en la parte superior para crear tu primera cotización'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Número
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Cliente
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Fecha
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Vencimiento
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Estado
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
                        Total
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
                            {cotizacion.cliente?.razon_social || 'Cliente no disponible'}
                          </div>
                          {cotizacion.cliente?.documento_numero && (
                            <div className="text-3 text-gray-500">
                              {cotizacion.cliente.documento_tipo}: {cotizacion.cliente.documento_numero}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-[0.875rem] text-gray-500">
                          {formatDate(cotizacion.fecha)}
                        </td>
                        <td className="p-4 text-[0.875rem] text-gray-500">
                          {cotizacion.fecha_vencimiento ? formatDate(cotizacion.fecha_vencimiento) : '-'}
                        </td>
                        <td className="p-4">
                          <span className="py-1 px-3 rounded-full text-3 font-medium">
                            {cotizacion.estado}
                          </span>
                        </td>
                        <td className="p-4 text-right text-[0.875rem] font-semibold">
                          {formatCurrency(cotizacion.total)}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/ventas/cotizaciones/${cotizacion.id}`)} className="p-2 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            {cotizacion.estado === EstadoCotizacion.BORRADOR && (
                              <>
                                <button
                                  onClick={() => router.push(`/dashboard/ventas/cotizaciones/${cotizacion.id}`)} className="p-2 rounded-[6px] border-0 bg-[#10b981] text-white cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => handleDelete(cotizacion.id, cotizacion.numero)} className="p-2 rounded-[6px] border-0 bg-red-500 text-white cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
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
