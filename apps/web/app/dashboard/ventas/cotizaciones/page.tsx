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
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL COTIZACIONES</h3>
            <FileText className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{totalCotizaciones}</div>
          <div className="stat-subtitle">Cotizaciones registradas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search 
              size={20} 
              style={{ 
                position: 'absolute', 
                left: '1rem', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                color: '#9ca3af' 
              }} 
            />
            <input
              type="text"
              placeholder="Buscar por número, cliente..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem 0.75rem 3rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <select
            value={estadoFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              background: 'white'
            }}
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
            className="refresh-btn"
            style={{ padding: '0.75rem 1rem' }}
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
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                No hay cotizaciones
              </h3>
              <p style={{ marginBottom: '1.5rem' }}>
                {searchTerm || estadoFilter 
                  ? 'No se encontraron cotizaciones con los filtros aplicados'
                  : 'Usa el botón "Nueva Cotización" en la parte superior para crear tu primera cotización'}
              </p>
            </div>
          ) : (
            <>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Número
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Cliente
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Fecha
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Vencimiento
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Estado
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Total
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotizaciones.map((cotizacion) => (
                      <tr key={cotizacion.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                            {cotizacion.numero}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                            {cotizacion.cliente?.razon_social || 'Cliente no disponible'}
                          </div>
                          {cotizacion.cliente?.documento_numero && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {cotizacion.cliente.documento_tipo}: {cotizacion.cliente.documento_numero}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          {formatDate(cotizacion.fecha)}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          {cotizacion.fecha_vencimiento ? formatDate(cotizacion.fecha_vencimiento) : '-'}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            background: ESTADO_COLORS[cotizacion.estado].bg,
                            color: ESTADO_COLORS[cotizacion.estado].text
                          }}>
                            {cotizacion.estado}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600' }}>
                          {formatCurrency(cotizacion.total)}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                              onClick={() => router.push(`/dashboard/ventas/cotizaciones/${cotizacion.id}`)}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#3b82f6',
                                color: 'white',
                                cursor: 'pointer'
                              }}
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            {cotizacion.estado === EstadoCotizacion.BORRADOR && (
                              <>
                                <button
                                  onClick={() => router.push(`/dashboard/ventas/cotizaciones/${cotizacion.id}`)}
                                  style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#10b981',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  onClick={() => handleDelete(cotizacion.id, cotizacion.numero)}
                                  style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: '#ef4444',
                                    color: 'white',
                                    cursor: 'pointer'
                                  }}
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
                <div style={{ 
                  padding: '1rem', 
                  borderTop: '1px solid rgba(0,0,0,0.1)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                    Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                    <strong>{Math.min(currentPage * itemsPerPage, totalCotizaciones)}</strong> de{' '}
                    <strong>{totalCotizaciones}</strong> cotizaciones
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: currentPage === 1 ? '#f3f4f6' : 'white',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: currentPage === totalPages ? '#f3f4f6' : 'white',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '0.875rem'
                      }}
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
