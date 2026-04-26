'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PresupuestoForm from '@/components/contabilidad/PresupuestoForm'

export default function NuevoPresupuestoPage() {
  const router = useRouter()

  const handleSuccess = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
  }

  const handleCancel = () => {
    router.push('/dashboard/contabilidad/presupuestos/lista')
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
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  )
}
