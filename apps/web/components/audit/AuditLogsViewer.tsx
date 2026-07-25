'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Shield,
  User,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { apiSucceeded, unwrapApiArray, unwrapApiData } from '@/lib/api-contract'
import { PageShell } from '@/components/erp/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

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

const operationClass = (operation: string) => {
  switch (operation) {
    case 'INSERT':
      return 'border-cyan-300/30 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700'
    case 'UPDATE':
      return 'border-blue-300/25 bg-blue-300/10 text-blue-700 dark:text-blue-200 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700'
    case 'DELETE':
      return 'border-border/25 bg-slate-300/10 text-foreground/90 group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground/85'
    default:
      return 'border-blue-300/25 bg-blue-300/10 text-blue-700 dark:text-blue-200 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700'
  }
}

const fieldBlockClass = 'rounded-2xl border border-cyan-400/15 bg-card/60 p-3 text-xs text-foreground/90 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground/85'
const inputClass = 'h-10 rounded-md border border-cyan-400/20 bg-card/70 px-3 text-sm text-foreground outline-none transition focus:border-cyan-300 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground group-data-[erp-theme=light]/dashboard:focus:border-blue-400'

export default function AuditLogsViewer() {
  const { get } = useApi({ showErrorToast: false })
  const { hasPermission: canLoadUsers, loading: usersPermissionLoading } = usePermission('users', 'manage', '')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, limit: 50 })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [searchTerm, setSearchTerm] = useState('')
  const [users, setUsers] = useState<Array<{ id: string; nombre: string; email: string }>>([])

  const loadUsers = useCallback(async () => {
    if (usersPermissionLoading || !canLoadUsers) {
      setUsers([])
      return
    }

    try {
      const response = await get('/api/users')
      if (apiSucceeded(response)) {
        const usersData = unwrapApiArray<any>(response)
        setUsers(usersData.map((u: any) => ({ id: u.id, nombre: u.nombre || u.email, email: u.email })))
      }
    } catch (err) {
      console.error('Error cargando usuarios:', err)
    }
  }, [canLoadUsers, get, usersPermissionLoading])

  useEffect(() => { loadUsers() }, [loadUsers])

  const loadLogs = useCallback(async () => {
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

      if (apiSucceeded(response)) {
        const payload = unwrapApiData<any>(response, {})
        const logsData = Array.isArray(payload) ? payload : payload.data ?? []
        const paginationData = payload.pagination ?? (response as any)?.pagination
        setLogs(Array.isArray(logsData) ? logsData : [])
        setPagination(prev => paginationData ?? prev)
      } else {
        throw new Error('Error al cargar logs de auditoría')
      }
    } catch (err: any) {
      console.error('Error cargando logs:', err)
      setError(err.message || 'Error al cargar logs de auditoría')
    } finally {
      setLoading(false)
    }
  }, [filters, get])

  useEffect(() => { loadLogs() }, [loadLogs])

  const toggleExpand = (logId: string) => {
    const next = new Set(expandedLogs)
    if (next.has(logId)) next.delete(logId)
    else next.add(logId)
    setExpandedLogs(next)
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

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
      <PageShell title="Logs de Auditoría" description="Cargando trazabilidad completa del sistema.">
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-cyan-400/20 bg-card/60 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground/85">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300 group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:border-t-blue-600" />
            <p className="text-sm font-semibold">Cargando logs de auditoría...</p>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title={<span className="inline-flex items-center gap-3"><Shield className="h-7 w-7 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" /> Logs de Auditoría</span>}
      description="Trazabilidad completa de cambios críticos, usuarios, documentos y operaciones."
      actions={<Button onClick={loadLogs} disabled={loading} className="gap-2"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Actualizar</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground"><Filter className="h-5 w-5 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" /> Filtros</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-2 text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
              <span>Buscar</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary group-data-[erp-theme=light]/dashboard:text-blue-500" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar en logs..." className={`${inputClass} pl-9`} />
              </div>
            </label>

            <label className="space-y-2 text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
              <span>Tabla</span>
              <select value={filters.table_name || ''} onChange={(e) => setFilters({ ...filters, table_name: e.target.value || undefined, page: 1 })} className={inputClass}>
                <option value="">Todas las tablas</option>
                <option value="auth_login_attempts">Logins</option>
                <option value="eventos_pos">Eventos POS</option>
                <option value="caja_audit_log">Auditoría de Caja</option>
                <option value="integration_logs">Integraciones</option>
                <option value="clientes">Clientes</option>
                <option value="proveedores">Proveedores</option>
                <option value="ordenes_compra">Órdenes de Compra</option>
                <option value="recepciones">Recepciones</option>
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
            </label>

            <label className="space-y-2 text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
              <span>Operación</span>
              <select value={filters.operation || ''} onChange={(e) => setFilters({ ...filters, operation: e.target.value as any || undefined, page: 1 })} className={inputClass}>
                <option value="">Todas las operaciones</option>
                <option value="INSERT">INSERT</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
              <span>Usuario</span>
              <select value={filters.user_id || ''} onChange={(e) => setFilters({ ...filters, user_id: e.target.value || undefined, page: 1 })} className={inputClass}>
                <option value="">Todos los usuarios</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.nombre} ({user.email})</option>)}
              </select>
            </label>

            <label className="space-y-2 text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
              <span>Desde</span>
              <input type="datetime-local" value={filters.start_date?.substring(0, 16) || ''} onChange={(e) => setFilters({ ...filters, start_date: e.target.value ? `${e.target.value}:00` : undefined, page: 1 })} className={inputClass} />
            </label>

            <label className="space-y-2 text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">
              <span>Hasta</span>
              <input type="datetime-local" value={filters.end_date?.substring(0, 16) || ''} onChange={(e) => setFilters({ ...filters, end_date: e.target.value ? `${e.target.value}:00` : undefined, page: 1 })} className={inputClass} />
            </label>

            {(filters.table_name || filters.operation || filters.user_id || filters.start_date || filters.end_date) && (
              <Button variant="secondary" onClick={() => setFilters({ page: 1, limit: 50 })}>Limpiar filtros</Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground">
              <FileText className="h-5 w-5 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" />
              Registros ({pagination.total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:border-amber-200 group-data-[erp-theme=light]/dashboard:bg-amber-50 group-data-[erp-theme=light]/dashboard:text-amber-800">
                <AlertCircle className="h-5 w-5" />
                {error}
              </div>
            )}

            {filteredLogs.length === 0 ? (
              <div className="rounded-2xl border border-cyan-400/15 bg-card/50 p-10 text-center group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30">
                <Database className="mx-auto mb-4 h-10 w-10 text-primary group-data-[erp-theme=light]/dashboard:text-blue-500" />
                <h3 className="font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">No hay logs de auditoría</h3>
                <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">No se encontraron registros con los filtros seleccionados.</p>
              </div>
            ) : (
              <div className="divide-y divide-cyan-400/10 overflow-hidden rounded-2xl border border-cyan-400/15 group-data-[erp-theme=light]/dashboard:divide-slate-100 group-data-[erp-theme=light]/dashboard:border-border">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className={operationClass(log.operation)}>{log.operation}</Badge>
                      <strong className="text-blue-700 dark:text-blue-200 group-data-[erp-theme=light]/dashboard:text-foreground">{log.table_name}</strong>
                      {log.record_id && <span className="font-mono text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">ID: {log.record_id.substring(0, 8)}...</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                      <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{formatDate(log.timestamp)}</span>
                      {log.user_id && <span className="flex items-center gap-1"><User className="h-4 w-4" />{log.user_id.substring(0, 8)}...</span>}
                      {log.ip_address && <span>{log.ip_address}</span>}
                      {log.changed_fields?.length ? <Badge className="border-blue-300/25 bg-blue-300/10 text-blue-700 dark:text-blue-200 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">{log.changed_fields.length} campo(s)</Badge> : null}
                    </div>

                    {expandedLogs.has(log.id) && (
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {log.old_values && Object.keys(log.old_values).length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-semibold text-foreground/90 group-data-[erp-theme=light]/dashboard:text-foreground/85">Valores anteriores</h4>
                            <pre className={fieldBlockClass}>{JSON.stringify(log.old_values, null, 2)}</pre>
                          </div>
                        )}
                        {log.new_values && Object.keys(log.new_values).length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-semibold text-primary group-data-[erp-theme=light]/dashboard:text-blue-700">Valores nuevos</h4>
                            <pre className={fieldBlockClass}>{JSON.stringify(log.new_values, null, 2)}</pre>
                          </div>
                        )}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-semibold text-foreground/90 group-data-[erp-theme=light]/dashboard:text-foreground/85">Metadatos</h4>
                            <pre className={fieldBlockClass}>{JSON.stringify(log.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}

                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(log.id)} className="mt-3 gap-2 text-muted-foreground hover:text-primary group-data-[erp-theme=light]/dashboard:text-foreground/80 group-data-[erp-theme=light]/dashboard:hover:text-blue-700">
                      {expandedLogs.has(log.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {expandedLogs.has(log.id) ? 'Ocultar detalles' : 'Ver detalles'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {pagination.totalPages > 1 && (
              <div className="mt-5 flex flex-col items-center justify-center gap-3 rounded-2xl border border-cyan-400/15 bg-card/50 p-4 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30 sm:flex-row">
                <Button variant="secondary" onClick={() => setFilters({ ...filters, page: Math.max(1, pagination.page - 1) })} disabled={pagination.page === 1}>Anterior</Button>
                <span className="text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/85">Página {pagination.page} de {pagination.totalPages} ({pagination.total} registros)</span>
                <Button variant="secondary" onClick={() => setFilters({ ...filters, page: Math.min(pagination.totalPages, pagination.page + 1) })} disabled={pagination.page >= pagination.totalPages}>Siguiente</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
