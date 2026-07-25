'use client'

import { Clock, User, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface CambioEstado {
  id: string
  fecha: string
  usuario?: string
  usuario_nombre?: string
  estado_anterior?: string
  estado_nuevo: string
  notas?: string
}

interface EstadoTimelineProps {
  cambios: CambioEstado[]
  className?: string
}

export default function EstadoTimeline({
  cambios,
  className = ''
}: EstadoTimelineProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return format(date, "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })
    } catch {
      return dateString
    }
  }

  const getEstadoBadgeColor = (estado: string) => {
    const colors: Record<string, string> = {
      PENDIENTE: 'bg-muted text-foreground',
      CONFIRMADO: 'bg-primary/10 text-primary',
      EN_PREPARACION: 'bg-amber-500/10 text-amber-400',
      LISTO_DESPACHO: 'bg-violet-500/10 text-violet-400',
      DESPACHO_PARCIAL: 'bg-amber-500/10 text-amber-400',
      LISTO_FACTURAR: 'bg-primary/10 text-primary',
      FACTURADO: 'bg-emerald-500/10 text-emerald-400',
      COMPLETADO: 'bg-emerald-500/10 text-emerald-400',
      COMPLETADO_CON_GRE: 'bg-emerald-500/10 text-emerald-400',
      CANCELADO: 'bg-destructive/10 text-destructive',
      BORRADOR: 'bg-muted text-foreground',
      ENVIADA: 'bg-primary/10 text-primary',
      APROBADA: 'bg-emerald-500/10 text-emerald-400',
      RECHAZADA: 'bg-destructive/10 text-destructive',
      CONVERTIDA: 'bg-violet-500/10 text-violet-400',
      VENCIDA: 'bg-amber-500/10 text-amber-400'
    }
    return colors[estado] || 'bg-muted text-foreground'
  }

  if (!cambios || cambios.length === 0) {
    return (
      <div className={`text-center py-8 text-muted-foreground ${className}`}>
        No hay historial de cambios disponible
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {cambios.map((cambio, index) => (
          <div key={cambio.id} className="relative">
            {/* Timeline line */}
            {index < cambios.length - 1 && (
              <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-muted" />
            )}

            <div className="flex gap-4">
              {/* Timeline dot */}
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center relative z-10">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {cambio.estado_anterior && (
                          <>
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEstadoBadgeColor(
                                cambio.estado_anterior
                              )}`}
                            >
                              {cambio.estado_anterior}
                            </span>
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          </>
                        )}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEstadoBadgeColor(
                            cambio.estado_nuevo
                          )}`}
                        >
                          {cambio.estado_nuevo}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2 text-foreground/80">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDate(cambio.fecha)}</span>
                    </div>

                    {(cambio.usuario_nombre || cambio.usuario) && (
                      <div className="flex items-center gap-2 text-foreground/80">
                        <User className="w-3.5 h-3.5" />
                        <span>
                          {cambio.usuario_nombre || `Usuario ${cambio.usuario}`}
                        </span>
                      </div>
                    )}

                    {cambio.notas && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-foreground/85 text-sm">{cambio.notas}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
