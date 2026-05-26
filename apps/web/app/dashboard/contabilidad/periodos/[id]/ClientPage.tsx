'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Calendar, Lock, Unlock, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react'
import PeriodoCierreWizard from '@/components/contabilidad/PeriodoCierreWizard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useApi } from '@/hooks/use-api'

interface Periodo {
  id: string
  tenant_id: string
  anio: number
  mes: number
  estado: 'ABIERTO' | 'CERRADO' | 'BLOQUEADO'
  fecha_cierre?: string
  cerrado_por?: string
  created_at: string
  updated_at: string
}

export default function PeriodoDetailPage() {
  const router = useRouter()
  const params = useParams()
  const periodoId = params.id as string | undefined

  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [reopening, setReopening] = useState(false)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  // Estado para diálogo de confirmación
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void | Promise<void>
    variant?: 'default' | 'danger' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  })

  const fetchPeriodo = useCallback(async () => {
    if (!periodoId) return

    try {
      setLoading(true)
      setError(null)
      
      const result = await apiCall(`/contabilidad/periodos/${periodoId}`)
      setPeriodo(result?.data)
    } catch (err) {
      console.error('Error fetching período:', err)
      setError('Error al cargar el período contable')
    } finally {
      setLoading(false)
    }
  }, [apiCall, periodoId])

  const formatPeriodo = (anio: number, mes: number) => {
    const meses = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ]
    return `${meses[mes - 1]} ${anio}`
  }

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'ABIERTO':
        return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' }
      case 'CERRADO':
        return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }
      case 'BLOQUEADO':
        return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
      default:
        return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
    }
  }

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'ABIERTO':
        return <Unlock size={20} />
      case 'CERRADO':
        return <Lock size={20} />
      case 'BLOQUEADO':
        return <AlertCircle size={20} />
      default:
        return <Calendar size={20} />
    }
  }

  const handleReabrirPeriodo = async () => {
    setReopening(true)
    setError(null)

    try {
      const response = await apiCall(`/contabilidad/periodos/${periodoId}/reabrir`, { method: 'POST' })
      if (response?.success === false) {
        throw new Error(response.message || 'Error al reabrir el período')
      }
      await fetchPeriodo()
    } catch (err: any) {
      console.error('Error reopening período:', err)
      setError(err.message || 'Error al reabrir el período contable')
    } finally {
      setReopening(false)
    }
  }

  useEffect(() => {
    fetchPeriodo()
  }, [fetchPeriodo])

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="flex items-center justify-center p-12 bg-white rounded-3">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full" />
            <p className="text-gray-500">Cargando período...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !periodo) {
    return (
      <div className="dashboard-container">
        <div className="p-8 bg-[#fee2e2] border rounded-3 text-red-800">
          <p className="m-0 font-semibold">⚠️ {error || 'Período no encontrado'}</p>
          <button
            onClick={() => router.push('/dashboard/contabilidad/periodos')} className="mt-4 py-2 px-4 bg-red-600 text-white border-0 rounded-[6px] cursor-pointer font-semibold"
          >
            Volver a Períodos
          </button>
        </div>
      </div>
    )
  }

  const estadoColor = getEstadoColor(periodo.estado)

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/contabilidad/periodos')} className="inline-flex items-center gap-2 py-2 px-4 bg-transparent text-slate-500 border-0 rounded-2 cursor-pointer font-semibold text-[0.875rem] mb-4 transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)'
              e.currentTarget.style.color = '#334155'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = '#64748b'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Períodos
          </button>
          <h1 className="dashboard-title">Período Contable</h1>
          <p className="dashboard-subtitle">
            {formatPeriodo(periodo.anio, periodo.mes)}
          </p>
        </div>
        <div className="flex gap-4">
          {periodo.estado === 'ABIERTO' && (
            <button
              onClick={() => setShowWizard(true)} className="flex items-center gap-2 py-3 px-6 text-white border-0 rounded-2 cursor-pointer font-semibold text-[0.875rem] transition shadow"
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            >
              <Lock size={20} />
              Cerrar Período
            </button>
          )}
          {periodo.estado === 'CERRADO' && (
            <button
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Reabrir Período',
                  message: '¿Está seguro de reabrir este período contable?\n\nEsto permitirá realizar nuevos movimientos contables.',
                  variant: 'warning',
                  onConfirm: handleReabrirPeriodo
                })
              }}
              disabled={reopening} className="flex items-center gap-2 py-3 px-6 text-white border-0 rounded-2 font-semibold text-[0.875rem] transition shadow"
              onMouseEnter={(e) => {
                if (!reopening) {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            >
              <Unlock size={20} />
              {reopening ? 'Reabriendo...' : 'Reabrir Período (Superadmin)'}
            </button>
          )}
        </div>
      </div>

      {/* Period Info Card */}
      <div className="bg-white rounded-3 shadow overflow-hidden mb-8">
        <div className="p-8 border-b">
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-8">
            {/* Estado */}
            <div>
              <p className="mt-0 mr-0 mb-2 ml-0 text-3 font-bold text-gray-500">
                Estado
              </p>
              <div className="inline-flex items-center gap-2 py-2 px-4 rounded-2 text-[0.875rem] font-semibold">
                {getEstadoIcon(periodo.estado)}
                {periodo.estado}
              </div>
            </div>

            {/* Año */}
            <div>
              <p className="mt-0 mr-0 mb-2 ml-0 text-3 font-bold text-gray-500">
                Año
              </p>
              <p className="m-0 text-6 font-bold text-gray-800">
                {periodo.anio}
              </p>
            </div>

            {/* Mes */}
            <div>
              <p className="mt-0 mr-0 mb-2 ml-0 text-3 font-bold text-gray-500">
                Mes
              </p>
              <p className="m-0 text-6 font-bold text-gray-800">
                {String(periodo.mes).padStart(2, '0')}
              </p>
            </div>

            {/* Fecha de Cierre */}
            {periodo.fecha_cierre && (
              <div>
                <p className="mt-0 mr-0 mb-2 ml-0 text-3 font-bold text-gray-500">
                  Fecha de Cierre
                </p>
                <p className="m-0 text-4 font-semibold text-gray-800">
                  {new Date(periodo.fecha_cierre).toLocaleDateString('es-PE', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Additional Info */}
        <div className="py-6 px-8 bg-[#f9fafb]">
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-6">
            <div>
              <p className="mt-0 mr-0 mb-1 ml-0 text-3 font-semibold text-gray-500">
                ID del Período
              </p>
              <p className="m-0 text-[0.875rem] font-medium text-gray-800">
                {periodo.id}
              </p>
            </div>

            <div>
              <p className="mt-0 mr-0 mb-1 ml-0 text-3 font-semibold text-gray-500">
                Fecha de Creación
              </p>
              <p className="m-0 text-[0.875rem] font-medium text-gray-800">
                {new Date(periodo.created_at).toLocaleDateString('es-PE', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </p>
            </div>

            {periodo.cerrado_por && (
              <div>
                <p className="mt-0 mr-0 mb-1 ml-0 text-3 font-semibold text-gray-500">
                  Cerrado Por
                </p>
                <p className="m-0 text-[0.875rem] font-medium text-gray-800">
                  {periodo.cerrado_por}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="p-6 rounded-3">
        <div className="flex items-start gap-3">
          {periodo.estado === 'ABIERTO' ? (
            <CheckCircle size={24} className="text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <Lock size={24} className="text-blue-600 shrink-0 mt-0.5" />
          )}
          <div>
            <h4 className="mt-0 mr-0 mb-2 ml-0 text-4 font-semibold">
              {periodo.estado === 'ABIERTO' 
                ? 'Período Abierto' 
                : periodo.estado === 'CERRADO'
                ? 'Período Cerrado'
                : 'Período Bloqueado'
              }
            </h4>
            <p className="m-0 text-[0.875rem] leading-7">
              {periodo.estado === 'ABIERTO' 
                ? 'Este período está abierto y permite el registro de nuevos asientos contables. Puedes cerrarlo cuando hayas terminado todas las operaciones del mes.'
                : periodo.estado === 'CERRADO'
                ? 'Este período está cerrado y no permite el registro de nuevos asientos contables. Solo un superadministrador puede reabrirlo.'
                : 'Este período está bloqueado y no permite ninguna modificación.'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Wizard Modal */}
      {showWizard && (
        <PeriodoCierreWizard
          periodoId={periodo.id}
          anio={periodo.anio}
          mes={periodo.mes}
          onClose={() => setShowWizard(false)}
          onSuccess={() => {
            setShowWizard(false)
            fetchPeriodo()
          }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />
    </div>
  )
}

