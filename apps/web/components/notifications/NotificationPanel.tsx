'use client'

import { useCallback, useEffect, useState } from 'react'
import { NotificationItem, Notification } from './NotificationItem'
import { useApi } from '@/hooks/use-api'
import { Loader2, Bell } from 'lucide-react'

interface NotificationPanelProps {
  onNotificationRead?: () => void
  onClose?: () => void
}

export function NotificationPanel({ onNotificationRead, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { get, put, delete: del } = useApi({ showErrorToast: false })

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await get('/api/notifications')
      if (response?.success && Array.isArray(response.data)) {
        setNotifications(response.data)
      } else if (Array.isArray(response)) {
        setNotifications(response)
      } else if (response?.success === false) {
        // FIX: Manejar errores del backend que retornan success: false
        setError('No se pudieron cargar las notificaciones')
        setNotifications([])
      } else {
        setNotifications([])
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      setError('Error de conexión. Intenta de nuevo.')
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleMarkAsRead = async (id: string) => {
    try {
      await put(`/api/notifications/${id}/read`)
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await del(`/api/notifications/${id}`)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      // FIX: Usar endpoint batch en lugar de múltiples llamadas individuales
      await put('/api/notifications/mark-all-read')
      setNotifications((prev) => prev.map((n) => ({ ...n, leida: true })))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const unreadCount = notifications.filter((n) => !n.leida).length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'white',
        borderRadius: '20px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '2px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Bell style={{ width: '20px', height: '20px', color: '#3b82f6' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Notificaciones
          </h3>
          {unreadCount > 0 && (
            <span
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                borderRadius: '12px',
                padding: '2px 10px',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '8px 12px',
              borderRadius: '8px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '#eff6ff'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
            }}
          >
            Marcar todas
          </button>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          maxHeight: '450px',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              textAlign: 'center',
              gap: '12px',
              color: '#64748b',
            }}
          >
            <Loader2
              style={{
                width: '32px',
                height: '32px',
                color: '#94a3b8',
                animation: 'spin 1s linear infinite',
              }}
            />
            <p style={{ margin: 0 }}>Cargando notificaciones...</p>
          </div>
        ) : error ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              textAlign: 'center',
              gap: '12px',
              color: '#ef4444',
            }}
          >
            <p style={{ fontSize: '14px', margin: 0 }}>{error}</p>
            <button
              onClick={fetchNotifications}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Reintentar
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              textAlign: 'center',
              gap: '8px',
              color: '#64748b',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '8px',
                color: '#cbd5e1',
              }}
            >
              <Bell style={{ width: '32px', height: '32px' }} />
            </div>
            <p style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>No tienes notificaciones</p>
            <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
              Te notificaremos cuando haya algo nuevo
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
