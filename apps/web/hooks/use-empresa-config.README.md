# useEmpresaConfig Hook

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

## Overview

The `useEmpresaConfig` hook provides access to the tenant's empresa (company) configuration, including settings for sales flow, GRE automation, and other business rules. The configuration is cached in a React Context and automatically loaded when the application starts.

## Features

- ✅ **Cached Configuration**: Configuration is loaded once and cached in React Context
- ✅ **Automatic Loading**: Configuration loads automatically when the dashboard mounts
- ✅ **Helper Properties**: Convenient boolean properties for common checks
- ✅ **Refresh Support**: Ability to manually refresh configuration after updates
- ✅ **TypeScript Support**: Fully typed with TypeScript interfaces
- ✅ **Error Handling**: Built-in error handling and loading states

## Installation

The hook is already integrated into the dashboard layout. No additional setup is required.

```tsx
// apps/web/app/dashboard/layout.tsx
import { EmpresaConfigProvider } from '@/hooks/use-empresa-config'

export default function DashboardLayout({ children }) {
  return (
    <EmpresaConfigProvider>
      {/* Dashboard content */}
    </EmpresaConfigProvider>
  )
}
```

## Basic Usage

```tsx
import { useEmpresaConfig } from '@/hooks/use-empresa-config'

function MyComponent() {
  const { config, loading, error } = useEmpresaConfig()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div>
      <p>Company Type: {config?.tipo_empresa}</p>
      <p>Uses Logistics Flow: {config?.usar_flujo_logistica ? 'Yes' : 'No'}</p>
    </div>
  )
}
```

## API Reference

### Return Values

| Property | Type | Description |
|----------|------|-------------|
| `config` | `EmpresaConfig \| null` | The empresa configuration object |
| `loading` | `boolean` | Whether the configuration is currently loading |
| `error` | `string \| null` | Error message if loading failed |
| `refreshConfig` | `() => Promise<void>` | Function to manually refresh the configuration |
| `isFlujologistica` | `boolean` | Helper: `config?.usar_flujo_logistica \|\| false` |
| `isGreObligatorio` | `boolean` | Helper: `config?.gre_obligatorio \|\| false` |
| `isGreAutomatico` | `boolean` | Helper: `config?.gre_automatico_habilitado !== false` |
| `umbralGre` | `number` | Helper: `config?.umbral_gre_automatico \|\| 700` |

### EmpresaConfig Interface

```typescript
interface EmpresaConfig {
  id?: string
  ruc?: string
  razonSocial?: string
  nombreComercial?: string
  direccion?: string
  telefono?: string
  email?: string
  sitioWeb?: string
  representanteLegal?: string
  regimen?: string
  igvPorcentaje?: number

  // Sales configuration
  tipo_empresa: TipoEmpresa
  usar_flujo_logistica: boolean
  gre_obligatorio: boolean
  gre_automatico_habilitado: boolean
  umbral_gre_automatico: number
}

type TipoEmpresa = 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'
```

## Common Use Cases

### 1. Conditional Rendering Based on Flow Type

```tsx
function PedidoActions({ pedido }) {
  const { isFlujologistica } = useEmpresaConfig()

  return (
    <div>
      {isFlujologistica ? (
        <button>View in Inventory</button>
      ) : (
        <button>Generate Invoice</button>
      )}
    </div>
  )
}
```

### 2. Hiding Components Based on Configuration

```tsx
function LogisticsModule() {
  const { isFlujologistica, loading } = useEmpresaConfig()

  // Don't render if logistics flow is not enabled
  if (!isFlujologistica) return null
  if (loading) return <div>Loading...</div>

  return (
    <div>
      {/* Logistics content */}
    </div>
  )
}
```

### 3. Dynamic Timeline Based on Configuration

```tsx
function OrderTimeline({ currentState }) {
  const { isFlujologistica } = useEmpresaConfig()

  const steps = isFlujologistica
    ? ['PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO_DESPACHO', 'LISTO_FACTURAR']
    : ['PENDIENTE', 'CONFIRMADO', 'LISTO_FACTURAR']

  return (
    <div className="timeline">
      {steps.map(step => (
        <div key={step} className={step === currentState ? 'active' : ''}>
          {step}
        </div>
      ))}
    </div>
  )
}
```

### 4. Refreshing Configuration After Update

