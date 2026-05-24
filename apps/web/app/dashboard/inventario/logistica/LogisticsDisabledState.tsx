'use client'

import Link from 'next/link'
import { useState, type ComponentType } from 'react'
import { ArrowRight, CheckCircle2, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { useApi } from '@/hooks/use-api'
import { useEmpresaConfig } from '@/hooks/use-empresa-config'

interface LogisticsDisabledStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
}

export function LogisticsDisabledState({ icon: Icon, title, description }: LogisticsDisabledStateProps) {
  const { put } = useApi({ showErrorToast: false })
  const { refreshConfig } = useEmpresaConfig()
  const [activating, setActivating] = useState(false)

  const activateLogistics = async () => {
    try {
      setActivating(true)
      const response = await put('/configuration/empresa', { usar_flujo_logistica: true })

      if (!response?.success) {
        throw new Error(response?.message || 'No se pudo activar el flujo logístico')
      }

      await refreshConfig()
      toast({
        title: 'Flujo logístico activado',
        description: 'Ya puedes preparar pedidos y confirmar despachos desde Inventario.',
      })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudo activar logística',
        description: error instanceof Error ? error.message : 'Revisa la configuración de empresa e inténtalo nuevamente.',
      })
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="dashboard-container">
      <section className="activity-card mx-auto max-w-3xl p-8">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
            <Icon className="h-7 w-7" />
          </div>
          <h1 className="dashboard-title m-0 text-2xl">{title}</h1>
          <p className="dashboard-subtitle mt-2 max-w-2xl">{description}</p>
        </div>

        <div className="mb-6 grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4">
            <CheckCircle2 className="mb-2 h-5 w-5 text-cyan-300" />
            <h2 className="m-0 text-sm font-semibold">Preparación</h2>
            <p className="mt-1 text-sm">Los pedidos confirmados pasarán por una cola de almacén.</p>
          </div>
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4">
            <CheckCircle2 className="mb-2 h-5 w-5 text-cyan-300" />
            <h2 className="m-0 text-sm font-semibold">Despacho</h2>
            <p className="mt-1 text-sm">El equipo podrá confirmar salida, tracking y observaciones.</p>
          </div>
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4">
            <CheckCircle2 className="mb-2 h-5 w-5 text-cyan-300" />
            <h2 className="m-0 text-sm font-semibold">Facturación</h2>
            <p className="mt-1 text-sm">La factura se habilita después del despacho confirmado.</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={activateLogistics} disabled={activating} className="btn-primary min-w-[220px]">
            <Settings2 className={activating ? 'animate-spin' : ''} />
            {activating ? 'Activando...' : 'Activar flujo logístico'}
          </Button>
          <Button asChild variant="outline" className="min-w-[220px]">
            <Link href="/dashboard/wizard">
              Revisar configuración
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
