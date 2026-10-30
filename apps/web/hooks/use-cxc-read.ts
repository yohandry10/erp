'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApi } from '@/hooks/use-api'
import type { CxcReadScope } from '@/lib/finanzas/cxc-read-contract'

export function useCxcRead<T>(endpoint: string, load: (get: (endpoint: string) => Promise<any>, endpoint: string, scope: CxcReadScope) => Promise<T>, enabled = true) {
  const { session, loading: authLoading } = useAuth()
  const { get } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const tenantId = session?.user?.tenant_id || '', actorId = session?.user?.id || ''
  const key = `${tenantId}:${actorId}:${endpoint}:${enabled}`, generation = useRef(0)
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: string | null }>({ key: '', data: null, loading: true, error: null })
  const reload = useCallback(async () => {
    const current = ++generation.current
    setState({ key, data: null, loading: true, error: null })
    if (!enabled || authLoading || !tenantId || !actorId) return
    try {
      const data = await load(get, endpoint, { tenantId, actorId })
      if (current === generation.current) setState({ key, data, loading: false, error: null })
    } catch {
      if (current === generation.current) setState({ key, data: null, loading: false, error: 'No se pudo consultar la información completa de la cuenta por cobrar. Reintenta la consulta.' })
    }
  }, [get, load, endpoint, enabled, authLoading, tenantId, actorId, key])
  useEffect(() => {
    void reload()
    return () => { generation.current += 1 }
  }, [reload])
  return { ...(state.key === key ? state : { key, data: null, loading: true, error: null }), reload }
}
