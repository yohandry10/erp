'use client'

import Link from 'next/link'
import AuditLogsViewer from '@/components/audit/AuditLogsViewer'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/use-permission'
import { AlertCircle } from 'lucide-react'

/**
 * Página de logs de auditoría
 * Accesible para SuperAdmin o usuarios con permiso security.audit.read.
 */
export default function AuditLogsPage() {
  const { isSuperAdmin, loading: tenantLoading } = useTenant()
  const { hasPermission, loading: permissionLoading } = usePermission('security', 'read', 'audit')
  const loading = tenantLoading || permissionLoading
  const canReadAuditLogs = isSuperAdmin || hasPermission

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <div className="flex min-h-48 items-center justify-center">
            <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
            <p>Validando acceso...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!canReadAuditLogs) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <div className="p-12 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" />
            <h3 className="mb-2 text-lg font-semibold text-foreground/85">Acceso denegado</h3>
            <p className="text-muted-foreground">No tienes permisos para ver los logs de auditoría.</p>
            <p className="mt-1 text-sm text-muted-foreground">Solicita a un administrador el permiso de lectura de auditoría.</p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/dashboard">Volver al Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return <AuditLogsViewer />
}
