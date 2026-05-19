'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import PresupuestoForm from '@/components/contabilidad/PresupuestoForm'

export default function EditarPresupuestoPage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  
  const presupuestoId = params.id as string | undefined

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [presupuesto, setPresupuesto] = useState<any>(null)

  const loadPresupuesto = useCallback(async () => {
    if (!presupuestoId) return

    try {
      setLoading(true)
      setError(null)

      const response = await get(`/api/contabilidad/presupuestos/${presupuestoId}`)

      if (response?.success && response.data) {
        setPresupuesto(response.data)
      } else {
        setError('Presupuesto no encontrado')
      }
    } catch (err: any) {
      console.error('Error loading presupuesto:', err)
      setError('Error al cargar el presupuesto')
    } finally {
      setLoading(false)
    }
  }, [get, presupuestoId])

  useEffect(() => {
    loadPresupuesto()
  }, [loadPresupuesto])

  const handleSuccess = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
  }

  const handleCancel = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading p-12 text-center">
          <div className="loading-spinner"></div>
          <p>Cargando presupuesto...</p>
        </div>
      </div>
    )
  }

  if (error || !presupuesto) {
    return (
      <div className="dashboard-container">
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
            className="secondary-btn py-2 px-4 inline-flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            Volver a Presupuestos
          </button>
        </div>

        <div className="activity-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#fef2f2] flex items-center justify-center">
            <AlertCircle size={32} className="text-red-600" />
          </div>
          <h3 className="text-5 font-semibold mb-2 text-[var(--primary-800)]">
            Error al cargar presupuesto
          </h3>
          <p className="text-[var(--primary-600)] mb-6">
            {error || 'El presupuesto no existe o no tiene permisos para verlo'}
          </p>
          <button
            onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
            className="primary-btn"
          >
            Volver a la lista
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="mb-6">
        <button
          onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
          className="secondary-btn py-2 px-4 inline-flex items-center gap-2"
        >
          <ArrowLeft size={18} />
          Volver a Presupuestos
        </button>
      </div>

      <PresupuestoForm 
        presupuestoId={presupuestoId}
        initialData={presupuesto}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  )
}