```tsx
function ConfigurationForm() {
  const { config, refreshConfig } = useEmpresaConfig()
  const { put } = useApi()

  const handleSave = async (newConfig) => {
    await put('/api/configuracion/empresa', newConfig)

    // Refresh the cached configuration
    await refreshConfig()
  }

  return (
    <form onSubmit={handleSave}>
      {/* Form fields */}
    </form>
  )
}
```

### 5. GRE Suggestion Logic

```tsx
function InvoiceButton({ pedido }) {
  const { isGreAutomatico, umbralGre } = useEmpresaConfig()

  const handleGenerateInvoice = async () => {
    const response = await generateInvoice(pedido.id)

    // Check if should suggest GRE
    if (isGreAutomatico && pedido.total > umbralGre) {
      showGRESuggestionModal()
    }
  }

  return <button onClick={handleGenerateInvoice}>Generate Invoice</button>
}
```

## Requirements Mapping

This hook fulfills the following requirements from the spec:

- **Requirement 7.5**: "WHEN usar_flujo_logistica = false THEN el sistema SHALL ocultar módulos de preparación y despacho"
- **Requirement 7.6**: "WHEN usar_flujo_logistica = true THEN el sistema SHALL mostrar sección de Logística en Inventario"
- **Requirement 20.1**: "WHEN usar_flujo_logistica = false AND pedido está CONFIRMADO THEN el sistema SHALL mostrar botones 'Generar Factura' y 'Cancelar Pedido'"
- **Requirement 20.3**: "WHEN usar_flujo_logistica = true AND pedido está CONFIRMADO THEN el sistema SHALL mostrar botones 'Ver en Inventario' y 'Cancelar Pedido'"

## Files Updated

The following files have been updated to use this hook:

1. ✅ `apps/web/app/dashboard/ventas/pedidos/[id]/page.tsx` - Pedido detail page
2. ✅ `apps/web/app/dashboard/inventario/logistica/ordenes-pendientes/page.tsx` - Pending orders page
3. ✅ `apps/web/app/dashboard/inventario/logistica/listo-despacho/page.tsx` - Ready for dispatch page
4. ✅ `apps/web/app/dashboard/configuracion/ventas/page.tsx` - Sales configuration page

## Standalone Version

For components that don't need caching or are outside the provider, use the standalone version:

```tsx
import { useEmpresaConfigStandalone } from '@/hooks/use-empresa-config'

function StandaloneComponent() {
  const { config, loading } = useEmpresaConfigStandalone()

  // This will make its own API call
  // Use this only when necessary
}
```

## Best Practices

1. **Use the Context Version**: Always use `useEmpresaConfig()` instead of `useEmpresaConfigStandalone()` when inside the dashboard
2. **Check Loading State**: Always check the `loading` state before accessing `config`
3. **Use Helper Properties**: Use `isFlujologistica`, `isGreObligatorio`, etc. instead of accessing `config` directly
4. **Refresh After Updates**: Call `refreshConfig()` after updating the configuration
5. **Handle Null Config**: Always use optional chaining (`config?.property`) or provide defaults

## Troubleshooting

### Configuration Not Loading

If the configuration is not loading:

1. Check that `EmpresaConfigProvider` is wrapping your component
2. Check the browser console for API errors
3. Verify the `/api/configuracion/empresa` endpoint is working

### Configuration Not Updating

If the configuration doesn't update after changes:

1. Call `refreshConfig()` after saving changes
2. Check that the API response includes the updated values
3. Verify the provider is not being unmounted/remounted

### TypeScript Errors

If you get TypeScript errors:

1. Import the hook from `@/hooks/use-empresa-config`
2. Use optional chaining when accessing config properties
3. Check that you're using the correct property names

## Related Files

- `apps/web/hooks/use-empresa-config.ts` - Hook implementation
- `apps/web/hooks/use-empresa-config.example.tsx` - Usage examples
- `apps/web/app/dashboard/layout.tsx` - Provider integration
- `apps/web/types/ventas.ts` - Type definitions

## Support

For questions or issues with this hook, please refer to:

- Task 18.3 in `.kiro/specs/modulo-ventas-completo/tasks.md`
- Requirements 7.5, 7.6, 20.1, 20.3 in `.kiro/specs/modulo-ventas-completo/requirements.md`
