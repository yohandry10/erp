'use client'

import { EstadoPedido } from '@/types/ventas'
import { CheckCircle, Circle, Clock } from 'lucide-react'

interface FlujoPedidoTimelineProps {
  estadoActual: EstadoPedido
  usarFlujoLogistica: boolean
}

interface TimelineStep {
  estado: EstadoPedido
  label: string
  description: string
}

const FLUJO_SIMPLE: TimelineStep[] = [
  {
    estado: EstadoPedido.PENDIENTE,
    label: 'Pendiente',
    description: 'Pedido creado'
  },
  {
    estado: EstadoPedido.CONFIRMADO,
    label: 'Confirmado',
    description: 'Stock reservado'
  },
  {
    estado: EstadoPedido.LISTO_FACTURAR,
    label: 'Listo Facturar',
    description: 'Listo para facturar'
  },
  {
    estado: EstadoPedido.FACTURADO,
    label: 'Facturado',
    description: 'Factura emitida'
  },
  {
    estado: EstadoPedido.COMPLETADO,
    label: 'Completado',
    description: 'Proceso finalizado'
  }
]

const FLUJO_COMPLETO: TimelineStep[] = [
  {
    estado: EstadoPedido.PENDIENTE,
    label: 'Pendiente',
    description: 'Pedido creado'
  },
  {
    estado: EstadoPedido.CONFIRMADO,
    label: 'Confirmado',
    description: 'Stock reservado'
  },
  {
    estado: EstadoPedido.EN_PREPARACION,
    label: 'En Preparación',
    description: 'Preparando en almacén'
  },
  {
    estado: EstadoPedido.LISTO_DESPACHO,
    label: 'Listo Despacho',
    description: 'Listo para despachar'
  },
  {
    estado: EstadoPedido.DESPACHO_PARCIAL,
    label: 'Despacho parcial',
    description: 'Entrega parcial registrada'
  },
  {
    estado: EstadoPedido.LISTO_FACTURAR,
    label: 'Listo Facturar',
    description: 'Listo para facturar'
  },
  {
    estado: EstadoPedido.FACTURADO,
    label: 'Facturado',
    description: 'Factura emitida'
  },
  {
    estado: EstadoPedido.COMPLETADO,
    label: 'Completado',
    description: 'Proceso finalizado'
  }
]

export default function FlujoPedidoTimeline({
  estadoActual,
  usarFlujoLogistica
}: FlujoPedidoTimelineProps) {
  const steps = usarFlujoLogistica ? FLUJO_COMPLETO : FLUJO_SIMPLE

  // Handle canceled state
  if (estadoActual === EstadoPedido.CANCELADO) {
    return (
      <div className="bg-destructive/10 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-destructive">
          <Circle className="w-5 h-5" />
          <span className="font-semibold">Pedido Cancelado</span>
        </div>
        <p className="text-sm text-destructive mt-1">
          Este pedido ha sido cancelado y el stock ha sido liberado.
        </p>
      </div>
    )
  }

  // Find current step index
  const currentIndex = steps.findIndex(step => step.estado === estadoActual)

  const getStepStatus = (index: number): 'completed' | 'current' | 'upcoming' => {
    if (index < currentIndex) return 'completed'
    if (index === currentIndex) return 'current'
    return 'upcoming'
  }

  const getStepIcon = (status: 'completed' | 'current' | 'upcoming') => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />
      case 'current':
        return <Clock className="w-5 h-5 text-primary" />
      case 'upcoming':
        return <Circle className="w-5 h-5 text-muted-foreground" />
    }
  }

  const getStepColor = (status: 'completed' | 'current' | 'upcoming') => {
    switch (status) {
      case 'completed':
        return 'text-emerald-400'
      case 'current':
        return 'text-primary'
      case 'upcoming':
        return 'text-muted-foreground'
    }
  }

  const getLineColor = (status: 'completed' | 'current' | 'upcoming') => {
    switch (status) {
      case 'completed':
        return 'bg-green-600'
      case 'current':
        return 'bg-blue-600'
      case 'upcoming':
        return 'bg-gray-300'
    }
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Flujo del Pedido {usarFlujoLogistica ? '(Completo)' : '(Simplificado)'}
      </h3>

      <div className="relative">
        {/* Timeline */}
        <div className="flex items-start justify-between">
          {steps.map((step, index) => {
            const status = getStepStatus(index)
            const isLast = index === steps.length - 1

            return (
              <div key={step.estado} className="flex-1 relative">
                <div className="flex flex-col items-center">
                  {/* Icon */}
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    status === 'completed' ? 'border-green-600 bg-emerald-500/10' :
                    status === 'current' ? 'border-blue-600 bg-primary/10' :
                    'border-border bg-muted/30'
                  }`}>
                    {getStepIcon(status)}
                  </div>

                  {/* Label */}
                  <div className="mt-2 text-center">
                    <p className={`text-sm font-medium ${getStepColor(status)}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Connecting Line */}
                {!isLast && (
                  <div className="absolute top-5 left-1/2 w-full h-0.5 -z-10">
                    <div className={`h-full ${
                      index < currentIndex ? getLineColor('completed') : getLineColor('upcoming')
                    }`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border">
        <div className="flex items-center justify-center gap-6 text-xs text-foreground/80">
          <div className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Completado</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-primary" />
            <span>Actual</span>
          </div>
          <div className="flex items-center gap-1">
            <Circle className="w-4 h-4 text-muted-foreground" />
            <span>Pendiente</span>
          </div>
        </div>
      </div>
    </div>
  )
}
