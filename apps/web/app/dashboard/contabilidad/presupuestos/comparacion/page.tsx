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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-4">
          <button
            aria-label="Volver a presupuestos"
            onClick={() => router.back()} className="p-2 rounded-lg border bg-card cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Comparación Presupuesto vs Real</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Análisis comparativo de presupuestos por centro de costo
            </p>
          </div>
        </div>

        {/* Selector de Período */}
        <div className="flex items-center gap-3">
          <Calendar size={20} className="text-muted-foreground" />
          <select
            value={selectedPeriodoId}
            onChange={(e) => setSelectedPeriodoId(e.target.value)}
            disabled={loading || periodos.length === 0} className="py-3 px-4 rounded-lg border bg-card text-[0.875rem] font-semibold text-foreground/85 cursor-pointer min-w-[200px]"
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
        <div className="flex items-center justify-center p-12 bg-card rounded-xl shadow">
          <div className="w-6 h-6 rounded-full" />
          <span className="ml-3 text-muted-foreground">
            Cargando períodos...
          </span>
        </div>
      ) : periodos.length === 0 ? (
        <div className="p-12 bg-card rounded-xl shadow text-center">
          <p className="m-0 text-base text-muted-foreground">
            No hay períodos contables disponibles
          </p>
          <p className="mt-2 mr-0 mb-0 ml-0 text-[0.875rem] text-muted-foreground">
            Cree un período contable para comenzar a usar presupuestos
          </p>
        </div>
      ) : selectedPeriodoId ? (
        <PresupuestoVsRealChart periodoId={selectedPeriodoId} centroId={centroIdFilter} />
      ) : null}
    </div>
  )
}
