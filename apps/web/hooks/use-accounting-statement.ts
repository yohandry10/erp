'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'

export function previousAccountingPeriod(anio: number, mes: number) {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

// A current report and its requested comparison form one publication. A failed
// dependency cannot become a zero comparison or retain a report from another month.
export function useAccountingStatement<T>(
  path: string,
  anio: number,
  mes: number,
  validate: (response: unknown, anio: number, mes: number) => T,
  compare = false,
) {
  const { get } = useApi({ showErrorToast: false, requireLive: true })
  const generation = useRef(0)
  const key = `${path}:${anio}:${mes}:${compare}`
  const [state, setState] = useState<{
    key: string; data: T | null; previousData: T | null; loading: boolean; error: string | null
  }>({ key, data: null, previousData: null, loading: true, error: null })
  const reload = useCallback(async () => {
    const current = ++generation.current
    setState({ key, data: null, previousData: null, loading: true, error: null })
    try {
      const response: unknown = await get(`${path}?anio=${anio}&mes=${mes}`)
      if (current !== generation.current) return
      const data = validate(response, anio, mes)
      let previousData: T | null = null
      if (compare) {
        const previous = previousAccountingPeriod(anio, mes)
        const previousResponse: unknown = await get(`${path}?anio=${previous.anio}&mes=${previous.mes}`)
        if (current !== generation.current) return
        previousData = validate(previousResponse, previous.anio, previous.mes)
      }
      setState({ key, data, previousData, loading: false, error: null })
    } catch {
      if (current !== generation.current) return
      setState({ key, data: null, previousData: null, loading: false,
        error: 'No se pudo consultar el reporte completo. Reintente para recuperar los datos actuales.' })
    }
  }, [get, path, anio, mes, compare, validate, key])
  useEffect(() => {
    void reload()
    return () => { generation.current += 1 }
  }, [reload])
  // Hide the previous publication during the render that changes the filters,
  // before the effect starts its next request.
  return { ...(state.key === key ? state : { data: null, previousData: null, loading: true, error: null }), reload }
}
