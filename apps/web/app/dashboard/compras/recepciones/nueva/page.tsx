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
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
          <div>
            <button
              onClick={() => router.push('/dashboard/compras/recepciones')}
              className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-card/70 px-4 py-2 text-sm font-semibold text-primary hover:bg-cyan-400/10"
            >
              <ArrowLeft size={16} />
              Volver a Recepciones
            </button>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Nueva Recepción de Mercancía</h1>
            <p className="mt-2 text-base text-muted-foreground text-primary">
              No se especificó una orden de compra
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/recepciones')}
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-card/70 px-4 py-2 text-sm font-semibold text-primary hover:bg-cyan-400/10"
          >
            <ArrowLeft size={16} />
            Volver a Recepciones
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Nueva Recepción de Mercancía</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Complete el wizard para recepcionar la mercancía
          </p>
        </div>
      </div>

      {/* Wizard Content */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
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
