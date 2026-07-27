'use client'

import { Badge } from '@/components/ui/badge'

interface UserRowProps {
  usuario: any
  currentUserId?: string
  onEdit: (usuario: any) => void
  onChangeStatus: (usuario: any, estado: string) => void
}

const getStatusClass = (estado: string) => {
  switch (estado) {
    case 'ACTIVO':
      return 'border-cyan-300/30 bg-cyan-300/10 text-primary group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700'
    case 'INACTIVO':
      return 'border-border/25 bg-slate-300/10 text-foreground/90 group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground/85'
    case 'SUSPENDIDO':
      return 'border-amber-300/25 bg-amber-300/10 text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:bg-amber-50 group-data-[erp-theme=light]/dashboard:text-amber-700'
    default:
      return 'border-border/25 bg-slate-300/10 text-foreground/90 group-data-[erp-theme=light]/dashboard:bg-muted group-data-[erp-theme=light]/dashboard:text-foreground/85'
  }
}

const getTimeAgo = (dateString: string) => {
  if (!dateString) return 'Nunca'

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 60) return `hace ${diffMins} min`
  if (diffHours < 24) return `hace ${diffHours}h`
  return `hace ${diffDays}d`
}

export default function UserRow({ usuario, currentUserId, onEdit, onChangeStatus }: UserRowProps) {
  const roleName = usuario.roles_usuario?.[0]?.roles?.nombre || 'Sin rol'
  const isCurrentUser = usuario.id === currentUserId

  return (
    <tr className="transition hover:bg-white/[0.03] group-data-[erp-theme=light]/dashboard:hover:bg-muted/30">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-bold text-white">
            {usuario.nombre?.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-foreground group-data-[erp-theme=light]/dashboard:text-foreground">{usuario.nombre}</div>
            <div className="text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
              {roleName}
            </div>
          </div>
        </div>
      </td>
      <td className="p-4 text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{usuario.email}</td>
      <td className="p-4 text-center">
        <Badge className="border-blue-300/25 bg-blue-300/10 text-blue-700 dark:text-blue-200 group-data-[erp-theme=light]/dashboard:bg-blue-50 group-data-[erp-theme=light]/dashboard:text-blue-700">
          {roleName}
        </Badge>
      </td>
      <td className="p-4">
        <div>{getTimeAgo(usuario.fecha_ultimo_acceso)}</div>
        <div className="text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
          {usuario.fecha_ultimo_acceso ?
            new Date(usuario.fecha_ultimo_acceso).toLocaleDateString('es-PE') :
            'Nunca'
          }
        </div>
      </td>
      <td className="p-4">
        {new Date(usuario.created_at).toLocaleDateString('es-PE')}
      </td>
      <td className="p-4 text-center">
        <Badge className={getStatusClass(usuario.estado)}>
          {usuario.estado}
        </Badge>
      </td>
      <td className="p-4 text-center">
        <div className="flex gap-2 justify-center">
          {isCurrentUser ? (
            <span className="text-xs text-muted-foreground">
              (Tu cuenta)
            </span>
          ) : (
            <>
              <button
                onClick={() => onEdit(usuario)} className="rounded-md border border-blue-300/25 bg-blue-300/10 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-200 transition hover:bg-blue-300/20 group-data-[erp-theme=light]/dashboard:text-blue-700"
              >
                Editar
              </button>
              {usuario.estado === 'ACTIVO' ? (
                <button
                  onClick={() => onChangeStatus(usuario, 'INACTIVO')} className="rounded-md border border-border/25 bg-slate-300/10 px-3 py-2 text-xs font-semibold text-foreground/90 transition hover:bg-slate-300/20 group-data-[erp-theme=light]/dashboard:text-foreground/85"
                >
                  Desactivar
                </button>
              ) : (
                <button
                  onClick={() => onChangeStatus(usuario, 'ACTIVO')} className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-cyan-300/20 group-data-[erp-theme=light]/dashboard:text-cyan-700"
                >
                  Activar
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
