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
            <p style={{ color: 'orange' }}>
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
      <div style={{
        padding: '1rem',
        background: isFlujologistica ? '#e0f2fe' : '#fef3c7',
        borderRadius: '8px',
        marginBottom: '1rem',
      }}>
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
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {steps.map((step, index) => (
          <div
            key={index}
            style={{
              padding: '0.5rem 1rem',
              background: step.active ? '#10b981' : '#e5e7eb',
              color: step.active ? 'white' : '#6b7280',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}
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
        <div style={{
          padding: '1rem',
          background: '#fee2e2',
          borderRadius: '8px',
          marginTop: '1rem',
        }}>
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
