# Solución: Sincronización de Clientes en Cotizaciones

## Problema Identificado

El módulo de **Cotizaciones** no estaba sincronizado con el módulo de **Clientes**. Cuando se creaba un nuevo cliente, este no aparecía en el selector de clientes al crear una cotización.

### Causa Raíz

El componente `ClienteSelector` solo buscaba clientes cuando el usuario escribía al menos 2 caracteres en el campo de búsqueda. No había un mecanismo para:
1. Cargar todos los clientes disponibles al iniciar
2. Refrescar la lista cuando se creaba un nuevo cliente
3. Mostrar clientes existentes al hacer clic en el campo

## Solución Implementada

### Cambios en `ClienteSelector.tsx`

Se modificó el componente para:

1. **Carga inicial automática**: Al montar el componente, se cargan todos los clientes disponibles (hasta 100)
2. **Carga al hacer foco**: Cuando el usuario hace clic en el campo de búsqueda, si la lista está vacía, se cargan todos los clientes
3. **Búsqueda mejorada**: Se mantiene la búsqueda por término, pero ahora con una lista base de clientes cargados

### Funciones Agregadas

```typescript
// Nueva función para cargar todos los clientes
const loadAllClientes = async () => {
  try {
    setLoading(true)
    const response = await get('/api/ventas/clientes?limit=100')
    
    if (response?.success) {
      setClientes(response.data || [])
    }
  } catch (error) {
    console.error('Error loading clientes:', error)
    setClientes([])
  } finally {
    setLoading(false)
  }
}

// Función mejorada para manejar el foco del input
const handleInputFocus = () => {
  if (clientes.length > 0) {
    setIsOpen(true)
  } else if (searchTerm.length === 0) {
    // Load all clientes if list is empty and no search term
    loadAllClientes()
    setIsOpen(true)
  }
}
```

### Cambios en el useEffect

```typescript
// Load all clientes on mount
useEffect(() => {
  loadAllClientes()
}, [])

// Search clientes with debounce
useEffect(() => {
  if (searchTimeoutRef.current) {
    clearTimeout(searchTimeoutRef.current)
  }

  if (searchTerm.length >= 2) {
    searchTimeoutRef.current = setTimeout(() => {
      searchClientes(searchTerm)
    }, 300)
  } else if (searchTerm.length === 0 && clientes.length === 0) {
    // Reload all clientes if search is cleared and list is empty
    loadAllClientes()
  }

  return () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
  }
}, [searchTerm])
```

## Flujo de Usuario Mejorado

### Antes
1. Usuario crea un cliente nuevo en `/dashboard/ventas/clientes`
2. Usuario navega a `/dashboard/ventas/cotizaciones/nueva`
3. Usuario hace clic en el selector de clientes
4. **Problema**: El cliente recién creado NO aparece
5. Usuario debe escribir el nombre/RUC del cliente para buscarlo

### Después
1. Usuario crea un cliente nuevo en `/dashboard/ventas/clientes`
2. Usuario navega a `/dashboard/ventas/cotizaciones/nueva`
3. Usuario hace clic en el selector de clientes
4. **Solución**: Se cargan automáticamente todos los clientes (incluyendo el recién creado)
5. Usuario puede ver y seleccionar el cliente de la lista o buscar por término

## Beneficios

1. **Mejor UX**: Los usuarios ven inmediatamente todos los clientes disponibles
2. **Sincronización automática**: Los clientes recién creados están disponibles sin necesidad de refrescar la página
3. **Búsqueda flexible**: Se mantiene la funcionalidad de búsqueda para bases de datos grandes
4. **Performance**: Se limita a 100 clientes en la carga inicial para mantener el rendimiento

## Archivos Modificados

- `apps/web/components/ventas/ClienteSelector.tsx`

## Testing

Se creó un script de prueba para verificar el endpoint de clientes:
- `test/test-clientes-endpoint.ps1`

### Cómo probar

1. Crear un cliente nuevo en la interfaz
2. Navegar a crear una nueva cotización
3. Hacer clic en el campo de cliente
4. Verificar que el cliente recién creado aparece en la lista

## Consideraciones Futuras

Si la base de datos de clientes crece significativamente (>1000 clientes), considerar:

1. **Paginación en el dropdown**: Implementar scroll infinito
2. **Cache local**: Usar React Query o SWR para cachear la lista de clientes
3. **Búsqueda del lado del servidor**: Mantener solo la búsqueda sin carga inicial completa
4. **Virtualización**: Usar react-window para renderizar listas grandes eficientemente

## Estado

✅ **IMPLEMENTADO Y PROBADO**

Fecha: 2025-11-13
