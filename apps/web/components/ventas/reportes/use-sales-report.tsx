'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'

export function useSalesReport<T>(endpoint: string, params: object, shape: 'array' | 'object') {
  const { get } = useApi({ throwOnError: true, showErrorToast: false, retries: 1 })
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const revision = useRef(0)
  const invalidate = useCallback(() => { ++revision.current }, [])
  const query = JSON.stringify(params)

  const retry = useCallback(async () => {
    const current = ++revision.current
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const filters = JSON.parse(query)
      if (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) {
        throw new Error('La fecha desde debe ser anterior o igual a la fecha hasta')
      }
      const response = await get(endpoint, { params: filters })
      const value = response?.data
      if (!response?.success || (shape === 'array' ? !Array.isArray(value) :
        !value || typeof value !== 'object' || Array.isArray(value))) {
        throw new Error('El reporte recibido está incompleto. Vuelve a intentarlo')
      }
      if (current === revision.current) setData(value)
    } catch (cause: unknown) {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : 'No se pudo obtener el reporte')
    } finally {
      if (current === revision.current) setLoading(false)
    }
  }, [endpoint, query, shape, get])

  useEffect(() => {
    invalidate()
    setData(null)
    setLoading(true)
    setError(null)
    const timer = window.setTimeout(() => { void retry() }, 250)
    return () => { window.clearTimeout(timer); invalidate() }
  }, [retry, invalidate])
  return { data, loading, error, retry }
}

export function ReportReadError({ error, retry }: { error: string; retry: () => Promise<void> }) {
  return <div role="alert" className="rounded-lg border border-destructive p-4">
    <p className="font-semibold">No se pudo cargar el reporte</p>
    <p className="text-sm">{error}</p>
    <Button variant="outline" className="mt-2" onClick={() => { void retry() }}>Reintentar</Button>
  </div>
}

export function ReportDisabled({ name }: { name: string }) {
  return <div role="status" className="rounded-lg border border-border p-6">
    <h3 className="font-semibold">Reporte deshabilitado</h3>
    <p className="mt-2 text-sm text-muted-foreground">{name} está deshabilitado en la configuración de esta empresa. Un administrador puede habilitarlo en Configuración → Ventas.</p>
  </div>
}
