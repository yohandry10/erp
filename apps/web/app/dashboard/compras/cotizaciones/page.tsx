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
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '500',
        background: badge.bg,
        color: 'white'
      }}>
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
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL</h3>
            <FileText className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{totalCotizaciones}</div>
          <div className="stat-subtitle">Cotizaciones</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>BORRADORES</h3>
            <Edit className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value">
            {cotizaciones.filter(c => c.estado === 'BORRADOR').length}
          </div>
          <div className="stat-subtitle">En edición</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ENVIADAS</h3>
            <Send className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">
            {cotizaciones.filter(c => c.estado === 'ENVIADA').length}
          </div>
          <div className="stat-subtitle">Pendientes</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>APROBADAS</h3>
            <CheckCircle className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value">
            {cotizaciones.filter(c => c.estado === 'APROBADA').length}
          </div>
          <div className="stat-subtitle">Aprobadas</div>
        </div>

        <div className="stat-card alert">
          <div className="stat-header">
            <h3>VENCIDAS</h3>
            <Clock className="stat-icon" style={{ color: '#ef4444' }} />
          </div>
          <div className="stat-value warning">
            {cotizaciones.filter(c => c.estado === 'VENCIDA').length}
          </div>
          <div className="stat-subtitle">Expiradas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => handleEstadoFilterChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="">Todos los estados</option>
              <option value="BORRADOR">Borrador</option>
              <option value="ENVIADA">Enviada</option>
              <option value="APROBADA">Aprobada</option>
              <option value="RECHAZADA">Rechazada</option>
              <option value="VENCIDA">Vencida</option>
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Proveedor
            </label>
            <select
              value={proveedorFilter}
              onChange={(e) => handleProveedorFilterChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => handleFechaDesdeChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem', color: '#374151' }}>
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => handleFechaHastaChange(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                background: 'white'
              }}
            />
          </div>

          {isFilterActive && (
            <button
              onClick={handleClearFilters}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#ef4444'
              }}
            >
              <XCircle size={16} />
              Limpiar Filtros
            </button>
          )}

          <button
            onClick={handleExport}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <Download size={16} />
            Exportar
          </button>

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
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        N° Cotización
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Proveedor
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Fecha Cotización
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Vencimiento
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Total
                      </th>
                      <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Estado
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
                            {cotizacion.proveedores?.razon_social || 'N/A'}
                          </div>
                          {cotizacion.proveedores?.ruc && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              RUC: {cotizacion.proveedores.ruc}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#374151' }}>
                          {formatDate(cotizacion.fecha_cotizacion)}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                            {formatDate(cotizacion.fecha_vencimiento)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            ({cotizacion.validez_dias} días)
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                          {formatCurrency(cotizacion.total)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          {getEstadoBadge(cotizacion.estado)}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                              onClick={() => router.push(`/dashboard/compras/cotizaciones/${cotizacion.id}`)}
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
                            {cotizacion.estado === 'BORRADOR' && (
                              <button
                                onClick={() => router.push(`/dashboard/compras/cotizaciones/${cotizacion.id}/editar`)}
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
                          onClick={() => setCurrentPage(pageNum)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            background: currentPage === pageNum ? '#3b82f6' : 'white',
                            color: currentPage === pageNum ? 'white' : '#374151',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            minWidth: '40px'
                          }}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
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
