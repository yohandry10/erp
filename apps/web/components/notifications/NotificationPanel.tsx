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
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      height: '100%',
      background: 'white'
    }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem 1.5rem',
        borderBottom: '2px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Bell size={20} style={{ color: '#3b82f6' }} />
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '700',
            color: '#1e293b',
            margin: 0
          }}>
            Notificaciones
          </h3>
          {unreadCount > 0 && (
            <span style={{
              backgroundColor: '#ef4444',
              color: 'white',
              borderRadius: '12px',
              padding: '0.25rem 0.625rem',
              fontSize: '0.75rem',
              fontWeight: '700'
            }}>
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
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eff6ff'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Marcar todas
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto',
        minHeight: 0
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1.5rem',
            gap: '1rem'
          }}>
            <Loader2 size={32} style={{ color: '#94a3b8' }} className="animate-spin" />
            <p style={{ 
              color: '#64748b', 
              fontSize: '0.875rem', 
              fontWeight: '500',
              margin: 0
            }}>
              Cargando notificaciones...
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1.5rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <Bell size={32} style={{ color: '#cbd5e1' }} />
            </div>
            <p style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#475569',
              marginBottom: '0.5rem',
              margin: '0 0 0.5rem 0'
            }}>
              No tienes notificaciones
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              margin: 0
            }}>
              Te notificaremos cuando haya algo nuevo
            </p>
          </div>
        ) : (
          <div>
            {notifications.map(notification => (
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
