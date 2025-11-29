'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    fetchPeriodos()
    
    // Check for URL parameters
    const params = new URLSearchParams(window.location.search)
    const periodoIdParam = params.get('periodoId')
    const centroIdParam = params.get('centroId')
    
    if (periodoIdParam) {
      setSelectedPeriodoId(periodoIdParam)
    }
    if (centroIdParam) {
      setCentroIdFilter(centroIdParam)
    }
  }, [])

  const fetchPeriodos = async () => {
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
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => router.back()}
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Calendar size={20} style={{ color: '#6b7280' }} />
          <select
            value={selectedPeriodoId}
            onChange={(e) => setSelectedPeriodoId(e.target.value)}
            disabled={loading || periodos.length === 0}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#374151',
              cursor: 'pointer',
              minWidth: '200px'
            }}
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            width: '24px', 
            height: '24px', 
            border: '3px solid #e5e7eb',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ marginLeft: '0.75rem', color: '#6b7280' }}>
            Cargando períodos...
          </span>
        </div>
      ) : periodos.length === 0 ? (
        <div style={{
          padding: '3rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <p style={{ margin: 0, fontSize: '1rem', color: '#6b7280' }}>
            No hay períodos contables disponibles
          </p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#9ca3af' }}>
            Cree un período contable para comenzar a usar presupuestos
          </p>
        </div>
      ) : selectedPeriodoId ? (
        <PresupuestoVsRealChart periodoId={selectedPeriodoId} centroId={centroIdFilter} />
      ) : null}

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
