'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Database, Link2, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import { customAuth } from '@/lib/auth-service'
import {
  deleteOfflineRequest,
  getOfflineStatus,
  listLocalIdMappings,
  listOfflineRequests,
  refreshLocalFirstSnapshots,
  syncOfflineQueue,
  type LocalIdMapping,
  type OfflineQueueItem,
  type OfflineStatus,
} from '@/lib/offline-store'

const panelClass = 'rounded-lg border border-cyan-400/15 bg-card/70 p-5 text-foreground shadow-xl shadow-slate-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground'
const buttonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-cyan-400/20 px-3 text-sm font-semibold text-primary transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50 group-data-[erp-theme=light]/dashboard:text-foreground/85'

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
  const [mappings, setMappings] = useState<LocalIdMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [refreshingSnapshots, setRefreshingSnapshots] = useState(false)
  const [snapshotSummary, setSnapshotSummary] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)
      const [nextStatus, nextQueue, nextMappings] = await Promise.all([
        getOfflineStatus(),
        listOfflineRequests(),
        listLocalIdMappings(),
      ])
      setStatus(nextStatus)
      setQueue(nextQueue.sort((a, b) => b.created_at - a.created_at))
      setMappings(nextMappings)
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
  const conflictCount = useMemo(
    () => queue.filter((item) => item.status === 'failed' && isConflict(item)).length,
    [queue],
  )

  const synchronize = async () => {
    setSyncing(true)
    try {
      await syncOfflineQueue(customAuth.getCachedSession().accessToken)
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const removeItem = async (id: string) => {
    await deleteOfflineRequest(id)
    await load()
  }

  const refreshSnapshots = async () => {
    setRefreshingSnapshots(true)
    setSnapshotSummary(null)
    try {
      const headers = new Headers()
      const { session, accessToken } = customAuth.getCachedSession()
      const token = accessToken ?? session?.access_token
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (session?.user?.tenant_id) headers.set('x-tenant-id', session.user.tenant_id)
      const result = await refreshLocalFirstSnapshots(undefined, headers)
      const ok = result.filter((item) => item.ok).length
      setSnapshotSummary(`${ok}/${result.length} snapshots actualizados`)
      await load()
    } finally {
      setRefreshingSnapshots(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <div className="flex flex-col gap-4 pt-14 md:flex-row md:items-end md:justify-between md:pt-0">
        <div>
          <h1 className="text-3xl font-black text-white group-data-[erp-theme=light]/dashboard:text-foreground">Offline</h1>
          <p className="mt-1 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
            Cola local, cache de lecturas y reintentos contra el backend autoritativo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={load} disabled={loading} className={buttonClass}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={synchronize}
            disabled={!online || syncing || pendingCount === 0}
            title={
              !online
                ? 'Sin conexión: la sincronización se reanudará al recuperar internet'
                : syncing
                  ? 'Sincronización en curso'
                  : pendingCount === 0
                    ? 'No hay operaciones pendientes para sincronizar'
                    : 'Sincronizar operaciones pendientes'
            }
            className={buttonClass}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
          <button type="button" onClick={refreshSnapshots} disabled={!online || refreshingSnapshots} className={buttonClass}>
            <Database className={`h-4 w-4 ${refreshingSnapshots ? 'animate-pulse' : ''}`} />
            Snapshots
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className={panelClass}>
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">
            {online ? <Wifi className="h-4 w-4 text-emerald-300" /> : <WifiOff className="h-4 w-4 text-amber-300" />}
            Estado
          </div>
          <div className="mt-3 text-2xl font-black">{online ? 'Online' : 'Offline'}</div>
        </div>
        <div className={panelClass}>
          <div className="text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Pendientes</div>
          <div className="mt-3 text-2xl font-black">{status?.pending ?? 0}</div>
        </div>
        <div className={panelClass}>
          <div className="text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Fallidos</div>
          <div className="mt-3 text-2xl font-black">{status?.failed ?? 0}</div>
        </div>
        <div className={panelClass}>
          <div className="text-sm font-semibold text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">Sincronizados</div>
          <div className="mt-3 text-2xl font-black">{status?.synced ?? 0}</div>
        </div>
      </div>

      {(conflictCount > 0 || snapshotSummary) && (
        <div className="grid gap-4 md:grid-cols-2">
          {conflictCount > 0 && (
            <div className={panelClass}>
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                Conflictos detectados
              </div>
              <div className="mt-2 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">
                {conflictCount} operacion(es) requieren revision antes de reintentar.
              </div>
            </div>
          )}
          {snapshotSummary && (
            <div className={panelClass}>
              <div className="flex items-center gap-2 text-sm font-semibold text-primary group-data-[erp-theme=light]/dashboard:text-foreground/85">
                <Database className="h-4 w-4" />
                Cache local
              </div>
              <div className="mt-2 text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-foreground/80">{snapshotSummary}</div>
            </div>
          )}
        </div>
      )}

      <div className={panelClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Operaciones locales</h2>
          <span className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">{queue.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-cyan-400/10 text-xs uppercase text-muted-foreground group-data-[erp-theme=light]/dashboard:border-border">
              <tr>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Metodo</th>
                <th className="px-3 py-3">Endpoint</th>
                <th className="px-3 py-3">Intentos</th>
                <th className="px-3 py-3">Tenant/Usuario</th>
                <th className="px-3 py-3">Respuesta</th>
                <th className="px-3 py-3">Creado</th>
                <th className="px-3 py-3">Error</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No hay operaciones offline.</td>
                </tr>
              ) : queue.map((item) => (
                <tr key={item.id} className="border-b border-cyan-400/10 group-data-[erp-theme=light]/dashboard:border-border">
                  <td className="px-3 py-3">
                    <div>{statusLabel(item.status)}</div>
                    {isConflict(item) && <div className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:text-amber-700">Conflicto</div>}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{item.method}</td>
                  <td className="max-w-[420px] truncate px-3 py-3 font-mono text-xs">{item.endpoint}</td>
                  <td className="px-3 py-3">{item.attempts}</td>
                  <td className="max-w-[180px] px-3 py-3 font-mono text-xs">
                    <div className="truncate">{item.tenant_id || '-'}</div>
                    <div className="truncate text-muted-foreground">{item.user_id || '-'}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.response_status || '-'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(item.created_at)}</td>
                  <td className="max-w-[320px] px-3 py-3 text-amber-700 dark:text-amber-200 group-data-[erp-theme=light]/dashboard:text-amber-700">
                    <details>
                      <summary className="cursor-pointer truncate">{item.last_error || previewPayload(item.body) || '-'}</summary>
                      <pre className="mt-2 max-h-40 max-w-[360px] overflow-auto whitespace-pre-wrap rounded border border-slate-500/20 bg-card/80 p-2 text-[11px] text-foreground/90 group-data-[erp-theme=light]/dashboard:bg-muted/30 group-data-[erp-theme=light]/dashboard:text-foreground/85">
                        {formatDetails(item)}
                      </pre>
                    </details>
                  </td>
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

      <div className={panelClass}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Link2 className="h-4 w-4" />
            IDs locales sincronizados
          </h2>
          <span className="text-sm text-muted-foreground group-data-[erp-theme=light]/dashboard:text-muted-foreground">{mappings.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-cyan-400/10 text-xs uppercase text-muted-foreground group-data-[erp-theme=light]/dashboard:border-border">
              <tr>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Local</th>
                <th className="px-3 py-3">Remoto</th>
                <th className="px-3 py-3">Endpoint</th>
                <th className="px-3 py-3">Sincronizado</th>
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Aun no hay mapeos local-remoto.</td>
                </tr>
              ) : mappings.map((item) => (
                <tr key={`${item.local_id}-${item.remote_id}`} className="border-b border-cyan-400/10 group-data-[erp-theme=light]/dashboard:border-border">
                  <td className="px-3 py-3">{item.entity_type}</td>
                  <td className="max-w-[260px] truncate px-3 py-3 font-mono text-xs">{item.local_id}</td>
                  <td className="max-w-[260px] truncate px-3 py-3 font-mono text-xs">{item.remote_id}</td>
                  <td className="max-w-[320px] truncate px-3 py-3 font-mono text-xs">{item.endpoint}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatDate(item.synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function isConflict(item: OfflineQueueItem) {
  const error = `${item.last_error || ''} ${item.response_body || ''}`.toLowerCase()
  return item.status === 'failed' && (
    item.response_status === 409
    || item.response_status === 422
    || error.includes('conflict')
    || error.includes('duplicate')
    || error.includes('constraint')
    || error.includes('unique')
  )
}

function previewPayload(raw?: string | null) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed).slice(0, 160)
  } catch {
    return raw.slice(0, 160)
  }
}

function formatDetails(item: OfflineQueueItem) {
  return JSON.stringify({
    id: item.id,
    endpoint: item.endpoint,
    method: item.method,
    status: item.status,
    attempts: item.attempts,
    tenant_id: item.tenant_id,
    user_id: item.user_id,
    response_status: item.response_status,
    last_error: item.last_error,
    body: safeJson(item.body),
    response_body: safeJson(item.response_body),
  }, null, 2)
}

function safeJson(raw?: string | null) {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
