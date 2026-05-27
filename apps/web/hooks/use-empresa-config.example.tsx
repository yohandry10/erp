/**
 * useEmpresaConfig Hook - Usage Examples
 * 
 * This hook provides access to the tenant's empresa configuration,
 * including settings for sales flow, GRE automation, and more.
 * 
 * The configuration is cached in a React Context and automatically
 * refreshed when needed.
 */

import { useEmpresaConfig } from './use-empresa-config'
import { fetchApi } from '@/lib/api-fetch'

// ============================================================================
// Example 1: Basic Usage - Accessing Configuration
// ============================================================================

export function BasicExample() {
  const { config, loading, error } = useEmpresaConfig()

  if (loading) {
    return <div>Loading configuration...</div>
  }

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <div>
      <h2>Company Configuration</h2>
      <p>Company Type: {config?.tipo_empresa}</p>
      <p>Uses Logistics Flow: {config?.usar_flujo_logistica ? 'Yes' : 'No'}</p>
      <p>GRE Mandatory: {config?.gre_obligatorio ? 'Yes' : 'No'}</p>
    </div>
  )
}

// ============================================================================
// Example 2: Conditional Rendering Based on Flow Type
// ============================================================================

export function ConditionalFlowExample() {
  const { isFlujologistica, loading } = useEmpresaConfig()

  if (loading) return null

  return (
    <div>
      {isFlujologistica ? (
        <div>
          <h3>Complete Flow (with Logistics)</h3>
          <p>Orders will go through preparation and dispatch stages</p>
          <button>View in Inventory</button>
        </div>
      ) : (
        <div>
          <h3>Simplified Flow</h3>
          <p>Orders go directly from confirmation to invoicing</p>
          <button>Generate Invoice</button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Example 3: Using Helper Properties
// ============================================================================

export function HelperPropertiesExample() {
  const { 
    isFlujologistica,    // usar_flujo_logistica
    isGreObligatorio,    // gre_obligatorio
    isGreAutomatico,     // gre_automatico_habilitado
    umbralGre,           // umbral_gre_automatico
    loading 
  } = useEmpresaConfig()

  if (loading) return null

  return (
    <div>
      <h3>GRE Configuration</h3>
      <ul>
        <li>Logistics Flow: {isFlujologistica ? 'Enabled' : 'Disabled'}</li>
        <li>GRE Mandatory: {isGreObligatorio ? 'Yes' : 'No'}</li>
        <li>GRE Automatic: {isGreAutomatico ? 'Yes' : 'No'}</li>
        <li>GRE Threshold: S/ {umbralGre}</li>
      </ul>
    </div>
  )
}

// ============================================================================
// Example 4: Refreshing Configuration After Update
// ============================================================================

export function RefreshConfigExample() {
  const { config, refreshConfig, loading } = useEmpresaConfig()

  const handleUpdateConfig = async () => {
    // Update configuration via API
    await fetchApi('/api/configuracion/empresa', {
      method: 'PUT',
      body: JSON.stringify({
        usar_flujo_logistica: true,
        gre_obligatorio: true
      })
    })

    // Refresh the cached configuration
    await refreshConfig()
  }

  return (
    <div>
      <p>Current Flow: {config?.usar_flujo_logistica ? 'Complete' : 'Simplified'}</p>
      <button onClick={handleUpdateConfig}>
        Update Configuration
      </button>
    </div>
  )
}

// ============================================================================
// Example 5: Conditional Button Display Based on State and Config
// ============================================================================

export function ConditionalButtonsExample({ pedido }: { pedido: any }) {
  const { config, loading } = useEmpresaConfig()

  if (loading) return null

  return (
    <div className="action-buttons">
      {/* Simplified Flow - Show Generate Invoice button when confirmed */}
      {!config?.usar_flujo_logistica && pedido.estado === 'CONFIRMADO' && (
        <button>Generate Invoice</button>
      )}

      {/* Complete Flow - Show View in Inventory button when confirmed */}
      {config?.usar_flujo_logistica && pedido.estado === 'CONFIRMADO' && (
        <button>View in Inventory</button>
      )}

      {/* Common for both flows - Show Generate Invoice when ready */}
      {pedido.estado === 'LISTO_FACTURAR' && (
        <button>Generate Invoice</button>
      )}
    </div>
  )
}

// ============================================================================
// Example 6: Hiding Components Based on Configuration
// ============================================================================

export function ConditionalComponentExample() {
  const { isFlujologistica, loading } = useEmpresaConfig()

  // Don't render logistics components if flow is not enabled
  if (!isFlujologistica) {
    return null
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h2>Logistics Module</h2>
      <p>Manage order preparation and dispatch</p>
      {/* Logistics-specific content */}
    </div>
  )
}

// ============================================================================
// Example 7: Using Configuration in API Calls
// ============================================================================

export function ApiCallExample() {
  const { config } = useEmpresaConfig()

  const handleGenerateInvoice = async (pedidoId: string) => {
    const response = await fetchApi(`/api/ventas/pedidos/${pedidoId}/generar-factura`, {
      method: 'POST',
      body: JSON.stringify({
        // Pass config to backend if needed
        usar_flujo_logistica: config?.usar_flujo_logistica,
        gre_automatico_habilitado: config?.gre_automatico_habilitado
      })
    })

    const data = await response.json()

    // Check if should suggest GRE based on config
    if (data.sugerir_gre && config?.gre_automatico_habilitado) {
      // Show GRE suggestion modal
    }
  }

  return (
    <button onClick={() => handleGenerateInvoice('pedido-123')}>
      Generate Invoice
    </button>
  )
}

// ============================================================================
// Example 8: Timeline Component with Dynamic Steps
// ============================================================================

export function TimelineExample({ currentState }: { currentState: string }) {
  const { isFlujologistica } = useEmpresaConfig()

  const simpleSteps = ['PENDIENTE', 'CONFIRMADO', 'LISTO_FACTURAR', 'FACTURADO']
  const completeSteps = [
    'PENDIENTE', 
    'CONFIRMADO', 
    'EN_PREPARACION', 
    'LISTO_DESPACHO', 
    'LISTO_FACTURAR', 
    'FACTURADO'
  ]

  const steps = isFlujologistica ? completeSteps : simpleSteps

  return (
    <div className="timeline">
      {steps.map((step, index) => (
        <div 
          key={step}
          className={step === currentState ? 'active' : ''}
        >
          {step}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Example 9: Status Messages Based on Configuration
// ============================================================================

export function StatusMessageExample({ pedido }: { pedido: any }) {
  const { config } = useEmpresaConfig()

  if (pedido.estado !== 'CONFIRMADO') return null

  return (
    <div>
      {config?.usar_flujo_logistica ? (
        <div className="info-message">
          ℹ️ Waiting for preparation in warehouse
        </div>
      ) : (
        <div className="success-message">
          ✓ Stock: RESERVED
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Example 10: Form Validation Based on Configuration
// ============================================================================

export function FormValidationExample() {
  const { isGreObligatorio, umbralGre } = useEmpresaConfig()

  const validateOrder = (order: any) => {
    const errors: string[] = []

    // Validate GRE requirement
    if (isGreObligatorio && order.total > umbralGre && !order.gre_id) {
      errors.push('GRE is mandatory for orders above the threshold')
    }

    return errors
  }

  return (
    <form>
      {/* Form fields */}
      <button type="submit">Submit Order</button>
    </form>
  )
}
