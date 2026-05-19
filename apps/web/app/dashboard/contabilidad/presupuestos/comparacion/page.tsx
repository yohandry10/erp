'use client'

import { useState, useCallback, useEffect } from 'react'
import { Calendar, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import PresupuestoVsRealChart from '@/components/contabilidad/PresupuestoVsRealChart'
import { useApi } from '@/hooks/use-api'

interface Periodo {
  id: string
  anio: number
  mes: number
  estado: string
}

export default function ComparacionPresupuestoPage() {
  const router = useRouter()
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [selectedPeriodoId, setSelectedPeriodoId] = useState<string>('')
  const [centroIdFilter, setCentroIdFilter] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  const fetchPeriodos = useCallback(async () => {
    try {
      setLoading(true)
      const result = await apiCall('/contabilidad/periodos')
      const periodosData = result?.data || []
      setPeriodos(periodosData)

      // Seleccionar el período más reciente por defecto
      if (periodosData.length > 0) {
        // Ordenar por año y mes descendente
        const sorted = [...periodosData].sort((a, b) => {
          if (a.anio !== b.anio) return b.anio - a.anio
          return b.mes - a.mes
        })
        setSelectedPeriodoId(sorted[0].id)
      }
    } catch (err) {
      console.error('Error fetching períodos:', err)
    } finally {
      setLoading(false)
    }
  }, [apiCall])

  useEffect(() => {
    fetchPeriodos()

    const params = new URLSearchParams(window.location.search)
    const periodoIdParam = params.get('periodoId')
    const centroIdParam = params.get('centroId')

    if (periodoIdParam) {
      setSelectedPeriodoId(periodoIdParam)
    }
    if (centroIdParam) {
      setCentroIdFilter(centroIdParam)
    }
  }, [fetchPeriodos])

  const formatPeriodo = (anio: number, mes: number) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `${meses[mes - 1]} ${anio}`
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="flex items-center gap-4">
          <button
            aria-label="Volver a presupuestos"
            onClick={() => router.back()} className="p-2 rounded-2 border bg-white cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="dashboard-title">Comparación Presupuesto vs Real</h1>
            <p className="dashboard-subtitle">
              Análisis comparativo de presupuestos por centro de costo
            </p>
          </div>
        </div>

        {/* Selector de Período */}
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-gray-500" />
          <select
            value={selectedPeriodoId}
            onChange={(e) => setSelectedPeriodoId(e.target.value)}
            disabled={loading || periodos.length === 0} className="py-3 px-4 rounded-2 border bg-white text-[0.875rem] font-semibold text-gray-700 cursor-pointer min-w-[200px]"
          >
            {periodos.length === 0 && (
              <option value="">No hay períodos disponibles</option>
            )}
            {periodos.map((periodo) => (
              <option key={periodo.id} value={periodo.id}>
                {formatPeriodo(periodo.anio, periodo.mes)} ({periodo.estado})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center p-12 bg-white rounded-3 shadow">
          <div className="w-6 h-6 rounded-full" />
          <span className="ml-3 text-gray-500">
            Cargando períodos...
          </span>
        </div>
      ) : periodos.length === 0 ? (
        <div className="p-12 bg-white rounded-3 shadow text-center">
          <p className="m-0 text-4 text-gray-500">
            No hay períodos contables disponibles
          </p>
          <p className="mt-2 mr-0 mb-0 ml-0 text-[0.875rem] text-gray-400">
            Cree un período contable para comenzar a usar presupuestos
          </p>
        </div>
      ) : selectedPeriodoId ? (
        <PresupuestoVsRealChart periodoId={selectedPeriodoId} centroId={centroIdFilter} />
      ) : null}
    </div>
  )
}
