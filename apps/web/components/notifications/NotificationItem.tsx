'use client'

import { AlertCircle, Info, X, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'

/**
 * Interface de Notificación - SINCRONIZADA CON BACKEND
 * 
 * El backend (notifications.service.ts) retorna campos en INGLÉS:
 * - title (no titulo)
 * - message (no mensaje)
 * - type (no tipo)
 * - severity (no severidad)
 */
export interface Notification {
  id: string
  tenant_id?: string
  usuario_id?: string
  type: string           // Backend: data.tipo → API: type
  severity: 'info' | 'warning' | 'error'  // Backend: data.severidad → API: severity
  title: string          // Backend: data.titulo → API: title
  message: string        // Backend: data.mensaje → API: message
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
}

const severityConfig = {
  info: {
    icon: Info,
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    iconColor: '#2563eb',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: '#fefce8',
    borderColor: '#fde047',
    iconColor: '#ca8a04',
  },
  error: {
    icon: AlertCircle,
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    iconColor: '#dc2626',
  },
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) {
  const router = useRouter()
  
  // Usar severity del backend (en inglés)
  const config = severityConfig[notification.severity] ?? severityConfig.info
  const Icon = config?.icon ?? Info

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
    if (!dateString) return ''
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return ''
      
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
    } catch {
      return ''
    }
  }

  // Usar campos en INGLÉS que vienen del backend
  // FIX: Manejar strings vacíos además de undefined/null
  const title = notification.title?.trim() || 'Notificación'
  const message = notification.message?.trim() || ''

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'relative',
        padding: '16px',
        borderBottom: '1px solid #e2e8f0',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
        backgroundColor: notification.leida ? 'transparent' : 'rgba(59, 130, 246, 0.05)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = notification.leida ? 'transparent' : 'rgba(59, 130, 246, 0.05)'
      }}
    >
      <div style={{ display: 'flex', gap: '12px' }}>
        {/* Icon */}
        <div style={{ flexShrink: 0, marginTop: '2px', color: config.iconColor }}>
          <Icon style={{ width: '20px', height: '20px' }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#111827',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {title}
            </h4>
            <button
              onClick={handleDelete}
              style={{
                flexShrink: 0,
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                color: '#9ca3af',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#fee2e2'
                ;(e.currentTarget as HTMLElement).style.color = '#dc2626'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = '#9ca3af'
              }}
            >
              <X style={{ width: '16px', height: '16px' }} />
            </button>
          </div>

          {/* Message */}
          {message && (
            <p
              style={{
                fontSize: '14px',
                color: '#4b5563',
                margin: '4px 0 0 0',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
          )}

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '8px',
            }}
          >
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              {formatDate(notification.created_at)}
            </span>

            {notification.action_url && notification.action_label && (
              <button
                onClick={handleActionClick}
                style={{
                  fontSize: '12px',
                  color: '#2563eb',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.textDecoration = 'underline'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.textDecoration = 'none'
                }}
              >
                {notification.action_label}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Unread indicator */}
      {!notification.leida && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '48px',
            width: '8px',
            height: '8px',
            backgroundColor: '#2563eb',
            borderRadius: '50%',
          }}
        />
      )}
    </div>
  )
}
