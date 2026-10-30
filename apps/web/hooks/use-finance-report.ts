'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'

export type ReportRead = (endpoint: string) => Promise<any>
export type ReportLoader = (get: ReportRead, endpoint: string) => Promise<any>

export function useFinanceReport<T>(
  endpoint: string,
  validate: (response: any) => T,
  onReadyChange?: (ready: boolean) => void,
  loader?: ReportLoader,
) {
  const { get } = useApi({ showErrorToast: false, requireLive: true })
  const generation = useRef(0)
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    setData(null)
    setError(null)
    onReadyChange?.(false)
    try {
      const response = loader ? await loader(get, endpoint) : await get(endpoint)
      if (current !== generation.current) return
      const result = validate(response)
      setData(result)
      onReadyChange?.(true)
    } catch {
      if (current !== generation.current) return
      setError('No se pudo consultar el reporte completo. Reintente para recuperar los datos actuales.')
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [get, endpoint, validate, onReadyChange, loader])
  useEffect(() => {
    void reload()
    return () => { generation.current += 1; onReadyChange?.(false) }
  }, [reload, onReadyChange])
  return { data, loading, error, reload }
}
