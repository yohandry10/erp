'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'
import { useApi } from '@/hooks/use-api'
import CrearTenants from '@/components/superadmin/CrearTenants'
import { TenantSwitcher } from '@/components/tenant/TenantSwitcher'
import { Building2, Shield, UserCheck, Users } from 'lucide-react'
import { PageShell } from '@/components/erp/page-shell'
import { MetricCard } from '@/components/erp/metric-card'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SystemStats {
  totalTenants: number
  activeTenants: number
  totalUsers: number
  activeUsers: number
}

export default function SuperAdminDashboard() {
  const router = useRouter()
  const { user, isSuperAdmin, loading: tenantLoading } = useTenant()
  const { get } = useApi({ showErrorToast: false })
  const getRef = useRef(get)
  const [stats, setStats] = useState<SystemStats>({
    totalTenants: 0,
    activeTenants: 0,
    totalUsers: 0,
    activeUsers: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    getRef.current = get
  }, [get])

  // Route protection - redirect if not super-admin
  useEffect(() => {
    if (!tenantLoading && !isSuperAdmin) {
      router.push('/dashboard')
    }
  }, [isSuperAdmin, tenantLoading, router])

  // Fetch system-wide statistics
  const fetchStats = useCallback(async () => {
      if (!isSuperAdmin) return

      setLoadingStats(true)
      setStatsError(null)
      try {
        // Fetch tenants to calculate stats
        const tenantsResponse = await getRef.current('/tenants')
        const rawTenants = tenantsResponse?.data ?? tenantsResponse
        const tenants = Array.isArray(rawTenants)
          ? rawTenants
          : Array.isArray(rawTenants?.items)
            ? rawTenants.items
            : Array.isArray(rawTenants?.tenants)
              ? rawTenants.tenants
              : []

        const totalTenants = tenants.length
        const activeTenants = tenants.filter((t: any) => t.estado === 'ACTIVO').length

        // Calculate user stats from tenants
        let totalUsers = 0
        let activeUsers = 0

        for (const tenant of tenants) {
          if (tenant.user_count) {
            totalUsers += tenant.user_count
          }
          if (tenant.active_user_count) {
            activeUsers += tenant.active_user_count
          }
        }

        setStats({
          totalTenants,
          activeTenants,
          totalUsers,
          activeUsers,
        })
      } catch (error) {
        console.error('Error fetching system stats:', error)
        setStatsError(error instanceof Error ? error.message : 'No se pudieron cargar estadísticas del sistema')
      } finally {
        setLoadingStats(false)
      }
  }, [isSuperAdmin])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Show loading state
  if (tenantLoading || !user) {
    return (
      <PageShell title="Super Admin" description="Validando sesión y privilegios globales.">
        <div className="grid min-h-[360px] place-items-center rounded-3xl border border-cyan-400/20 bg-card/60 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground/85">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/20 border-t-cyan-300 group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:border-t-blue-600" />
            <p className="text-sm font-semibold">Cargando Super Admin...</p>
          </div>
        </div>
      </PageShell>
    )
  }

  // Don't render if not super-admin (will redirect)
  if (!isSuperAdmin) {
    return null
  }

  return (
    <PageShell
      title="Super Admin Dashboard"
      description="Gestión global de tenants, seguridad y configuración del sistema."
      actions={
        <>
          <Button variant="secondary" onClick={() => router.push('/dashboard')}>Ir al Dashboard</Button>
          <TenantSwitcher />
        </>
      }
    >
      {statsError ? (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:border-amber-200 group-data-[erp-theme=light]/dashboard:bg-amber-50 group-data-[erp-theme=light]/dashboard:text-amber-800">
          {statsError}
        </div>
      ) : null}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total tenants" value={loadingStats ? '...' : stats.totalTenants} description={`${stats.activeTenants} activos`} icon={Building2} tone="info" />
        <MetricCard title="Tenants activos" value={loadingStats ? '...' : stats.activeTenants} description={stats.totalTenants > 0 ? `${Math.round((stats.activeTenants / stats.totalTenants) * 100)}% del total` : 'Sin tenants'} icon={Shield} tone="success" />
        <MetricCard title="Usuarios totales" value={loadingStats ? '...' : stats.totalUsers} description="En todos los tenants" icon={Users} tone="default" />
        <MetricCard title="Usuarios activos" value={loadingStats ? '...' : stats.activeUsers} description={stats.totalUsers > 0 ? `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}% del total` : 'Sin usuarios'} icon={UserCheck} tone="warning" />
      </div>

      {/* Quick Actions */}
      <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
        <CardHeader>
          <CardTitle className="text-white group-data-[erp-theme=light]/dashboard:text-foreground">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <button
            onClick={() => router.push('/superadmin/dashboard/security')}
            className="flex w-full items-center gap-4 rounded-2xl border border-cyan-400/15 bg-card/50 p-4 text-left transition hover:border-cyan-300/40 hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:hover:bg-blue-50"
          >
            <Shield className="h-6 w-6 text-primary group-data-[erp-theme=light]/dashboard:text-blue-600" />
            <span>
              <span className="block font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">Dashboard de Seguridad</span>
              <span className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Monitoreo RLS y alertas</span>
            </span>
          </button>
        </CardContent>
      </Card>

      {/* Tenant Management */}
      <CrearTenants />
    </PageShell>
  )
}
