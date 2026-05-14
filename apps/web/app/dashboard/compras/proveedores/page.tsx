'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Proveedor } from '@/types/compras'
import { 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Edit,
  Trash2,
  Eye,
  Building2,
  RefreshCw,
  Filter
} from 'lucide-react'

export default function ProveedoresPage() {
  const router = useRouter()
  const { get, del } = useApi()
  
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activoFilter, setActivoFilter] = useState<string>('')
  const [condicionesPagoFilter, setCondicionesPagoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProveedores, setTotalProveedores] = useState(0)
  const loadRequestIdRef = useRef(0)
  const itemsPerPage = 10

  const loadProveedores = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (searchTerm) params.append('search', searchTerm)
      if (activoFilter !== '') params.append('activo', activoFilter)
      if (condicionesPagoFilter) params.append('condiciones_pago', condicionesPagoFilter)
      
      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage
      params.append('limit', itemsPerPage.toString())
      params.append('offset', offset.toString())

      const response = await get(`/api/compras/proveedores?${params.toString()}`)

      if (requestId !== loadRequestIdRef.current) {
        return
      }
      
      if (response?.success) {
        const data = response.data || []
        setProveedores(data)
        setTotalProveedores(response.count || data.length)
        setTotalPages(Math.ceil((response.count || data.length) / itemsPerPage))
      }
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }
      console.error('Error loading proveedores:', error)
      alert('Error: No se pudieron cargar los proveedores')
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [searchTerm, activoFilter, condicionesPagoFilter, currentPage, get])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleActivoFilterChange = (value: string) => {
    setActivoFilter(value)
    setCurrentPage(1)
  }

  const handleCondicionesPagoFilterChange = (value: string) => {
    setCondicionesPagoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async (id: string, razonSocial: string) => {
    if (!confirm(`¿Está seguro de desactivar el proveedor "${razonSocial}"?`)) {
      return
    }

    try {
      await del(`/api/compras/proveedores/${id}`)
      alert('✅ Proveedor desactivado correctamente')
      loadProveedores()
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'No se pudo desactivar el proveedor'}`)
    }
  }

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  const handleImport = () => {
    alert('📤 Funcionalidad de importación próximamente')
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Proveedores</h1>
          <p className="dashboard-subtitle">Gestiona tu red de proveedores estratégicos</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={() => router.push('/dashboard/compras/proveedores/nuevo')}
        >
          <Plus size={20} />
          Nuevo Proveedor
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL PROVEEDORES</h3>
            <Building2 className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{totalProveedores}</div>
          <div className="stat-subtitle">Proveedores registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ACTIVOS</h3>
            <span className="stat-icon" style={{ fontSize: '1.5rem' }}>✅</span>
          </div>
          <div className="stat-value">
            {proveedores.filter(p => p.activo).length}
          </div>
          <div className="stat-subtitle">Proveedores activos</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>INACTIVOS</h3>
            <span className="stat-icon" style={{ fontSize: '1.5rem' }}>⏸️</span>
          </div>
          <div className="stat-value">
            {proveedores.filter(p => !p.activo).length}
          </div>
          <div className="stat-subtitle">Proveedores inactivos</div>
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
              placeholder="Buscar por RUC, razón social o nombre comercial..."
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
            value={activoFilter}
            onChange={(e) => handleActivoFilterChange(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              background: 'white',
              minWidth: '150px'
            }}
          >
            <option value="">Todos los estados</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>

          <select
            value={condicionesPagoFilter}
            onChange={(e) => handleCondicionesPagoFilterChange(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              background: 'white',
              minWidth: '180px'
            }}
          >
            <option value="">Todas las condiciones</option>
            <option value="CONTADO">Contado</option>
            <option value="CREDITO_7">Crédito 7 días</option>
            <option value="CREDITO_15">Crédito 15 días</option>
            <option value="CREDITO_30">Crédito 30 días</option>
            <option value="CREDITO_45">Crédito 45 días</option>
            <option value="CREDITO_60">Crédito 60 días</option>
            <option value="CREDITO_90">Crédito 90 días</option>
          </select>

          <button
            onClick={handleImport}
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
            <Upload size={16} />
            Importar
          </button>

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
            onClick={loadProveedores}
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
              <p>Cargando proveedores...</p>
            </div>
          ) : proveedores.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <Building2 size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                No hay proveedores
              </h3>
              <p style={{ marginBottom: '1.5rem' }}>
                {searchTerm || activoFilter || condicionesPagoFilter
                  ? 'No se encontraron proveedores con los filtros aplicados'
                  : 'Comienza agregando tu primer proveedor'}
              </p>
              {!searchTerm && !activoFilter && !condicionesPagoFilter && (
                <button
                  onClick={() => router.push('/dashboard/compras/proveedores/nuevo')}
                  className="refresh-btn"
                >
                  <Plus size={16} />
                  Crear Primer Proveedor
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
                        RUC
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Razón Social
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Contacto
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Condiciones
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Límite Crédito
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
                    {proveedores.map((proveedor) => (
                      <tr key={proveedor.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                            {proveedor.ruc}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                            {proveedor.razon_social}
                          </div>
                          {proveedor.nombre_comercial && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {proveedor.nombre_comercial}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                            {proveedor.contacto || '-'}
                          </div>
                          {proveedor.email && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {proveedor.email}
                            </div>
                          )}
                          {proveedor.telefono && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              📞 {proveedor.telefono}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          {proveedor.condiciones_pago ? (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              background: proveedor.condiciones_pago === 'CONTADO' 
                                ? 'rgba(16, 185, 129, 0.1)' 
                                : 'rgba(59, 130, 246, 0.1)',
                              color: proveedor.condiciones_pago === 'CONTADO' 
                                ? '#059669' 
                                : '#2563eb'
                            }}>
                              {proveedor.condiciones_pago.replace('CREDITO_', 'Crédito ')}
                            </span>
                          ) : '-'}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                          {formatCurrency(proveedor.limite_credito)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            background: proveedor.activo ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: proveedor.activo ? '#059669' : '#dc2626'
                          }}>
                            {proveedor.activo ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                              onClick={() => router.push(`/dashboard/compras/proveedores/${proveedor.id}`)}
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
                            <button
                              onClick={() => router.push(`/dashboard/compras/proveedores/${proveedor.id}/editar`)}
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
                            {proveedor.activo && (
                              <button
                                onClick={() => handleDelete(proveedor.id, proveedor.razon_social)}
                                style={{
                                  padding: '0.5rem',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#ef4444',
                                  color: 'white',
                                  cursor: 'pointer'
                                }}
                                title="Desactivar"
                              >
                                <Trash2 size={16} />
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
                    <strong>{Math.min(currentPage * itemsPerPage, totalProveedores)}</strong> de{' '}
                    <strong>{totalProveedores}</strong> proveedores
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
