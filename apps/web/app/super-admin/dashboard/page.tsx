'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'
import { useApi } from '@/hooks/use-api'
import { TenantList } from '@/components/tenant/TenantList'
import { TenantSwitcher } from '@/components/tenant/TenantSwitcher'

interface SystemStats {
  totalTenants: number
  activeTenants: number
  totalUsers: number
  activeUsers: number
}

export default function SuperAdminDashboard() {
  const router = useRouter()
  const { user, isSuperAdmin, loading: tenantLoading } = useTenant()
  const { get } = useApi()
  const [stats, setStats] = useState<SystemStats>({
    totalTenants: 0,
    activeTenants: 0,
    totalUsers: 0,
    activeUsers: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)

  // Route protection - redirect if not super-admin
  useEffect(() => {
    if (!tenantLoading && !isSuperAdmin) {
      router.push('/dashboard')
    }
  }, [isSuperAdmin, tenantLoading, router])

  // Fetch system-wide statistics
  useEffect(() => {
    const fetchStats = async () => {
      if (!isSuperAdmin) return

      setLoadingStats(true)
      try {
        // Fetch tenants to calculate stats
        const tenantsResponse = await get('/tenants')
        const tenants = tenantsResponse?.data || tenantsResponse || []
        
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
      } finally {
        setLoadingStats(false)
      }
    }

    fetchStats()
  }, [isSuperAdmin, get])

  // Show loading state
  if (tenantLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render if not super-admin (will redirect)
  if (!isSuperAdmin) {
    return null
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                color: '#2563eb',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <svg 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Ir al Dashboard
            </button>
          </div>
          <h1 className="dashboard-title">Super Admin Dashboard</h1>
          <p className="dashboard-subtitle">Gestiona todos los tenants y configuración del sistema</p>
        </div>
        {/* Tenant Switcher */}
        <div style={{ width: '280px' }}>
          <TenantSwitcher />
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL TENANTS</h3>
            <span className="stat-icon">🏢</span>
          </div>
          <div className="stat-value">
            {loadingStats ? '...' : stats.totalTenants}
          </div>
          <div className="stat-subtitle">
            {stats.activeTenants} activos
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>TENANTS ACTIVOS</h3>
            <span className="stat-icon">✅</span>
          </div>
          <div className="stat-value">
            {loadingStats ? '...' : stats.activeTenants}
          </div>
          <div className="stat-subtitle">
            {stats.totalTenants > 0 
              ? `${Math.round((stats.activeTenants / stats.totalTenants) * 100)}% del total`
              : 'Sin tenants'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>USUARIOS TOTALES</h3>
            <span className="stat-icon">👥</span>
          </div>
          <div className="stat-value">
            {loadingStats ? '...' : stats.totalUsers}
          </div>
          <div className="stat-subtitle">
            En todos los tenants
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>USUARIOS ACTIVOS</h3>
            <span className="stat-icon">📈</span>
          </div>
          <div className="stat-value">
            {loadingStats ? '...' : stats.activeUsers}
          </div>
          <div className="stat-subtitle">
            {stats.totalUsers > 0
              ? `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}% del total`
              : 'Sin usuarios'}
          </div>
        </div>
      </div>

      {/* Tenant List */}
      <div className="activity-section">
        <h2 className="activity-title">Gestión de Tenants</h2>
        <div className="activity-card">
          <TenantList />
        </div>
      </div>
    </div>
  )
}
