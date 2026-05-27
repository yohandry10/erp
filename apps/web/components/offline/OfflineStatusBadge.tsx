'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { getOfflineStatus, syncOfflineQueue, type OfflineStatus } from '@/lib/offline-store'

const OFFLINE_STATUS_REFRESH_MS = 30_000

export function OfflineStatusBadge() {
  const [online, setOnline] = useState(true)
  const [status, setStatus] = useState<OfflineStatus | null>(null)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    if (typeof navigator !== 'undefined') {
      setOnline(navigator.onLine)
    }
    setStatus(await getOfflineStatus().catch(() => null))
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
      await syncOfflineQueue()
      await refresh()
    } finally {
      setSyncing(false)
    }
  }

  if (!visible) return null

  return (
    <div className="flex h-10 items-center gap-2 rounded-md border border-cyan-400/20 bg-slate-950/90 px-3 text-xs font-semibold text-cyan-50 shadow-lg shadow-slate-950/20 group-data-[erp-theme=light]/dashboard:border-slate-300 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-700">
      {online ? <Wifi className="h-4 w-4 text-emerald-300" /> : <WifiOff className="h-4 w-4 text-amber-300" />}
      <span>{online ? 'Online' : 'Offline'}</span>
      {pending > 0 ? <span className="rounded bg-amber-400/15 px-2 py-0.5 text-amber-100 group-data-[erp-theme=light]/dashboard:text-amber-700">{pending}</span> : null}
      {pending > 0 && online ? (
        <button
          type="button"
          onClick={synchronize}
          disabled={syncing}
          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded border border-cyan-400/20 text-cyan-100 transition hover:bg-cyan-400/10 disabled:opacity-50 group-data-[erp-theme=light]/dashboard:text-slate-700"
          title="Sincronizar cola offline"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      ) : null}
    </div>
  )
}
