'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { getOfflineStatus, syncOfflineQueue, type OfflineStatus } from '@/lib/offline-store'
import { customAuth } from '@/lib/auth-service'

const OFFLINE_STATUS_REFRESH_MS = 30_000

export function OfflineStatusBadge() {
  const [online, setOnline] = useState(true)
  const [status, setStatus] = useState<OfflineStatus | null>(null)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    if (typeof navigator !== 'undefined') {
      setOnline(navigator.onLine)
    }
    const tenantId = customAuth.getCachedSession().session?.user?.tenant_id
    setStatus(await getOfflineStatus(tenantId).catch(() => null))
  }, [])

  useEffect(() => {
    refresh()
    const onOnline = () => {
      setOnline(true)
      refresh()
    }
    const onOffline = () => {
      setOnline(false)
      refresh()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        refresh()
      }
    }, OFFLINE_STATUS_REFRESH_MS)

    const onVisibilityChange = () => {
      if (!document.hidden) {
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(timer)
    }
  }, [refresh])

  const pending = (status?.pending || 0) + (status?.failed || 0)
  const visible = !online || pending > 0 || status?.offline_mode

  const synchronize = async () => {
    setSyncing(true)
    try {
      const { session, accessToken } = customAuth.getCachedSession()
      await syncOfflineQueue(accessToken, session?.user?.tenant_id)
      await refresh()
    } finally {
      setSyncing(false)
    }
  }

  if (!visible) return null

  return (
    <div className="flex h-11 items-center gap-2 rounded-xl border border-border/80 bg-card px-3 text-xs font-semibold text-foreground shadow-sm">
      {online ? <Wifi className="h-4 w-4 text-emerald-400 dark:text-emerald-400" /> : <WifiOff className="h-4 w-4 text-amber-400 dark:text-amber-400" />}
      <span className="hidden sm:inline">{online ? 'Online' : 'Offline'}</span>
      {pending > 0 ? <span className="rounded bg-amber-400/15 px-2 py-0.5 text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:text-amber-700">{pending}</span> : null}
      {pending > 0 && online ? (
        <button
          type="button"
          onClick={synchronize}
          disabled={syncing}
          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-accent disabled:opacity-50"
          title="Sincronizar cola offline"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      ) : null}
    </div>
  )
}
