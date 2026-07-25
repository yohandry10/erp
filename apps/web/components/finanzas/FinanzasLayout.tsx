'use client'

import { ReactNode } from 'react'

interface FinanzasLayoutProps {
  children: ReactNode
  title: string
  subtitle: string
  actions?: ReactNode
  stats?: ReactNode
  filters?: ReactNode
  alerts?: ReactNode
}

/**
 * Layout consistente para todas las páginas del módulo Finanzas
 * Proporciona estructura uniforme con header, stats, filtros y contenido
 */
export default function FinanzasLayout({
  children,
  title,
  subtitle,
  actions,
  stats,
  filters,
  alerts
}: FinanzasLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header consistente */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">{title}</h1>
          <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
        </div>
        {actions && (
          <div className="flex gap-4 items-center flex-wrap">
            {actions}
          </div>
        )}
      </div>

      {/* Stats section si se proporciona */}
      {stats && (
        <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
          {stats}
        </div>
      )}

      {/* Alerts section si se proporciona */}
      {alerts && (
        <div className="mb-8">
          {alerts}
        </div>
      )}

      {/* Filters section si se proporciona */}
      {filters && (
        <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl mb-8">
          {filters}
        </div>
      )}

      {/* Contenido principal */}
      {children}
    </div>
  )
}
