'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useApi } from '@/hooks/use-api'
import { NotificationPanel } from './NotificationPanel'

interface NotificationBellProps {
  className?: string
}

const UNREAD_REFRESH_MS = 60_000
const UNREAD_REFRESH_JITTER_MS = 15_000

export function NotificationBell({ className }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const inFlightRef = useRef(false)
  const { get } = useApi({ showErrorToast: false })

  const fetchUnreadCount = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    try {
      const response = await get('/api/notifications/unread')
      if (response?.success) {
        const data = response.data
        setUnreadCount(Array.isArray(data) ? data.length : Number(data?.unread_count ?? 0))
        return
      }

      setUnreadCount(Array.isArray(response) ? response.length : 0)
    } catch (error) {
      console.error('Error fetching unread count:', error)
    } finally {
      inFlightRef.current = false
    }
  }, [get])

  useEffect(() => {
    fetchUnreadCount()

    let cancelled = false
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null

    const schedule = () => {
      if (cancelled) return
      const jitter = Math.floor(Math.random() * UNREAD_REFRESH_JITTER_MS)
      timer = globalThis.setTimeout(async () => {
        if (!document.hidden) {
          await fetchUnreadCount()
        }
        schedule()
      }, UNREAD_REFRESH_MS + jitter)
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchUnreadCount()
      }
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      if (timer) globalThis.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchUnreadCount])

  useEffect(() => {
    if (isOpen) {
      fetchUnreadCount()
    }
  }, [fetchUnreadCount, isOpen])

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-label="Abrir notificaciones"
          className={cn(
            'relative h-11 w-11 rounded-xl border border-border/80 bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
            className,
          )}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-black text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-cyan-300/20 bg-background p-0 text-foreground shadow-2xl shadow-blue-950/40 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground group-data-[erp-theme=light]/dashboard:shadow-slate-200/80"
      >
        <NotificationPanel
          onNotificationRead={fetchUnreadCount}
          onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
