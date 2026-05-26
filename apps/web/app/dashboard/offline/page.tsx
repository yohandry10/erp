'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import {
  deleteOfflineRequest,
  getOfflineStatus,
  listOfflineRequests,
  syncOfflineQueue,
  type OfflineQueueItem,
  type OfflineStatus,
} from '@/lib/offline-store'

const panelClass = 'rounded-lg border border-cyan-400/15 bg-slate-950/70 p-5 text-slate-100 shadow-xl shadow-slate-950/20 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white group-data-[erp-theme=light]/dashboard:text-slate-800'
const buttonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/20 px-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50 group-data-[erp-theme=light]/dashboard:text-slate-700'

function formatDate(value: number) {
  if (!value) return '-'
  return new Date(value).toLocaleString('es-PE')
}

function statusLabel(status: OfflineQueueItem['status']) {
  if (status === 'synced') return 'Sincronizado'
  if (status === 'failed') return 'Falló'
  return 'Pendiente'
}

export default function OfflinePage() {
  const [online, setOnline] = useState(true)
  const [status, setStatus] = useState<OfflineStatus | null>(null)
  const [queue, setQueue] = useState<OfflineQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
      const [nextStatus, nextQueue] = await Promise.all([
        getOfflineStatus(),
        listOfflineRequests(),
      ])
      setStatus(nextStatus)
      setQueue(nextQueue.sort((a, b) => b.created_at - a.created_at))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const onOnline = () => {
      setOnline(true)
      load()
    }
    const onOffline = () => {
      setOnline(false)
      load()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [load])

  const pendingCount = useMemo(
    () => queue.filter((item) => item.status === 'pending' || item.status === 'failed').length,
    [queue],
  )

  const synchronize = async () => {
    setSyncing(true)
    try {
      await syncOfflineQueue()
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const removeItem = async (id: string) => {
    await deleteOfflineRequest(id)
    await load()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 pt-14 md:flex-row md:items-end md:justify-between md:pt-0">
        <div>
          <h1 className="text-3xl font-black text-white group-data-[erp-theme=light]/dashboard:text-slate-900">Offline</h1>
          <p className="mt-1 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-600">
            Cola local, cache de lecturas y reintentos contra el backend autoritativo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={load} disabled={loading} className={buttonClass}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button type="button" onClick={synchronize} disabled={!online || syncing || pendingCount === 0} className={buttonClass}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className={panelClass}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">
            {online ? <Wifi className="h-4 w-4 text-emerald-300" /> : <WifiOff className="h-4 w-4 text-amber-300" />}
            Estado
          </div>
          <div className="mt-3 text-2xl font-black">{online ? 'Online' : 'Offline'}</div>
        </div>
        <div className={panelClass}>
          <div className="text-sm font-semibold text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">Pendientes</div>
          <div className="mt-3 text-2xl font-black">{status?.pending ?? 0}</div>
        </div>
        <div className={panelClass}>
          <div className="text-sm font-semibold text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">Fallidos</div>
          <div className="mt-3 text-2xl font-black">{status?.failed ?? 0}</div>
        </div>
        <div className={panelClass}>
          <div className="text-sm font-semibold text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">Sincronizados</div>
          <div className="mt-3 text-2xl font-black">{status?.synced ?? 0}</div>
        </div>
      </div>

      <div className={panelClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Operaciones locales</h2>
          <span className="text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500">{queue.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-cyan-400/10 text-xs uppercase text-slate-400 group-data-[erp-theme=light]/dashboard:border-slate-200">
              <tr>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Metodo</th>
                <th className="px-3 py-3">Endpoint</th>
                <th className="px-3 py-3">Intentos</th>
                <th className="px-3 py-3">Creado</th>
                <th className="px-3 py-3">Error</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">No hay operaciones offline.</td>
                </tr>
              ) : queue.map((item) => (
                <tr key={item.id} className="border-b border-cyan-400/10 group-data-[erp-theme=light]/dashboard:border-slate-100">
                  <td className="px-3 py-3">{statusLabel(item.status)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{item.method}</td>
                  <td className="max-w-[420px] truncate px-3 py-3 font-mono text-xs">{item.endpoint}</td>
                  <td className="px-3 py-3">{item.attempts}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(item.created_at)}</td>
                  <td className="max-w-[280px] truncate px-3 py-3 text-amber-200 group-data-[erp-theme=light]/dashboard:text-amber-700">{item.last_error || '-'}</td>
                  <td className="px-3 py-3 text-right">
                    <button type="button" onClick={() => removeItem(item.id)} className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-500/20 hover:bg-slate-500/10" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
