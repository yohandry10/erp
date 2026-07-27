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

const toArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : [])

const unwrapArrayResponse = <T,>(response: any): T[] => toArray<T>(Array.isArray(response?.data) ? response.data : response)

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('es-PE')
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
        setViolationsByTable(unwrapArrayResponse<ViolationByTable>(tablesRes))
        setRecentViolations(unwrapArrayResponse<RecentViolation>(violationsRes))
        setUnacknowledgedAlerts(unwrapArrayResponse<Alert>(alertsRes))
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
      <div className="flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p className="text-[var(--primary-500)]">Cargando...</p>
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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div className="flex-[1]">
          <div className="mb-2">
            <button onClick={() => router.push('/superadmin/dashboard')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Volver
            </button>
          </div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">🔒 Dashboard de Seguridad RLS</h1>
          <p className="mt-2 text-base text-muted-foreground">Monitoreo de violaciones y alertas de seguridad multi-tenant</p>
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
        <div className="text-center py-12 px-0">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p className="text-[var(--primary-500)]">Cargando datos de seguridad...</p>
        </div>
      ) : (
        <>
          {/* Statistics Cards */}
          <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 mb-8">
            <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
                <h3>VIOLACIONES TOTALES</h3>
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">⚠️</span>
              </div>
              <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{stats?.totalViolations || 0}</div>
              <div className="mt-2 text-[0.8125rem] text-muted-foreground">{stats?.period}</div>
            </div>

            <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
                <h3>VIOLACIONES CRÍTICAS</h3>
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">🚨</span>
              </div>
              <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-red-500">
                {stats?.criticalViolations || 0}
              </div>
              <div className="mt-2 text-[0.8125rem] text-muted-foreground">
                {stats?.totalViolations
                  ? `${Math.round(((stats?.criticalViolations || 0) / stats.totalViolations) * 100)}% del total`
                  : 'Sin violaciones'}
              </div>
            </div>

            <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
                <h3>USUARIOS AFECTADOS</h3>
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">👤</span>
              </div>
              <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{stats?.uniqueUsers || 0}</div>
              <div className="mt-2 text-[0.8125rem] text-muted-foreground">Usuarios únicos</div>
            </div>

            <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
                <h3>TABLAS AFECTADAS</h3>
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">📊</span>
              </div>
              <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{stats?.tablesAffected || 0}</div>
              <div className="mt-2 text-[0.8125rem] text-muted-foreground">Tablas con intentos</div>
            </div>

            <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
                <h3>ALERTAS TOTALES</h3>
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">🔔</span>
              </div>
              <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none">{stats?.totalAlerts || 0}</div>
              <div className="mt-2 text-[0.8125rem] text-muted-foreground">{stats?.period}</div>
            </div>

            <div className="relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground">
                <h3>ALERTAS PENDIENTES</h3>
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">🔴</span>
              </div>
              <div className="mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-500">
                {stats?.unacknowledgedAlerts || 0}
              </div>
              <div className="mt-2 text-[0.8125rem] text-muted-foreground">Sin reconocer</div>
            </div>
          </div>

          {/* Unacknowledged Alerts */}
          {unacknowledgedAlerts.length > 0 && (
            <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
              <h2 className="m-0 text-lg font-bold text-foreground">🔴 Alertas Pendientes</h2>
              <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
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
                        <td>{formatDateTime(alert.triggered_at)}</td>
                        <td className="font-medium">{alert.alert_name}</td>
                        <td>
                          <span className="py-1 px-3 rounded-full text-xs font-semibold border">
                            {alert.severity}
                          </span>
                        </td>
                        <td>{alert.message}</td>
                        <td>{alert.affected_table || '-'}</td>
                        <td>{alert.user_email || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Violations by Table */}
          <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
            <h2 className="m-0 text-lg font-bold text-foreground">📊 Violaciones por Tabla</h2>
            <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
              {violationsByTable.length === 0 ? (
                <div className="px-4 py-10 text-center text-muted-foreground">
                  <h3>✅ No se detectaron violaciones en el período seleccionado</h3>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Tabla</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Críticas</th>
                      <th className="text-right">Cross-Tenant</th>
                      <th className="text-right">Sin Tenant</th>
                      <th className="text-right">Usuarios</th>
                      <th>Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violationsByTable.map((table) => (
                      <tr key={table.table_name}>
                        <td className="font-medium">{table.table_name}</td>
                        <td className="text-right font-semibold">{table.total_violations}</td>
                        <td className="text-right text-red-500">{table.critical_count}</td>
                        <td className="text-right">{table.cross_tenant_count}</td>
                        <td className="text-right">{table.missing_tenant_count}</td>
                        <td className="text-right">{table.unique_users}</td>
                        <td>{formatDateTime(table.last_violation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent Violations */}
          <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
            <h2 className="m-0 text-lg font-bold text-foreground">🕐 Violaciones Recientes</h2>
            <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
              {recentViolations.length === 0 ? (
                <div className="px-4 py-10 text-center text-muted-foreground">
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
                        <td>{formatDateTime(violation.timestamp)}</td>
                        <td>{violation.table_name}</td>
                        <td>{violation.operation}</td>
                        <td>{getViolationTypeLabel(violation.violation_type)}</td>
                        <td>
                          <span className="py-1 px-3 rounded-full text-xs font-semibold border">
                            {violation.severity}
                          </span>
                        </td>
                        <td>{violation.user_email || 'N/A'}</td>
                        <td>{violation.ip_address || '-'}</td>
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
