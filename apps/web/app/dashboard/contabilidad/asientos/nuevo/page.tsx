'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, FileText } from 'lucide-react'
import AsientoForm from '@/components/contabilidad/AsientoForm'

interface Cuenta {
  id: string
  codigo: string
  nombre: string
}

interface CentroCosto {
  id: string
  nombre: string
}

interface AsientoFormData {
  fecha: string
  concepto: string
  referencia?: string
  detalles: Array<{
    cuenta_id: string
    debe: number
    haber: number
    concepto: string
    centro_costo_id?: string
  }>
}

export default function NuevoAsientoPage() {
  const router = useRouter()
  const { get, post } = useApi()

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInitialData = useCallback(async () => {
    try {
      setLoadingData(true)
      setError(null)

      // Cargar plan de cuentas
      const cuentasResponse = await get('/api/contabilidad/plan-cuentas')
      if (cuentasResponse?.success && cuentasResponse.data) {
        setCuentas(cuentasResponse.data)
      }

      // Cargar centros de costo
      const centrosResponse = await get('/api/contabilidad/centros-costo')
      if (centrosResponse?.success && centrosResponse.data) {
        setCentrosCosto(centrosResponse.data)
      }
    } catch (err: any) {
      console.error('Error loading initial data:', err)
      setError(err.message || 'Error al cargar los datos iniciales')
    } finally {
      setLoadingData(false)
    }
  }, [get])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const handleSubmit = async (data: AsientoFormData) => {
    try {
      setLoading(true)
      setError(null)

      const response = await post('/api/contabilidad/asiento-contable', data)

      if (response?.success) {
        alert('✅ Asiento contable creado exitosamente')
        router.push(`/dashboard/contabilidad/asientos/${response.data.id}`)
      } else {
        throw new Error(response?.message || 'Error al crear el asiento')
      }
    } catch (err: any) {
      console.error('Error creating asiento:', err)
      setError(err.message || 'Error al crear el asiento contable')
      alert(`❌ Error: ${err.message || 'Error al crear el asiento contable'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (confirm('¿Está seguro de cancelar? Se perderán los datos ingresados.')) {
      router.push('/dashboard/contabilidad/asientos')
    }
  }

  if (loadingData) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando datos...</p>
        </div>
      </div>
    )
  }

  if (error && cuentas.length === 0) {
    return (
      <div className="dashboard-container">
        <div className="activity-section">
          <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Error al cargar los datos
            </h3>
            <p style={{ marginBottom: '1.5rem' }}>{error}</p>
            <button
              onClick={loadInitialData}
              className="refresh-btn"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/contabilidad/asientos')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Asientos Contables
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--primary-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-600)'
            }}>
              <FileText size={24} />
            </div>
            <h1 className="dashboard-title">Nuevo Asiento Contable Manual</h1>
          </div>
          <p className="dashboard-subtitle">
            Complete el formulario para crear un asiento contable manual. El asiento debe estar balanceado (Debe = Haber).
          </p>
        </div>
      </div>

      {/* Form */}
      <AsientoForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        cuentas={cuentas}
        centrosCosto={centrosCosto}
        loading={loading}
      />
    </div>
  )
}
