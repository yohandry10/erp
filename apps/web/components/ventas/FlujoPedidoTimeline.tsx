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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-800">
          <Circle className="w-5 h-5" />
          <span className="font-semibold">Pedido Cancelado</span>
        </div>
        <p className="text-sm text-red-600 mt-1">
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
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'current':
        return <Clock className="w-5 h-5 text-blue-600" />
      case 'upcoming':
        return <Circle className="w-5 h-5 text-gray-300" />
    }
  }

  const getStepColor = (status: 'completed' | 'current' | 'upcoming') => {
    switch (status) {
      case 'completed':
        return 'text-green-600'
      case 'current':
        return 'text-blue-600'
      case 'upcoming':
        return 'text-gray-400'
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
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
                    status === 'completed' ? 'border-green-600 bg-green-50' :
                    status === 'current' ? 'border-blue-600 bg-blue-50' :
                    'border-gray-300 bg-gray-50'
                  }`}>
                    {getStepIcon(status)}
                  </div>

                  {/* Label */}
                  <div className="mt-2 text-center">
                    <p className={`text-sm font-medium ${getStepColor(status)}`}>
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
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
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span>Completado</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Actual</span>
          </div>
          <div className="flex items-center gap-1">
            <Circle className="w-4 h-4 text-gray-300" />
            <span>Pendiente</span>
          </div>
        </div>
      </div>
    </div>
  )
}
