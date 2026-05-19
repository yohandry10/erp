'use client'

import { Shield, UserCheck, UserX, Users } from 'lucide-react'
import { MetricCard } from '@/components/erp/metric-card'

interface UsersStatsProps {
  stats: {
    totalUsuarios: number
    usuariosActivos: number
    usuariosInactivos: number
    totalRoles: number
  }
}

export default function UsersStats({ stats }: UsersStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Usuarios totales" value={stats.totalUsuarios} description="Usuarios registrados" icon={Users} tone="info" />
      <MetricCard title="Usuarios activos" value={stats.usuariosActivos} description="Activos en el sistema" icon={UserCheck} tone="success" />
      <MetricCard title="Roles definidos" value={stats.totalRoles} description="Roles configurados" icon={Shield} tone="default" />
      <MetricCard title="Inactivos" value={stats.usuariosInactivos} description="Usuarios inactivos" icon={UserX} tone="warning" />
    </div>
  )
}
