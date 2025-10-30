'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { 
  FileText, 
  Calendar, 
  User, 
  Filter, 
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
  Clock,
  Database,
  Shield,
  AlertCircle
} from 'lucide-react'

interface AuditLog {
  id: string
  table_name: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  record_id?: string
  old_values?: Record<string, any>
  new_values?: Record<string, any>
  changed_fields?: string[]
  user_id?: string
  tenant_id: string
  ip_address?: string
  user_agent?: string
  timestamp: string
  metadata?: Record<string, any>
}

interface AuditFilters {
  table_name?: string
  operation?: 'INSERT' | 'UPDATE' | 'DELETE'
  user_id?: string
  start_date?: string
  end_date?: string
  page?: number
  limit?: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Componente para visualizar logs de auditoría del sistema
 * Usa estilos CSS consistentes con el resto de la aplicación
 */
export default function AuditLogsViewer() {
  const { get } = useApi()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    limit: 50
  })
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [users, setUsers] = useState<Array<{ id: string; nombre: string; email: string }>>([])

  const loadUsers = async () => {
    try {
      const response = await get('/api/users')
      if (response?.success && response.data) {
        const usersData = Array.isArray(response.data) ? response.data : response.data.data || []
        setUsers(usersData.map((u: any) => ({ id: u.id, nombre: u.nombre || u.email, email: u.email })))
      }
    } catch (err) {
      console.error('Error cargando usuarios:', err)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const loadLogs = async () => {
    try {
      setLoading(true)
      setError(null)

      // Construir query params
      const params = new URLSearchParams()
      if (filters.table_name) params.append('table_name', filters.table_name)
      if (filters.operation) params.append('operation', filters.operation)
      if (filters.user_id) params.append('user_id', filters.user_id)
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)
      if (filters.page) params.append('page', filters.page.toString())
      if (filters.limit) params.append('limit', filters.limit.toString())

      const response = await get(`/api/audit-logs?${params.toString()}`)

      if (response?.success && response.data) {
        setLogs(response.data.data || [])
        setPagination(response.data.pagination || pagination)
      } else {
        throw new Error(response?.message || 'Error al cargar logs de auditoría')
      }
    } catch (err: any) {
      console.error('Error cargando logs:', err)
      setError(err.message || 'Error al cargar logs de auditoría')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [filters.page, filters.limit, filters.table_name, filters.operation, filters.user_id, filters.start_date, filters.end_date])

  const toggleExpand = (logId: string) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId)
    } else {
      newExpanded.add(logId)
    }
    setExpandedLogs(newExpanded)
  }

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case 'INSERT':
        return 'var(--emerald-600)'
      case 'UPDATE':
        return 'var(--blue-600)'
      case 'DELETE':
        return 'var(--red-600)'
      default:
        return 'var(--primary-600)'
    }
  }

  const getOperationBadge = (operation: string) => {
    const colors = {
      INSERT: { bg: 'var(--emerald-50)', color: 'var(--emerald-700)', border: 'var(--emerald-200)' },
      UPDATE: { bg: 'var(--blue-50)', color: 'var(--blue-700)', border: 'var(--blue-200)' },
      DELETE: { bg: 'var(--red-50)', color: 'var(--red-700)', border: 'var(--red-200)' }
    }
    
    const config = colors[operation as keyof typeof colors] || colors.UPDATE
    
    return (
      <span style={{
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`
      }}>
        {operation}
      </span>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true
    
    const searchLower = searchTerm.toLowerCase()
    return (
      log.table_name?.toLowerCase().includes(searchLower) ||
      log.operation?.toLowerCase().includes(searchLower) ||
      log.record_id?.toLowerCase().includes(searchLower) ||
      log.ip_address?.toLowerCase().includes(searchLower) ||
      JSON.stringify(log.new_values || {}).toLowerCase().includes(searchLower) ||
      JSON.stringify(log.old_values || {}).toLowerCase().includes(searchLower)
    )
  })

  if (loading && logs.length === 0) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando logs de auditoría...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">
            <Shield size={32} style={{ marginRight: '0.75rem' }} />
            Logs de Auditoría
          </h1>
          <p className="dashboard-subtitle">
            Trazabilidad completa de cambios en el sistema
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="refresh-btn"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--primary-100)'
        }}>
          <Filter size={20} style={{ color: 'var(--primary-600)' }} />
          <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Filtros
          </h2>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {/* Search */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
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
                placeholder="Buscar en logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  borderRadius: 'var(--border-radius)',
                  border: '1px solid var(--primary-300)',
                  fontSize: '0.875rem',
                  background: 'white',
                  color: 'var(--primary-800)'
                }}
              />
            </div>
          </div>

          {/* Table Filter */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
            }}>
              Tabla
            </label>
            <select
              value={filters.table_name || ''}
              onChange={(e) => setFilters({ ...filters, table_name: e.target.value || undefined, page: 1 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--primary-300)',
                fontSize: '0.875rem',
                background: 'white',
                color: 'var(--primary-800)'
              }}
            >
              <option value="">Todas las tablas</option>
              <option value="ordenes_compra">Órdenes de Compra</option>
              <option value="pedidos_venta">Pedidos de Venta</option>
              <option value="cpe">Comprobantes Electrónicos</option>
              <option value="gre_guias">Guías de Remisión</option>
              <option value="asientos_contables">Asientos Contables</option>
              <option value="movimientos_bancarios">Movimientos Bancarios</option>
              <option value="cuentas_por_cobrar">Cuentas por Cobrar</option>
              <option value="cuentas_por_pagar">Cuentas por Pagar</option>
              <option value="usuarios_sistema">Usuarios</option>
              <option value="roles">Roles</option>
            </select>
          </div>

          {/* Operation Filter */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
            }}>
              Operación
            </label>
            <select
              value={filters.operation || ''}
              onChange={(e) => setFilters({ ...filters, operation: e.target.value as any || undefined, page: 1 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--primary-300)',
                fontSize: '0.875rem',
                background: 'white',
                color: 'var(--primary-800)'
              }}
            >
              <option value="">Todas las operaciones</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
            }}>
              Usuario
            </label>
            <select
              value={filters.user_id || ''}
              onChange={(e) => setFilters({ ...filters, user_id: e.target.value || undefined, page: 1 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--primary-300)',
                fontSize: '0.875rem',
                background: 'white',
                color: 'var(--primary-800)'
              }}
            >
              <option value="">Todos los usuarios</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.nombre} ({user.email})
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
            }}>
              Desde
            </label>
            <input
              type="datetime-local"
              value={filters.start_date?.split('T')[0] && filters.start_date?.split('T')[1] ? filters.start_date.substring(0, 16) : ''}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value ? `${e.target.value}:00` : undefined, page: 1 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--primary-300)',
                fontSize: '0.875rem',
                background: 'white',
                color: 'var(--primary-800)'
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
            }}>
              Hasta
            </label>
            <input
              type="datetime-local"
              value={filters.end_date?.split('T')[0] && filters.end_date?.split('T')[1] ? filters.end_date.substring(0, 16) : ''}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value ? `${e.target.value}:00` : undefined, page: 1 })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--primary-300)',
                fontSize: '0.875rem',
                background: 'white',
                color: 'var(--primary-800)'
              }}
            />
          </div>
        </div>

        {/* Clear Filters */}
        {(filters.table_name || filters.operation || filters.user_id || filters.start_date || filters.end_date) && (
          <button
            onClick={() => setFilters({ page: 1, limit: 50 })}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--border-radius)',
              border: '1px solid var(--primary-300)',
              background: 'white',
              color: 'var(--primary-700)',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="activity-card" style={{ marginBottom: '1.5rem', background: 'var(--red-50)', border: '1px solid var(--red-200)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--red-700)' }}>
            <AlertCircle size={20} />
            <p style={{ margin: 0, fontWeight: '600' }}>{error}</p>
          </div>
        </div>
      )}

      {/* Logs List */}
      <div className="activity-section">
        <div className="activity-title">
          <FileText size={24} />
          Registros ({pagination.total})
        </div>

        {filteredLogs.length === 0 ? (
          <div className="activity-card">
            <div className="activity-empty">
              <Database size={48} style={{ margin: '0 auto 1rem', opacity: 0.5, color: 'var(--primary-400)' }} />
              <h3>No hay logs de auditoría</h3>
              <p>No se encontraron registros que coincidan con los filtros seleccionados.</p>
            </div>
          </div>
        ) : (
          <div className="activity-card">
            <div className="activity-list">
              {filteredLogs.map((log) => (
                <div key={log.id} className="activity-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      {getOperationBadge(log.operation)}
                      <strong style={{ fontSize: '0.95rem', color: 'var(--primary-800)' }}>
                        {log.table_name}
                      </strong>
                      {log.record_id && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--primary-500)', fontFamily: 'monospace' }}>
                          ID: {log.record_id.substring(0, 8)}...
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.875rem', color: 'var(--primary-600)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={14} />
                        {formatDate(log.timestamp)}
                      </div>
                      {log.user_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <User size={14} />
                          {log.user_id.substring(0, 8)}...
                        </div>
                      )}
                      {log.ip_address && (
                        <span>{log.ip_address}</span>
                      )}
                      {log.changed_fields && log.changed_fields.length > 0 && (
                        <span style={{ background: 'var(--blue-50)', padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {log.changed_fields.length} campo(s) cambiado(s)
                        </span>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {expandedLogs.has(log.id) && (
                      <div style={{ 
                        marginTop: '1rem', 
                        padding: '1rem', 
                        background: 'var(--primary-50)', 
                        borderRadius: 'var(--border-radius)',
                        border: '1px solid var(--primary-200)'
                      }}>
                        {/* Old Values */}
                        {log.old_values && Object.keys(log.old_values).length > 0 && (
                          <div style={{ marginBottom: '1rem' }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--red-700)', marginBottom: '0.5rem' }}>
                              Valores Anteriores
                            </h4>
                            <pre style={{
                              fontSize: '0.75rem',
                              padding: '0.75rem',
                              background: 'white',
                              borderRadius: 'var(--border-radius)',
                              border: '1px solid var(--red-200)',
                              overflow: 'auto',
                              maxHeight: '200px',
                              margin: 0
                            }}>
                              {JSON.stringify(log.old_values, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* New Values */}
                        {log.new_values && Object.keys(log.new_values).length > 0 && (
                          <div style={{ marginBottom: '1rem' }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--emerald-700)', marginBottom: '0.5rem' }}>
                              Valores Nuevos
                            </h4>
                            <pre style={{
                              fontSize: '0.75rem',
                              padding: '0.75rem',
                              background: 'white',
                              borderRadius: 'var(--border-radius)',
                              border: '1px solid var(--emerald-200)',
                              overflow: 'auto',
                              maxHeight: '200px',
                              margin: 0
                            }}>
                              {JSON.stringify(log.new_values, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Changed Fields */}
                        {log.changed_fields && log.changed_fields.length > 0 && (
                          <div style={{ marginBottom: '1rem' }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-700)', marginBottom: '0.5rem' }}>
                              Campos Modificados
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {log.changed_fields.map((field) => (
                                <span key={field} style={{
                                  padding: '0.25rem 0.5rem',
                                  background: 'var(--blue-100)',
                                  color: 'var(--blue-700)',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: '600'
                                }}>
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Metadata */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-700)', marginBottom: '0.5rem' }}>
                              Metadatos
                            </h4>
                            <pre style={{
                              fontSize: '0.75rem',
                              padding: '0.75rem',
                              background: 'white',
                              borderRadius: 'var(--border-radius)',
                              border: '1px solid var(--primary-200)',
                              overflow: 'auto',
                              maxHeight: '200px',
                              margin: 0
                            }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* User Agent */}
                        {log.user_agent && (
                          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                            <strong>User Agent:</strong> {log.user_agent}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expand/Collapse Button */}
                    <button
                      onClick={() => toggleExpand(log.id)}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: 'var(--primary-600)',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {expandedLogs.has(log.id) ? (
                        <>
                          <ChevronDown size={16} />
                          Ocultar detalles
                        </>
                      ) : (
                        <>
                          <ChevronRight size={16} />
                          Ver detalles
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            gap: '1rem',
            marginTop: '2rem',
            padding: '1rem',
            background: 'var(--primary-50)',
            borderRadius: 'var(--border-radius)'
          }}>
            <button
              onClick={() => setFilters({ ...filters, page: Math.max(1, pagination.page - 1) })}
              disabled={pagination.page === 1}
              className="modal-btn modal-btn-secondary"
              style={{
                opacity: pagination.page === 1 ? 0.5 : 1,
                cursor: pagination.page === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Anterior
            </button>
            <span style={{ fontSize: '0.875rem', color: 'var(--primary-700)', fontWeight: '600' }}>
              Página {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
            </span>
            <button
              onClick={() => setFilters({ ...filters, page: Math.min(pagination.totalPages, pagination.page + 1) })}
              disabled={pagination.page >= pagination.totalPages}
              className="modal-btn modal-btn-secondary"
              style={{
                opacity: pagination.page >= pagination.totalPages ? 0.5 : 1,
                cursor: pagination.page >= pagination.totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

