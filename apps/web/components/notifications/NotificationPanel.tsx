'use client'

import { useEffect, useState } from 'react'
import { NotificationItem, Notification } from './NotificationItem'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useApi } from '@/hooks/use-api'
import { Loader2, Bell } from 'lucide-react'

interface NotificationPanelProps {
  onNotificationRead?: () => void
  onClose?: () => void
}

export function NotificationPanel({ onNotificationRead, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const { get, put, delete: del } = useApi({ showErrorToast: false })

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const response = await get('/api/notifications')
      if (response?.success && Array.isArray(response.data)) {
        setNotifications(response.data)
      } else if (Array.isArray(response)) {
        setNotifications(response)
      } else {
        setNotifications([])
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  const handleMarkAsRead = async (id: string) => {
    try {
      await put(`/api/notifications/${id}/read`)
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, leida: true } : n))
      )
      onNotificationRead?.()
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await del(`/api/notifications/${id}`)
      setNotifications(prev => prev.filter(n => n.id !== id))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.leida).map(n => n.id)
    
    try {
      await Promise.all(unreadIds.map(id => put(`/api/notifications/${id}/read`)))
      setNotifications(prev => prev.map(n => ({ ...n, leida: true })))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error marking all as read:', error)
    }
  }

  const unreadCount = notifications.filter(n => !n.leida).length

  return (
    <div className="notification-panel">
      <div className="notification-header">
        <div className="notification-header__title">
          <Bell size={20} className="notification-header__icon" />
          <h3>Notificaciones</h3>
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </div>
        {unreadCount > 0 && (
          <button className="notification-header__action" onClick={handleMarkAllAsRead}>
            Marcar todas
          </button>
        )}
      </div>

      <div className="notification-body">
        {loading ? (
          <div className="notification-empty">
            <Loader2 size={32} className="notification-empty__loader animate-spin" />
            <p>Cargando notificaciones...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notification-empty">
            <div className="notification-empty__icon">
              <Bell size={32} />
            </div>
            <p className="notification-empty__title">No tienes notificaciones</p>
            <p className="notification-empty__subtitle">Te notificaremos cuando haya algo nuevo</p>
          </div>
        ) : (
          <div className="notification-list">
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
    </div>
  )
}
