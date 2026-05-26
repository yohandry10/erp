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
            'relative h-11 w-11 rounded-xl border border-cyan-300/25 bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-950/20 hover:from-blue-500 hover:to-cyan-400',
            className,
          )}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-slate-950 bg-cyan-300 px-1 text-[10px] font-black text-slate-950">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border-cyan-300/20 bg-slate-950 p-0 text-slate-100 shadow-2xl shadow-blue-950/40 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-950 group-data-[erp-theme=light]/dashboard:shadow-slate-200/80"
      >
        <NotificationPanel
          onNotificationRead={fetchUnreadCount}
          onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
