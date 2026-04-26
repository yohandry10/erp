'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cliente, TipoCliente } from '@/types/ventas'
import { 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Edit,
  Trash2,
  Eye,
  Users,
  RefreshCw
} from 'lucide-react'

export default function ClientesPage() {
  const router = useRouter()
  const { get, del } = useApi()
  
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalClientes, setTotalClientes] = useState(0)
  const itemsPerPage = 10

  const loadClientes = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (tipoFilter) params.append('tipo', tipoFilter)
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await get(`/api/ventas/clientes?${params.toString()}`)
      
      // El backend devuelve { data: [], pagination: { total, page, limit, totalPages } }
      if (response?.data) {
        setClientes(response.data || [])
        setTotalClientes(response.pagination?.total || 0)
        setTotalPages(response.pagination?.totalPages || 1)
      }
    } catch (error) {
      console.error('Error loading clientes:', error)
      alert('Error: No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, tipoFilter, currentPage, get])

  useEffect(() => {
    loadClientes()
  }, [loadClientes])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleFilterChange = (value: string) => {
    setTipoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async (id: string, razonSocial: string) => {
    if (!confirm(`¿Está seguro de eliminar el cliente "${razonSocial}"?`)) {
      return
    }

    try {
      await del(`/api/ventas/clientes/${id}`)
      alert('✅ Cliente eliminado correctamente')
      loadClientes()
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'No se pudo eliminar el cliente'}`)
    }
  }

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  const handleImport = () => {
    alert('📤 Funcionalidad de importación próximamente')
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Clientes</h1>
          <p className="dashboard-subtitle">Gestiona tu base de datos de clientes</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={() => router.push('/dashboard/ventas/clientes/nuevo')}
        >
          <Plus size={20} />
          Nuevo Cliente
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL CLIENTES</h3>
            <Users className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value">{totalClientes}</div>
          <div className="stat-subtitle">Clientes registrados</div>
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
              placeholder="Buscar por RUC, DNI, nombre o razón social..."
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
            value={tipoFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              background: 'white'
            }}
          >
            <option value="">Todos los tipos</option>
            <option value={TipoCliente.PERSONA}>Persona</option>
            <option value={TipoCliente.EMPRESA}>Empresa</option>
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
            onClick={loadClientes}
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
              <p>Cargando clientes...</p>
            </div>
          ) : clientes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <Users size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                No hay clientes
              </h3>
              <p style={{ marginBottom: '1.5rem' }}>
                {searchTerm || tipoFilter 
                  ? 'No se encontraron clientes con los filtros aplicados'
                  : 'Usa el botón "Nuevo Cliente" en la parte superior para agregar tu primer cliente'}
              </p>
            </div>
          ) : (
            <>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        RUC/DNI
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Nombre / Razón Social
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Tipo
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Email
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Teléfono
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((cliente) => (
                      <tr key={cliente.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                            {cliente.documento_numero}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                            {cliente.razon_social}
                          </div>
                          {cliente.nombre_comercial && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {cliente.nombre_comercial}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            background: cliente.tipo === TipoCliente.EMPRESA ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: cliente.tipo === TipoCliente.EMPRESA ? '#2563eb' : '#059669'
                          }}>
                            {cliente.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          {cliente.email || '-'}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          {cliente.telefono || '-'}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button
                              onClick={() => router.push(`/dashboard/ventas/clientes/${cliente.id}`)}
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
                              onClick={() => router.push(`/dashboard/ventas/clientes/${cliente.id}/editar`)}
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
                              onClick={() => handleDelete(cliente.id, cliente.razon_social)}
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
                    <strong>{Math.min(currentPage * itemsPerPage, totalClientes)}</strong> de{' '}
                    <strong>{totalClientes}</strong> clientes
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
