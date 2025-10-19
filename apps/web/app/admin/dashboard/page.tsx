'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'
import { useApi } from '@/hooks/use-api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UserList } from '@/components/admin/UserList'
import { Users, UserCheck, UserX, Shield } from 'lucide-react'

interface TenantStats {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  totalRoles: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const { user, tenant, isSuperAdmin, loading: tenantLoading } = useTenant()
  const { get } = useApi()
  const [stats, setStats] = useState<TenantStats>({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    totalRoles: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)

  // Route protection - redirect if not authenticated or if super-admin (they have their own dashboard)
  useEffect(() => {
    if (!tenantLoading && !user) {
      router.push('/login')
    }
    // Super-admins should use their own dashboard
    if (!tenantLoading && isSuperAdmin) {
      router.push('/super-admin/dashboard')
    }
  }, [user, isSuperAdmin, tenantLoading, router])

  // Fetch tenant statistics
  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !tenant || isSuperAdmin) return

      setLoadingStats(true)
      try {
        // Fetch users for this tenant
        const usersResponse = await get('/users')
        const users = usersResponse?.data || usersResponse || []
        
        const totalUsers = users.length
        const activeUsers = users.filter((u: any) => u.estado === 'ACTIVO').length
        const inactiveUsers = users.filter((u: any) => u.estado === 'INACTIVO').length

        // Fetch roles for this tenant
        const rolesResponse = await get('/roles')
        const roles = rolesResponse?.data || rolesResponse || []
        const totalRoles = roles.length

        setStats({
          totalUsers,
          activeUsers,
          inactiveUsers,
          totalRoles,
        })
      } catch (error) {
        console.error('Error fetching tenant stats:', error)
      } finally {
        setLoadingStats(false)
      }
    }

    fetchStats()
  }, [user, tenant, isSuperAdmin, get])

  // Show loading state
  if (tenantLoading || !user || !tenant) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Don't render if super-admin (will redirect)
  if (isSuperAdmin) {
    return null
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage users and roles for {tenant.nombre}
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? '...' : stats.totalUsers}
            </div>
            <p className="text-xs text-muted-foreground">
              In your organization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? '...' : stats.activeUsers}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.totalUsers > 0 
                ? `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}% of total`
                : 'No users yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? '...' : stats.inactiveUsers}
            </div>
            <p className="text-xs text-muted-foreground">
              Deactivated accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? '...' : stats.totalRoles}
            </div>
            <p className="text-xs text-muted-foreground">
              Configured roles
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Manage users, roles, and permissions for your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserList />
        </CardContent>
      </Card>
    </div>
  )
}
