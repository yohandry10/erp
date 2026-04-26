'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'
import { useApi } from '@/hooks/use-api'

interface DashboardStats {
  period: string
  totalViolations: number
  criticalViolations: number
  uniqueUsers: number
  tablesAffected: number
  totalAlerts: number
  unacknowledgedAlerts: number
}

interface ViolationByTable {
  table_name: string
  total_violations: number
  unique_users: number
  critical_count: number
  warning_count: number
  cross_tenant_count: number
  missing_tenant_count: number
  last_violation: string
}

interface RecentViolation {
  id: string
  timestamp: string
  table_name: string
  operation: string
  user_email: string
  violation_type: string
  severity: string
  attempted_tenant_id: string
  actual_tenant_id: string
  ip_address: string
}

interface Alert {
  id: string
  triggered_at: string
  alert_name: string
  severity: string
  message: string
  violation_count: number
  affected_table: string
  user_email: string
  acknowledged: boolean
}

export default function SecurityDashboard() {
  const router = useRouter()
  const { user, isSuperAdmin, loading: tenantLoading } = useTenant()
  const { get } = useApi()
  
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [violationsByTable, setViolationsByTable] = useState<ViolationByTable[]>([])
  const [recentViolations, setRecentViolations] = useState<RecentViolation[]>([])
  const [unacknowledgedAlerts, setUnacknowledgedAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState(7)

  useEffect(() => {
    if (!tenantLoading && !isSuperAdmin) {
      router.push('/dashboard')
    }
  }, [isSuperAdmin, tenantLoading, router])

  useEffect(() => {
    const fetchData = async () => {
      if (!isSuperAdmin) return

      setLoading(true)
      try {
        const [statsRes, tablesRes, violationsRes, alertsRes] = await Promise.all([
          get(`/security/dashboard/stats?days=${selectedPeriod}`),
          get('/security/dashboard/violations-by-table'),
          get('/security/dashboard/violations-recent?limit=20'),
          get('/security/dashboard/alerts-unacknowledged'),
        ])

        setStats(statsRes?.data || statsRes)
        setViolationsByTable(tablesRes?.data || tablesRes || [])
        setRecentViolations(violationsRes?.data || violationsRes || [])
        setUnacknowledgedAlerts(alertsRes?.data || alertsRes || [])
      } catch (error) {
        console.error('Error fetching security data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isSuperAdmin, get, selectedPeriod])

  if (tenantLoading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
          <p style={{ color: 'var(--primary-500)' }}>Cargando...</p>
        </div>
      </div>
    )
  }

  if (!isSuperAdmin) {
    return null
  }

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return { color: '#dc2626', background: '#fef2f2', borderColor: '#fecaca' }
      case 'WARNING':
        return { color: '#d97706', background: '#fffbeb', borderColor: '#fde68a' }
      default:
        return { color: '#2563eb', background: '#eff6ff', borderColor: '#bfdbfe' }
    }
  }

  const getViolationTypeLabel = (type: string) => {
    switch (type) {
      case 'cross_tenant':
        return 'Cross-Tenant'
      case 'missing_tenant':
        return 'Sin Tenant'
      case 'invalid_tenant':
        return 'Tenant Inválido'
      default:
        return type
    }
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={() => router.push('/superadmin/dashboard')} className="btn btn-secondary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Volver
            </button>
          </div>
          <h1 className="dashboard-title">🔒 Dashboard de Seguridad RLS</h1>
          <p className="dashboard-subtitle">Monitoreo de violaciones y alertas de seguridad multi-tenant</p>
        </div>
        
        {/* Period Selector */}
        <div>
          <label>Período</label>
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(Number(e.target.value))}>
            <option value={1}>Últimas 24 horas</option>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
          <p style={{ color: 'var(--primary-500)' }}>Cargando datos de seguridad...</p>
        </div>
      ) : (
        <>
          {/* Statistics Cards */}
          <div className="stats-grid" style={{ marginBottom: '2rem' }}>
            <div className="stat-card">
              <div className="stat-header">
                <h3>VIOLACIONES TOTALES</h3>
                <span className="stat-icon">⚠️</span>
              </div>
              <div className="stat-value">{stats?.totalViolations || 0}</div>
              <div className="stat-subtitle">{stats?.period}</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <h3>VIOLACIONES CRÍTICAS</h3>
                <span className="stat-icon">🚨</span>
              </div>
              <div className="stat-value" style={{ color: '#ef4444' }}>
                {stats?.criticalViolations || 0}
              </div>
              <div className="stat-subtitle">
                {stats?.totalViolations
                  ? `${Math.round(((stats?.criticalViolations || 0) / stats.totalViolations) * 100)}% del total`
                  : 'Sin violaciones'}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <h3>USUARIOS AFECTADOS</h3>
                <span className="stat-icon">👤</span>
              </div>
              <div className="stat-value">{stats?.uniqueUsers || 0}</div>
              <div className="stat-subtitle">Usuarios únicos</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <h3>TABLAS AFECTADAS</h3>
                <span className="stat-icon">📊</span>
              </div>
              <div className="stat-value">{stats?.tablesAffected || 0}</div>
              <div className="stat-subtitle">Tablas con intentos</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <h3>ALERTAS TOTALES</h3>
                <span className="stat-icon">🔔</span>
              </div>
              <div className="stat-value">{stats?.totalAlerts || 0}</div>
              <div className="stat-subtitle">{stats?.period}</div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <h3>ALERTAS PENDIENTES</h3>
                <span className="stat-icon">🔴</span>
              </div>
              <div className="stat-value" style={{ color: '#f59e0b' }}>
                {stats?.unacknowledgedAlerts || 0}
              </div>
              <div className="stat-subtitle">Sin reconocer</div>
            </div>
          </div>

          {/* Unacknowledged Alerts */}
          {unacknowledgedAlerts.length > 0 && (
            <div className="activity-section">
              <h2 className="activity-title">🔴 Alertas Pendientes</h2>
              <div className="activity-card">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Alerta</th>
                      <th>Severidad</th>
                      <th>Mensaje</th>
                      <th>Tabla</th>
                      <th>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unacknowledgedAlerts.map((alert) => (
                      <tr key={alert.id}>
                        <td>{new Date(alert.triggered_at).toLocaleString('es-PE')}</td>
                        <td style={{ fontWeight: '500' }}>{alert.alert_name}</td>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            border: '1px solid',
                            ...getSeverityStyle(alert.severity)
                          }}>
                            {alert.severity}
                          </span>
                        </td>
                        <td>{alert.message}</td>
                        <td style={{ fontFamily: 'monospace' }}>{alert.affected_table || '-'}</td>
                        <td>{alert.user_email || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Violations by Table */}
          <div className="activity-section">
            <h2 className="activity-title">📊 Violaciones por Tabla</h2>
            <div className="activity-card">
              {violationsByTable.length === 0 ? (
                <div className="activity-empty">
                  <h3>✅ No se detectaron violaciones en el período seleccionado</h3>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Tabla</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th style={{ textAlign: 'right' }}>Críticas</th>
                      <th style={{ textAlign: 'right' }}>Cross-Tenant</th>
                      <th style={{ textAlign: 'right' }}>Sin Tenant</th>
                      <th style={{ textAlign: 'right' }}>Usuarios</th>
                      <th>Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violationsByTable.map((table) => (
                      <tr key={table.table_name}>
                        <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{table.table_name}</td>
                        <td style={{ textAlign: 'right', fontWeight: '600' }}>{table.total_violations}</td>
                        <td style={{ textAlign: 'right', color: '#ef4444' }}>{table.critical_count}</td>
                        <td style={{ textAlign: 'right' }}>{table.cross_tenant_count}</td>
                        <td style={{ textAlign: 'right' }}>{table.missing_tenant_count}</td>
                        <td style={{ textAlign: 'right' }}>{table.unique_users}</td>
                        <td>{new Date(table.last_violation).toLocaleString('es-PE')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent Violations */}
          <div className="activity-section">
            <h2 className="activity-title">🕐 Violaciones Recientes</h2>
            <div className="activity-card">
              {recentViolations.length === 0 ? (
                <div className="activity-empty">
                  <h3>✅ No se detectaron violaciones recientes</h3>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tabla</th>
                      <th>Operación</th>
                      <th>Tipo</th>
                      <th>Severidad</th>
                      <th>Usuario</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentViolations.map((violation) => (
                      <tr key={violation.id}>
                        <td>{new Date(violation.timestamp).toLocaleString('es-PE')}</td>
                        <td style={{ fontFamily: 'monospace' }}>{violation.table_name}</td>
                        <td>{violation.operation}</td>
                        <td>{getViolationTypeLabel(violation.violation_type)}</td>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            border: '1px solid',
                            ...getSeverityStyle(violation.severity)
                          }}>
                            {violation.severity}
                          </span>
                        </td>
                        <td>{violation.user_email || 'N/A'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{violation.ip_address || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
