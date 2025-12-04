'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { 
  FileText, 
  Filter, 
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Search,
  Clock,
  Database,
  Shield,
  AlertCircle,
  User
} from 'lucide-react'
import './audit-logs.css'

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

export default function AuditLogsViewer() {
  const { get } = useApi()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, limit: 50 })
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 50, total: 0, totalPages: 0
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

  useEffect(() => { loadUsers() }, [])

  const loadLogs = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (filters.table_name) params.append('table_name', filters.table_name)
      if (filters.operation) params.append('operation', filters.operation)
      if (filters.user_id) params.append('user_id', filters.user_id)
      if (filters.start_date) params.append('start_date', filters.start_date)
      if (filters.end_date) params.append('end_date', filters.end_date)
      if (filters.page) params.append('page', filters.page.toString())
      if (filters.limit) params.append('limit', filters.limit.toString())

      const response = await get(`/api/audit-logs?${params.toString()}`)

      if (response) {
        const logsData = response.data?.data ?? response.data ?? []
        const paginationData = response.data?.pagination ?? response.pagination ?? pagination
        setLogs(Array.isArray(logsData) ? logsData : [])
        setPagination(paginationData)
      } else {
        throw new Error('Error al cargar logs de auditoría')
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

  const getOperationClass = (operation: string) => {
    switch (operation) {
      case 'INSERT': return 'status-success'
      case 'UPDATE': return 'audit-badge-update'
      case 'DELETE': return 'status-error'
      default: return 'audit-badge-update'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-PE', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
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
            <Shield size={32} className="audit-header-icon" />
            Logs de Auditoría
          </h1>
          <p className="dashboard-subtitle">
            Trazabilidad completa de cambios en el sistema
          </p>
        </div>
        <button onClick={loadLogs} className="refresh-btn" disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="activity-card audit-filters-card">
        <div className="audit-filters-header">
          <Filter size={20} className="text-blue-600" />
          <h2 className="audit-filters-title">Filtros</h2>
        </div>

        <div className="audit-filters-grid">
          {/* Search */}
          <div className="form-group">
            <label className="form-label">Buscar</label>
            <div className="audit-search-wrapper">
              <Search size={16} className="audit-search-icon" />
              <input
                type="text"
                placeholder="Buscar en logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input audit-search-input"
              />
            </div>
          </div>

          {/* Table Filter */}
          <div className="form-group">
            <label className="form-label">Tabla</label>
            <select
              value={filters.table_name || ''}
              onChange={(e) => setFilters({ ...filters, table_name: e.target.value || undefined, page: 1 })}
              className="form-input"
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
          <div className="form-group">
            <label className="form-label">Operación</label>
            <select
              value={filters.operation || ''}
              onChange={(e) => setFilters({ ...filters, operation: e.target.value as any || undefined, page: 1 })}
              className="form-input"
            >
              <option value="">Todas las operaciones</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          {/* User Filter */}
          <div className="form-group">
            <label className="form-label">Usuario</label>
            <select
              value={filters.user_id || ''}
              onChange={(e) => setFilters({ ...filters, user_id: e.target.value || undefined, page: 1 })}
              className="form-input"
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
          <div className="form-group">
            <label className="form-label">Desde</label>
            <input
              type="datetime-local"
              value={filters.start_date?.substring(0, 16) || ''}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value ? `${e.target.value}:00` : undefined, page: 1 })}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Hasta</label>
            <input
              type="datetime-local"
              value={filters.end_date?.substring(0, 16) || ''}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value ? `${e.target.value}:00` : undefined, page: 1 })}
              className="form-input"
            />
          </div>
        </div>

        {/* Clear Filters */}
        {(filters.table_name || filters.operation || filters.user_id || filters.start_date || filters.end_date) && (
          <button onClick={() => setFilters({ page: 1, limit: 50 })} className="btn btn-secondary btn-sm">
            Limpiar Filtros
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="activity-card audit-error-card">
          <AlertCircle size={20} />
          <p>{error}</p>
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
              <Database size={48} className="audit-empty-icon" />
              <h3>No hay logs de auditoría</h3>
              <p>No se encontraron registros que coincidan con los filtros seleccionados.</p>
            </div>
          </div>
        ) : (
          <div className="activity-card">
            <div className="activity-list">
              {filteredLogs.map((log) => (
                <div key={log.id} className="activity-item audit-log-item">
                  <div className="audit-log-content">
                    <div className="audit-log-header">
                      <span className={getOperationClass(log.operation)}>{log.operation}</span>
                      <strong className="audit-table-name">{log.table_name}</strong>
                      {log.record_id && (
                        <span className="audit-record-id">ID: {log.record_id.substring(0, 8)}...</span>
                      )}
                    </div>
                    
                    <div className="audit-log-meta">
                      <span className="audit-meta-item">
                        <Clock size={14} />
                        {formatDate(log.timestamp)}
                      </span>
                      {log.user_id && (
                        <span className="audit-meta-item">
                          <User size={14} />
                          {log.user_id.substring(0, 8)}...
                        </span>
                      )}
                      {log.ip_address && <span>{log.ip_address}</span>}
                      {log.changed_fields && log.changed_fields.length > 0 && (
                        <span className="audit-changed-badge">
                          {log.changed_fields.length} campo(s) cambiado(s)
                        </span>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {expandedLogs.has(log.id) && (
                      <div className="audit-details">
                        {log.old_values && Object.keys(log.old_values).length > 0 && (
                          <div className="audit-detail-section">
                            <h4 className="audit-detail-title audit-detail-title-old">Valores Anteriores</h4>
                            <pre className="audit-json audit-json-old">
                              {JSON.stringify(log.old_values, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.new_values && Object.keys(log.new_values).length > 0 && (
                          <div className="audit-detail-section">
                            <h4 className="audit-detail-title audit-detail-title-new">Valores Nuevos</h4>
                            <pre className="audit-json audit-json-new">
                              {JSON.stringify(log.new_values, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.changed_fields && log.changed_fields.length > 0 && (
                          <div className="audit-detail-section">
                            <h4 className="audit-detail-title">Campos Modificados</h4>
                            <div className="audit-fields-list">
                              {log.changed_fields.map((field) => (
                                <span key={field} className="audit-field-badge">{field}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="audit-detail-section">
                            <h4 className="audit-detail-title">Metadatos</h4>
                            <pre className="audit-json">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}

                        {log.user_agent && (
                          <p className="audit-user-agent">
                            <strong>User Agent:</strong> {log.user_agent}
                          </p>
                        )}
                      </div>
                    )}

                    <button onClick={() => toggleExpand(log.id)} className="audit-expand-btn">
                      {expandedLogs.has(log.id) ? (
                        <><ChevronDown size={16} /> Ocultar detalles</>
                      ) : (
                        <><ChevronRight size={16} /> Ver detalles</>
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
          <div className="audit-pagination">
            <button
              onClick={() => setFilters({ ...filters, page: Math.max(1, pagination.page - 1) })}
              disabled={pagination.page === 1}
              className="btn btn-secondary"
            >
              Anterior
            </button>
            <span className="audit-pagination-info">
              Página {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
            </span>
            <button
              onClick={() => setFilters({ ...filters, page: Math.min(pagination.totalPages, pagination.page + 1) })}
              disabled={pagination.page >= pagination.totalPages}
              className="btn btn-secondary"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
