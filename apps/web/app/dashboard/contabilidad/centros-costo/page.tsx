'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  Building2,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Edit,
  BarChart3
} from 'lucide-react'

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

export default function CentrosCostoPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [centros, setCentros] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS')

  useEffect(() => {
    loadCentrosCosto()
  }, [])

  const loadCentrosCosto = async () => {
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
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getEstadoBadge = (activo: boolean) => {
    if (activo) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.375rem 0.75rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '600',
          background: '#10b981',
          color: 'white'
        }}>
          <CheckCircle size={12} />
          Activo
        </span>
      )
    }
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: '#ef4444',
        color: 'white'
      }}>
        <XCircle size={12} />
        Inactivo
      </span>
    )
  }

  // Filtrar centros de costo
  const filteredCentros = centros.filter(centro => {
    // Filtro de búsqueda
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesSearch = 
        centro.codigo.toLowerCase().includes(search) ||
        centro.nombre.toLowerCase().includes(search) ||
        (centro.descripcion && centro.descripcion.toLowerCase().includes(search))
      
      if (!matchesSearch) return false
    }

    // Filtro de estado
    if (estadoFilter !== 'TODOS') {
      if (estadoFilter === 'ACTIVO' && !centro.activo) return false
      if (estadoFilter === 'INACTIVO' && centro.activo) return false
    }

    return true
  })

  // Estadísticas
  const stats = {
    total: centros.length,
    activos: centros.filter(c => c.activo).length,
    inactivos: centros.filter(c => !c.activo).length
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando centros de costo...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--primary-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-600)'
            }}>
              <Building2 size={24} />
            </div>
            <h1 className="dashboard-title">Centros de Costo</h1>
          </div>
          <p className="dashboard-subtitle">
            Gestione los centros de costo para el control presupuestal y análisis de gastos
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadCentrosCosto}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            onClick={() => router.push('/dashboard/contabilidad/centros-costo/nuevo')}
            className="primary-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <Plus size={16} />
            Nuevo Centro de Costo
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Centros
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary-800)' }}>
            {stats.total}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Activos
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981' }}>
            {stats.activos}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Inactivos
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ef4444' }}>
            {stats.inactivos}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--primary-100)'
        }}>
          <Filter size={20} style={{ color: 'var(--primary-600)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Filtros
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Buscar
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ 
                position: 'absolute', 
                left: '0.75rem', 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: 'var(--primary-400)'
              }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Código, nombre o descripción..."
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  border: '1px solid var(--primary-300)',
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVO">Activos</option>
              <option value="INACTIVO">Inactivos</option>
            </select>
          </div>
        </div>

        {(searchTerm || estadoFilter !== 'TODOS') && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setSearchTerm('')
                setEstadoFilter('TODOS')
              }}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--primary-100)',
                color: 'var(--primary-700)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Lista de Centros de Costo */}
      <div className="activity-card">
        {error && (
          <div style={{ 
            padding: '1rem', 
            background: 'var(--red-50)', 
            borderRadius: '8px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <AlertCircle size={20} style={{ color: 'var(--red-600)' }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--red-700)', margin: 0 }}>
              {error}
            </p>
          </div>
        )}

        {filteredCentros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--primary-400)' }}>
            <Building2 size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--primary-600)' }}>
              No hay centros de costo
            </h3>
            <p style={{ marginBottom: '1.5rem' }}>
              {centros.length === 0 
                ? 'Aún no se han creado centros de costo'
                : 'No se encontraron centros de costo con los filtros aplicados'
              }
            </p>
            {centros.length === 0 && (
              <button
                onClick={() => router.push('/dashboard/contabilidad/centros-costo/nuevo')}
                className="primary-btn"
              >
                <Plus size={16} />
                Crear Primer Centro de Costo
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--primary-200)' }}>
                  <th style={{ 
                    textAlign: 'left', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Código
                  </th>
                  <th style={{ 
                    textAlign: 'left', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Nombre
                  </th>
                  <th style={{ 
                    textAlign: 'left', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Descripción
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Estado
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCentros.map((centro) => (
                  <tr 
                    key={centro.id}
                    style={{ 
                      borderBottom: '1px solid var(--primary-100)',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onClick={() => router.push(`/dashboard/contabilidad/centros-costo/${centro.id}`)}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-50)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                        {centro.codigo}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                        {centro.nombre}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: 'var(--primary-600)',
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {centro.descripcion || '-'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {getEstadoBadge(centro.activo)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/dashboard/contabilidad/centros-costo/${centro.id}`)
                          }}
                          style={{
                            padding: '0.5rem',
                            background: 'var(--primary-100)',
                            color: 'var(--primary-700)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title="Ver detalles"
                        >
                          <BarChart3 size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/dashboard/contabilidad/centros-costo/${centro.id}/editar`)
                          }}
                          style={{
                            padding: '0.5rem',
                            background: 'var(--primary-100)',
                            color: 'var(--primary-700)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title="Editar"
                        >
                          <Edit size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredCentros.length > 0 && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '1rem',
            borderTop: '1px solid var(--primary-200)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>
              Mostrando {filteredCentros.length} de {centros.length} centros de costo
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
