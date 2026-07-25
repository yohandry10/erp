'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, Loader2, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useApi } from '@/hooks/use-api'
import { NotificationItem, Notification } from './NotificationItem'

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
      } else {
        setNotifications([])
        if (response?.success === false) setError('No se pudieron cargar las notificaciones.')
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      setError('Error de conexión al cargar notificaciones.')
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
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, leida: true } : item)))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await del(`/api/notifications/${id}`)
      setNotifications((prev) => prev.filter((item) => item.id !== id))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await put('/api/notifications/mark-all-read')
      setNotifications((prev) => prev.map((item) => ({ ...item, leida: true })))
      onNotificationRead?.()
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }

  const unreadCount = notifications.filter((item) => !item.leida).length

  return (
    <section className="flex max-h-[640px] min-h-[320px] flex-col bg-background group-data-[erp-theme=light]/dashboard:bg-card">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-cyan-300/15 bg-card/80 px-5 py-4 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-primary group-data-[erp-theme=light]/dashboard:text-cyan-700">
            <Bell className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">Notificaciones</h3>
            <p className="text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Eventos operativos y alertas del ERP</p>
          </div>
          {unreadCount > 0 && (
            <Badge className="border-cyan-300/25 bg-cyan-300 text-foreground hover:bg-cyan-300">
              {unreadCount}
            </Badge>
          )}
        </div>

        {unreadCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleMarkAllAsRead}
            className="shrink-0 text-primary hover:bg-cyan-400/10 hover:text-white group-data-[erp-theme=light]/dashboard:text-cyan-700 group-data-[erp-theme=light]/dashboard:hover:text-cyan-900"
          >
            Marcar todas
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid min-h-[260px] place-items-center px-6 text-center text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            <div className="grid gap-3">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="text-sm">Cargando notificaciones</p>
            </div>
          </div>
        ) : error ? (
          <div className="grid min-h-[260px] place-items-center px-6 text-center">
            <div className="grid max-w-xs gap-3">
              <p className="text-sm font-medium text-primary group-data-[erp-theme=light]/dashboard:text-cyan-800">{error}</p>
              <Button
                type="button"
                size="sm"
                onClick={fetchNotifications}
                className="gap-2 bg-cyan-400 text-foreground hover:bg-cyan-300"
              >
                <RefreshCcw className="h-4 w-4" />
                Reintentar
              </Button>
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="grid min-h-[260px] place-items-center px-6 text-center">
            <div className="grid max-w-xs gap-3">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-primary group-data-[erp-theme=light]/dashboard:text-cyan-700">
                <Bell className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white group-data-[erp-theme=light]/dashboard:text-foreground">Sin notificaciones</p>
                <p className="mt-1 text-xs text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Cuando exista una acción crítica aparecerá aquí.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-cyan-300/10 group-data-[erp-theme=light]/dashboard:divide-slate-200">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
                onDelete={handleDelete}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
