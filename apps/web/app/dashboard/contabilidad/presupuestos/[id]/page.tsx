'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import PresupuestoForm from '@/components/contabilidad/PresupuestoForm'

export default function EditarPresupuestoPage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  
  const presupuestoId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [presupuesto, setPresupuesto] = useState<any>(null)

  useEffect(() => {
    if (presupuestoId) {
      loadPresupuesto()
    }
  }, [presupuestoId])

  const loadPresupuesto = async () => {
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
  }

  const handleSuccess = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
  }

  const handleCancel = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading" style={{ padding: '3rem', textAlign: 'center' }}>
          <div className="loading-spinner"></div>
          <p>Cargando presupuesto...</p>
        </div>
      </div>
    )
  }

  if (error || !presupuesto) {
    return (
      <div className="dashboard-container">
        <div style={{ marginBottom: '1.5rem' }}>
          <button
            onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
            className="secondary-btn"
            style={{
              padding: '0.5rem 1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <ArrowLeft size={18} />
            Volver a Presupuestos
          </button>
        </div>

        <div className="activity-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem'
          }}>
            <AlertCircle size={32} style={{ color: '#dc2626' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--primary-800)' }}>
            Error al cargar presupuesto
          </h3>
          <p style={{ color: 'var(--primary-600)', marginBottom: '1.5rem' }}>
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
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => router.push('/dashboard/contabilidad/presupuestos/lista')}
          className="secondary-btn"
          style={{
            padding: '0.5rem 1rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
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
