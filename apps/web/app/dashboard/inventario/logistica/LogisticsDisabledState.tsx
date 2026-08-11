'use client'

import { useState, type ComponentType } from 'react'
import { CheckCircle2, Settings2 } from 'lucide-react'
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
      const intentStorageKey = 'configuration-logistics-enable-intent'
      let idempotencyKey = window.sessionStorage.getItem(intentStorageKey)
      if (!idempotencyKey) {
        idempotencyKey = `configuration-logistics-${window.crypto.randomUUID()}`
        window.sessionStorage.setItem(intentStorageKey, idempotencyKey)
      }
      const response = await put(
        '/configuration/empresa',
        { usar_flujo_logistica: true },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )

      if (!response?.success) {
        throw new Error(response?.message || 'No se pudo activar el flujo logístico')
      }

      window.sessionStorage.removeItem(intentStorageKey)
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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <section className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mx-auto max-w-3xl p-8">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground m-0 text-2xl">{title}</h1>
          <p className="mt-2 text-base text-muted-foreground mt-2 max-w-2xl">{description}</p>
        </div>

        <div className="mb-6 grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4">
            <CheckCircle2 className="mb-2 h-5 w-5 text-primary" />
            <h2 className="m-0 text-sm font-semibold">Preparación</h2>
            <p className="mt-1 text-sm">Los pedidos confirmados pasarán por una cola de almacén.</p>
          </div>
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4">
            <CheckCircle2 className="mb-2 h-5 w-5 text-primary" />
            <h2 className="m-0 text-sm font-semibold">Despacho</h2>
            <p className="mt-1 text-sm">El equipo podrá confirmar salida, tracking y observaciones.</p>
          </div>
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4">
            <CheckCircle2 className="mb-2 h-5 w-5 text-primary" />
            <h2 className="m-0 text-sm font-semibold">Facturación</h2>
            <p className="mt-1 text-sm">La factura se habilita después del despacho confirmado.</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={activateLogistics} disabled={activating} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 min-w-[220px]">
            <Settings2 className={activating ? 'animate-spin' : ''} />
            {activating ? 'Activando...' : 'Activar flujo logístico'}
          </Button>
        </div>
      </section>
    </div>
  )
}
