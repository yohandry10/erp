/**
 * EJEMPLO DE USO DEL HOOK useEmpresaConfig
 * 
 * Este componente demuestra cómo usar el hook useEmpresaConfig
 * para adaptar dinámicamente la UI según la configuración de la empresa.
 * 
 * Este archivo es solo un ejemplo y no se usa en producción.
 */

'use client'

import { useEmpresaConfig } from '@/hooks/use-empresa-config'

interface PedidoActionsExampleProps {
  pedido: {
    id: string
    estado: string
    total: number
  }
}

export function PedidoActionsExample({ pedido }: PedidoActionsExampleProps) {
  const { 
    config,
    loading, 
    isFlujologistica, 
    isGreObligatorio,
    isGreAutomatico,
    umbralGre 
  } = useEmpresaConfig()

  if (loading) {
    return <div>Cargando configuración...</div>
  }

  // Ejemplo 1: Mostrar diferentes botones según el flujo de trabajo
  const renderActionButtons = () => {
    if (pedido.estado === 'CONFIRMADO') {
      if (isFlujologistica) {
        // Flujo completo: mostrar botón para ir a inventario
        return (
          <div>
            <button>Ver en Inventario</button>
            <p>El pedido debe pasar por preparación y despacho</p>
          </div>
        )
      } else {
        // Flujo simplificado: mostrar botón para facturar directamente
        return (
          <div>
            <button>Generar Factura</button>
            <p>El pedido está listo para facturar</p>
          </div>
        )
      }
    }

    if (pedido.estado === 'LISTO_FACTURAR') {
      return (
        <div>
          <button>Generar Factura</button>
          {shouldSuggestGRE() && (
            <p>
              💡 Se recomienda generar GRE para este pedido
            </p>
          )}
        </div>
      )
    }

    return null
  }

  // Ejemplo 2: Lógica para sugerir GRE
  const shouldSuggestGRE = () => {
    if (isGreObligatorio) {
      return true // Siempre sugerir si es obligatorio
    }

    if (isGreAutomatico && pedido.total > umbralGre) {
      return true // Sugerir si supera el umbral
    }

    return false
  }

  // Ejemplo 3: Mostrar información del flujo actual
  const renderFlowInfo = () => {
    return (
      <div className="p-4 rounded-lg mb-4">
        <h3>Configuración Actual</h3>
        <ul>
          <li>Tipo de Empresa: {config?.tipo_empresa}</li>
          <li>Flujo: {isFlujologistica ? 'Completo con Logística' : 'Simplificado'}</li>
          <li>GRE Obligatorio: {isGreObligatorio ? 'Sí' : 'No'}</li>
          <li>Sugerencia Automática GRE: {isGreAutomatico ? 'Sí' : 'No'}</li>
          {isGreAutomatico && <li>Umbral GRE: S/ {umbralGre}</li>}
        </ul>
      </div>
    )
  }

  // Ejemplo 4: Timeline del flujo según configuración
  const renderFlowTimeline = () => {
    const steps = [
      { label: 'Pedido', active: true },
      { label: 'Confirmado', active: pedido.estado !== 'PENDIENTE' },
    ]

    if (isFlujologistica) {
      steps.push(
        { label: 'Preparación', active: ['EN_PREPARACION', 'LISTO_DESPACHO', 'LISTO_FACTURAR', 'FACTURADO'].includes(pedido.estado) },
        { label: 'Despacho', active: ['LISTO_DESPACHO', 'LISTO_FACTURAR', 'FACTURADO'].includes(pedido.estado) }
      )
    }

    steps.push(
      { label: 'Facturación', active: pedido.estado === 'FACTURADO' }
    )

    return (
      <div className="flex gap-2 mb-4">
        {steps.map((step, index) => (
          <div
            key={index} className="py-2 px-4 rounded-[6px] text-[0.875rem]"
          >
            {step.label}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <h2>Pedido #{pedido.id}</h2>
      
      {renderFlowInfo()}
      {renderFlowTimeline()}
      {renderActionButtons()}

      {/* Ejemplo 5: Validación de GRE obligatorio */}
      {isGreObligatorio && pedido.estado === 'LISTO_FACTURAR' && (
        <div className="p-4 bg-[#fee2e2] rounded-lg mt-4">
          <strong>⚠️ Atención:</strong> Este pedido requiere una Guía de Remisión Electrónica
          antes de poder facturar.
        </div>
      )}
    </div>
  )
}

/**
 * EJEMPLO DE USO EN UNA PÁGINA:
 * 
 * import { PedidoActionsExample } from '@/components/ventas/PedidoActionsExample'
 * 
 * function PedidoDetailPage({ params }) {
 *   const pedido = usePedido(params.id)
 * 
 *   return (
 *     <div>
 *       <PedidoActionsExample pedido={pedido} />
 *     </div>
 *   )
 * }
 */
