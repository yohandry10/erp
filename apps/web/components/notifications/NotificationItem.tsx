'use client'

import { AlertCircle, CheckCircle, Info, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

export interface Notification {
  id: string
  tipo: string
  severidad: 'info' | 'warning' | 'error'
  titulo: string
  mensaje: string
  action_url?: string
  action_label?: string
  leida: boolean
  created_at: string
}

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
}

const severityConfig = {
  info: {
    icon: Info,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    textColor: 'text-blue-900',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    iconColor: 'text-yellow-600',
    textColor: 'text-yellow-900',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    textColor: 'text-red-900',
  },
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) {
  const router = useRouter()
  const config = severityConfig[notification.severidad]
  const Icon = config.icon

  const handleClick = () => {
    if (!notification.leida) {
      onMarkAsRead(notification.id)
    }
  }

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (notification.action_url) {
      router.push(notification.action_url)
      onMarkAsRead(notification.id)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(notification.id)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Ahora'
    if (diffMins < 60) return `Hace ${diffMins}m`
    if (diffHours < 24) return `Hace ${diffHours}h`
    if (diffDays < 7) return `Hace ${diffDays}d`
    return date.toLocaleDateString('es-PE', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'relative p-4 border-b cursor-pointer transition-colors hover:bg-gray-50',
        !notification.leida && 'bg-blue-50/30'
      )}
    >
      <div className="flex gap-3">
        <div className={cn('flex-shrink-0 mt-0.5', config.iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-900 line-clamp-1">
              {notification.titulo}
            </h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={handleDelete}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {notification.mensaje}
          </p>
          
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500">
              {formatDate(notification.created_at)}
            </span>
            
            {notification.action_url && notification.action_label && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={handleActionClick}
              >
                {notification.action_label}
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {!notification.leida && (
        <div className="absolute top-4 right-4 h-2 w-2 bg-blue-600 rounded-full" />
      )}
    </div>
  )
}
