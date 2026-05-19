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
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  )
}
