'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { RecepcionWizard } from '@/components/compras/RecepcionWizard'

function NuevaRecepcionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ordenId = searchParams.get('orden_id')

  const handleComplete = () => {
    router.push('/dashboard/compras/recepciones')
  }

  const handleCancel = () => {
    router.push('/dashboard/compras/recepciones')
  }

  if (!ordenId) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <button
              onClick={() => router.push('/dashboard/compras/recepciones')}
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
              Volver a Recepciones
            </button>
            <h1 className="dashboard-title">Nueva Recepción de Mercancía</h1>
            <p className="dashboard-subtitle" style={{ color: '#ef4444' }}>
              No se especificó una orden de compra
            </p>
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
            onClick={() => router.push('/dashboard/compras/recepciones')}
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
            Volver a Recepciones
          </button>
          <h1 className="dashboard-title">Nueva Recepción de Mercancía</h1>
          <p className="dashboard-subtitle">
            Complete el wizard para recepcionar la mercancía
          </p>
        </div>
      </div>

      {/* Wizard Content */}
      <div className="activity-section">
        <RecepcionWizard
          ordenId={ordenId}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      </div>
    </div>
  )
}

export default function NuevaRecepcionPage() {
  return (
    <Suspense fallback={<div className="dashboard-container">Cargando...</div>}>
      <NuevaRecepcionContent />
    </Suspense>
  )
}
