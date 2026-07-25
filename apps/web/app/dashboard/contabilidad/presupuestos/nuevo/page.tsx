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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
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
