'use client'

import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface Notification {
  id: string
  tenant_id?: string
  usuario_id?: string
  type: string
  severity: 'info' | 'warning' | 'error'
  title: string
  message: string
  action_url?: string
  action_label?: string
  leida: boolean
  created_at: string
  leida_at?: string
}

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
  onClose?: () => void
}

const severityConfig = {
  info: {
    icon: Info,
    iconClassName: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-200 group-data-[erp-theme=light]/dashboard:text-cyan-700',
    label: 'Info',
  },
  warning: {
    icon: AlertTriangle,
    iconClassName: 'border-blue-300/25 bg-blue-400/10 text-blue-100 group-data-[erp-theme=light]/dashboard:text-blue-700',
    label: 'Revisar',
  },
  error: {
    icon: AlertCircle,
    iconClassName: 'border-cyan-200/30 bg-cyan-200/10 text-cyan-100 group-data-[erp-theme=light]/dashboard:text-cyan-800',
    label: 'Crítico',
  },
}

function formatDate(dateString: string) {
  if (!dateString) return ''

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Ahora'
  if (diffMins < 60) return `Hace ${diffMins}m`
  if (diffHours < 24) return `Hace ${diffHours}h`
  if (diffDays < 7) return `Hace ${diffDays}d`

  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClose,
}: NotificationItemProps) {
  const router = useRouter()
  const config = severityConfig[notification.severity] ?? severityConfig.info
  const Icon = config.icon
  const title = notification.title?.trim() || 'Notificación'
  const message = notification.message?.trim() || ''

  const handleOpen = () => {
    if (!notification.leida) onMarkAsRead(notification.id)
  }

  const handleActionClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!notification.action_url) return

    onMarkAsRead(notification.id)
    router.push(notification.action_url)
    onClose?.()
  }

  const handleDelete = (event: React.MouseEvent) => {
    event.stopPropagation()
    onDelete(notification.id)
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') handleOpen()
      }}
      className={cn(
        'relative flex cursor-pointer gap-3 px-5 py-4 outline-none transition-colors hover:bg-cyan-400/5 focus-visible:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:hover:bg-slate-50 group-data-[erp-theme=light]/dashboard:focus-visible:bg-slate-50',
        !notification.leida && 'bg-cyan-400/5 group-data-[erp-theme=light]/dashboard:bg-cyan-50/70',
      )}
    >
      <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border', config.iconClassName)}>
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-slate-950">{title}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-500 group-data-[erp-theme=light]/dashboard:text-slate-500">
              <span>{config.label}</span>
              <span className="h-1 w-1 rounded-full bg-cyan-300/40" />
              <span>{formatDate(notification.created_at)}</span>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Eliminar notificación"
            onClick={handleDelete}
            className="h-8 w-8 shrink-0 text-slate-500 hover:bg-cyan-400/10 hover:text-cyan-100 group-data-[erp-theme=light]/dashboard:hover:text-cyan-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {message && (
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
            {message}
          </p>
        )}

        {notification.action_url && notification.action_label && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleActionClick}
            className="mt-3 h-8 px-0 text-cyan-200 hover:bg-transparent hover:text-white group-data-[erp-theme=light]/dashboard:text-cyan-700 group-data-[erp-theme=light]/dashboard:hover:text-cyan-900"
          >
            {notification.action_label}
          </Button>
        )}
      </div>

      {!notification.leida && (
        <span className="absolute right-5 top-5 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.8)]" />
      )}
    </article>
  )
}
