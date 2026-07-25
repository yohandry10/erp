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
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center p-12 text-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando presupuesto...</p>
        </div>
      </div>
    )
  }

  if (error || !presupuesto) {
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

        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#fef2f2] flex items-center justify-center">
            <AlertCircle size={32} className="text-destructive" />
          </div>
          <h3 className="text-xl font-semibold mb-2 text-[var(--primary-800)]">
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
        presupuestoId={presupuestoId}
        initialData={presupuesto}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </div>
  )
}

