'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApi } from '@/hooks/use-api'

export function useCashRead<T>(endpoint: string, validate: (response: any) => T, enabled = true) {
  const { session, loading: authLoading } = useAuth()
  const { get } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false })
  const actor = `${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`
  const key = `${actor}:${endpoint}:${enabled}`
  const generation = useRef(0)
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: string | null }>({ key: '', data: null, loading: true, error: null })
  const reload = useCallback(async () => {
    const current = ++generation.current
    setState({ key, data: null, loading: true, error: null })
    if (!enabled || authLoading || !session?.user) return
    try {
      const response = await get(endpoint)
      if (current !== generation.current) return
      const data = validate(response)
      setState({ key, data, loading: false, error: null })
    } catch {
      if (current === generation.current) setState({ key, data: null, loading: false, error: 'No se pudo consultar la información completa de caja. Reintente para recuperar los datos actuales.' })
    }
  }, [get, endpoint, validate, enabled, authLoading, session?.user, key])
  useEffect(() => {
    void reload()
    return () => { generation.current += 1 }
  }, [reload])
  return { ...(state.key === key ? state : { key, data: null, loading: true, error: null }), reload }
}
