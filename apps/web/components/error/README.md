# Sistema de Manejo de Errores Consistente

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

Este módulo implementa un sistema completo y consistente de manejo de errores para toda la aplicación ERP.

## Componentes

### 1. ErrorBoundary (Global)

**Ubicación:** `components/error/ErrorBoundary.tsx`

Error Boundary global que captura errores de React en toda la aplicación. Ya está integrado en `app/layout.tsx`.

**Características:**
- Captura errores de renderizado de componentes React
- Muestra una interfaz de error amigable y consistente
- Permite reiniciar la aplicación desde el error
- Muestra detalles técnicos solo en desarrollo

**Uso:**
```tsx
import { ErrorBoundary } from '@/components/error'

<ErrorBoundary>
  <TuComponente />
</ErrorBoundary>
```

### 2. useErrorHandler Hook

**Ubicación:** `components/error/useErrorHandler.tsx`

Hook personalizado para manejar errores de manera consistente en componentes.

**Uso básico:**
```tsx
import { useErrorHandler } from '@/components/error'

function MiComponente() {
  const { error, loading, handleError, executeWithErrorHandling, clearError } = useErrorHandler()

  const fetchData = async () => {
    await executeWithErrorHandling(
      async () => {
        const response = await fetch('/api/data')
        if (!response.ok) throw new Error('Error al cargar datos')
        return response.json()
      },
      {
        onSuccess: (data) => {
          console.log('Datos cargados:', data)
        },
        onError: (error) => {
          console.error('Error:', error)
        },
        customErrorMessage: 'No se pudieron cargar los datos'
      }
    )
  }

  return (
    <div>
      {error && <ErrorDisplay error={error} onDismiss={clearError} />}
      {/* Tu contenido */}
    </div>
  )
}
```

### 3. ErrorDisplay Component

**Ubicación:** `components/error/useErrorHandler.tsx`

Componente para mostrar errores de manera consistente en diferentes variantes.

**Variantes disponibles:**
- `inline`: Muestra el error inline con el contenido
- `card`: Muestra el error en una tarjeta (por defecto)
- `banner`: Muestra el error como un banner en la parte superior

**Uso:**
```tsx
import { ErrorDisplay } from '@/components/error'

// Variante card (por defecto)
<ErrorDisplay error={error} onDismiss={() => setError(null)} />

// Variante inline
<ErrorDisplay error={error} variant="inline" />

// Variante banner
<ErrorDisplay error={error} variant="banner" onDismiss={() => setError(null)} />
```

## Ejemplos de Uso

### Ejemplo 1: Manejo de errores en componente con fetch

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useErrorHandler, ErrorDisplay } from '@/components/error'
import { useToast } from '@/components/ui/use-toast'

export default function MiComponente() {
  const { error, loading, executeWithErrorHandling, clearError } = useErrorHandler()
  const { toast } = useToast()
  const [data, setData] = useState(null)

  useEffect(() => {
    executeWithErrorHandling(
      async () => {
        const response = await fetch('/api/data')
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`)
        }
        const result = await response.json()
        return result
      },
      {
        onSuccess: (result) => {
          setData(result)
          toast({
            title: 'Éxito',
            description: 'Datos cargados correctamente',
          })
        },
        onError: (err) => {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: err.message,
          })
        },
      }
    )
  }, [])

  if (loading) {
    return <div className="loading">Cargando...</div>
  }

  return (
    <div>
      {error && <ErrorDisplay error={error} onDismiss={clearError} />}
      {data && <div>{/* Mostrar datos */}</div>}
    </div>
  )
}
```

### Ejemplo 2: Manejo de errores en formulario

```tsx
'use client'

import { useState } from 'react'
import { useErrorHandler, ErrorDisplay } from '@/components/error'

export default function MiFormulario() {
  const { error, executeWithErrorHandling, clearError } = useErrorHandler()
  const [formData, setFormData] = useState({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    await executeWithErrorHandling(
      async () => {
        const response = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Error al guardar')
        }

        return response.json()
      },
      {
        customErrorMessage: 'No se pudo guardar el formulario',
      }
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <ErrorDisplay error={error} variant="inline" onDismiss={clearError} />}
      {/* Campos del formulario */}
      <button type="submit">Guardar</button>
    </form>
  )
}
```

### Ejemplo 3: Manejo manual de errores

```tsx
'use client'

import { useErrorHandler, ErrorDisplay } from '@/components/error'

export default function MiComponente() {
  const { error, handleError, clearError } = useErrorHandler()

  const hacerAlgo = async () => {
    try {
      // Tu código aquí
      throw new Error('Algo salió mal')
    } catch (err) {
      handleError(err, 'Error personalizado: No se pudo completar la operación')
    }
  }

  return (
    <div>
      {error && <ErrorDisplay error={error} onDismiss={clearError} />}
      <button onClick={hacerAlgo}>Ejecutar</button>
    </div>
  )
}
```

## Estilos

El sistema usa CSS inline y clases globales de `globals.css`. Los estilos son consistentes con el resto de la aplicación:

- **Colores de error:** `var(--red-*)` para errores
- **Gradientes:** `var(--gradient-danger)` para elementos de error destacados
- **Sombras:** `var(--shadow-*)` para efectos de profundidad
- **Bordes redondeados:** `var(--border-radius-*)` para consistencia

## Características

✅ **Consistente:** Todos los errores se muestran con el mismo estilo
✅ **Accesible:** Incluye iconos y texto descriptivo
✅ **Desarrollo:** Muestra detalles técnicos solo en modo desarrollo
✅ **Flexible:** Múltiples variantes según el contexto
✅ **Integrado:** Error Boundary global captura errores no manejados
✅ **Type-safe:** Completamente tipado con TypeScript

## Próximos Pasos

1. Reemplazar manejo de errores inconsistentes en componentes existentes
2. Agregar logging de errores a servicio de monitoreo (opcional)
3. Crear variantes adicionales si es necesario
4. Documentar patrones específicos por módulo
