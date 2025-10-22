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
      PENDIENTE: 'bg-gray-100 text-gray-800',
      CONFIRMADO: 'bg-blue-100 text-blue-800',
      EN_PREPARACION: 'bg-yellow-100 text-yellow-800',
      LISTO_DESPACHO: 'bg-purple-100 text-purple-800',
      DESPACHO_PARCIAL: 'bg-amber-100 text-amber-800',
      LISTO_FACTURAR: 'bg-indigo-100 text-indigo-800',
      FACTURADO: 'bg-green-100 text-green-800',
      COMPLETADO: 'bg-green-100 text-green-800',
      COMPLETADO_CON_GRE: 'bg-green-100 text-green-800',
      CANCELADO: 'bg-red-100 text-red-800',
      BORRADOR: 'bg-gray-100 text-gray-800',
      ENVIADA: 'bg-blue-100 text-blue-800',
      APROBADA: 'bg-green-100 text-green-800',
      RECHAZADA: 'bg-red-100 text-red-800',
      CONVERTIDA: 'bg-purple-100 text-purple-800',
      VENCIDA: 'bg-orange-100 text-orange-800'
    }
    return colors[estado] || 'bg-gray-100 text-gray-800'
  }

  if (!cambios || cambios.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
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
              <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-200" />
            )}

            <div className="flex gap-4">
              {/* Timeline dot */}
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center relative z-10">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
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
                            <ArrowRight className="w-4 h-4 text-gray-400" />
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
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDate(cambio.fecha)}</span>
                    </div>

                    {(cambio.usuario_nombre || cambio.usuario) && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <User className="w-3.5 h-3.5" />
                        <span>
                          {cambio.usuario_nombre || `Usuario ${cambio.usuario}`}
                        </span>
                      </div>
                    )}

                    {cambio.notas && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-gray-700 text-sm">{cambio.notas}</p>
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
