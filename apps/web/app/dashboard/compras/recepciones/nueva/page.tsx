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
              className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-cyan-50 hover:bg-cyan-400/10"
            >
              <ArrowLeft size={16} />
              Volver a Recepciones
            </button>
            <h1 className="dashboard-title">Nueva Recepción de Mercancía</h1>
            <p className="dashboard-subtitle text-cyan-100">
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
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-cyan-50 hover:bg-cyan-400/10"
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
    <Suspense fallback={null}>
      <NuevaRecepcionContent />
    </Suspense>
  )
}
