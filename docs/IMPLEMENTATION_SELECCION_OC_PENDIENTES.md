# Implementación: Selección de OC con Pendientes

## Resumen
Implementación de la página de recepciones que permite seleccionar órdenes de compra con items pendientes de recepción.

## Archivos Creados

### 1. `apps/web/app/dashboard/compras/recepciones/page.tsx`
Página principal de recepciones que muestra las órdenes con items pendientes.

**Características:**
- Lista órdenes en estado APROBADA o PARCIAL
- Filtra solo órdenes con items pendientes de recibir
- Muestra estadísticas de órdenes pendientes
- Calcula progreso de recepción por orden
- Cards visuales con información completa
- Navegación al wizard de recepción

**Funcionalidades Implementadas:**
- ✅ Carga de órdenes pendientes desde API
- ✅ Filtrado por estado (APROBADA, PARCIAL)
- ✅ Cálculo de cantidad pendiente por orden
- ✅ Cálculo de porcentaje de recepción
- ✅ Estadísticas en cards superiores
- ✅ Grid responsive de órdenes
- ✅ Navegación a wizard con orden_id
- ✅ Navegación a detalle de orden
- ✅ Indicadores visuales por estado
- ✅ Barra de progreso de recepción

**Lógica de Negocio:**
```typescript
// Filtrar órdenes con items pendientes
const ordenesPendientes = ordenes.filter((orden) => {
  if (!orden.detalles || orden.detalles.length === 0) return false
  return orden.detalles.some(detalle => 
    (detalle.cantidad_recibida || 0) < detalle.cantidad
  )
})

// Calcular cantidad pendiente
const getPendingQuantity = (orden) => {
  return orden.detalles.reduce((total, detalle) => {
    return total + (detalle.cantidad - (detalle.cantidad_recibida || 0))
  }, 0)
}

// Calcular porcentaje recibido
const getReceivedPercentage = (orden) => {
  const totalCantidad = orden.detalles.reduce((sum, d) => sum + d.cantidad, 0)
  const totalRecibida = orden.detalles.reduce((sum, d) => sum + (d.cantidad_recibida || 0), 0)
  return totalCantidad > 0 ? Math.round((totalRecibida / totalCantidad) * 100) : 0
}
```

### 2. `apps/web/app/dashboard/compras/recepciones/nueva/page.tsx`
Página placeholder para el wizard de recepción (a implementar en siguientes tareas).

**Características:**
- Recibe orden_id por query parameter
- Botón de navegación de regreso
- Placeholder para wizard

## Estilos

**Uso de Variables CSS Globales:**
Todos los estilos utilizan las variables definidas en `apps/web/app/globals.css`:
- `--primary-*` para colores base
- `--blue-*` para acciones primarias
- `--emerald-*` / `--amber-*` para estados
- `--shadow-*` para sombras
- Sin archivos CSS adicionales

**Colores por Estado:**
- APROBADA: Verde (#10b981)
- PARCIAL: Ámbar (#f59e0b)

## Integración con Backend

**Endpoint Utilizado:**
```
GET /api/compras/ordenes?estado=APROBADA,PARCIAL&tenant_id={tenant_id}
```

**Respuesta Esperada:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "numero": "OC-2024-001",
      "estado": "APROBADA",
      "fecha_orden": "2024-01-15",
      "fecha_entrega_esperada": "2024-01-30",
      "total": 5000.00,
      "proveedores": {
        "razon_social": "Proveedor ABC",
        "ruc": "20123456789"
      },
      "detalles": [
        {
          "id": "uuid",
          "producto_id": "uuid",
          "cantidad": 100,
          "cantidad_recibida": 50,
          "productos": {
            "nombre": "Producto X",
            "codigo": "PROD-001"
          }
        }
      ]
    }
  ],
  "count": 1
}
```

## Flujo de Usuario

1. Usuario navega a `/dashboard/compras/recepciones`
2. Sistema carga órdenes en estado APROBADA o PARCIAL
3. Sistema filtra solo órdenes con items pendientes
4. Usuario ve cards con información de cada orden:
   - Número de orden y fecha
   - Proveedor
   - Estado (APROBADA/PARCIAL)
   - Progreso de recepción (%)
   - Items pendientes
   - Total de la orden
5. Usuario hace click en "Recepcionar"
6. Sistema navega a `/dashboard/compras/recepciones/nueva?orden_id={id}`

## Estadísticas Mostradas

1. **Órdenes Pendientes**: Total de órdenes con items por recibir
2. **Aprobadas**: Órdenes sin ninguna recepción
3. **Parciales**: Órdenes con recepción parcial

## Validaciones

- ✅ Solo muestra órdenes en estado APROBADA o PARCIAL
- ✅ Solo muestra órdenes con items pendientes (cantidad_recibida < cantidad)
- ✅ Maneja caso de órdenes sin detalles
- ✅ Maneja caso de cantidad_recibida null o undefined

## Testing

**Script de Prueba:** `test-seleccion-oc-pendientes.ps1`

**Casos de Prueba:**
1. Obtener órdenes APROBADAS
2. Obtener órdenes PARCIALES
3. Filtrar órdenes con items pendientes
4. Calcular porcentaje de recepción
5. Calcular cantidad pendiente

**Ejecutar Pruebas:**
```powershell
.\test-seleccion-oc-pendientes.ps1
```

## Próximos Pasos

Las siguientes tareas del wizard de recepción incluirán:
1. Input de cantidades por ítem
2. Asignación de lotes/series/ubicaciones
3. Evaluación de calidad
4. Vista previa y confirmación
5. Cerrar recepción

## Notas Técnicas

- Usa `useApi` hook para llamadas a API
- Usa `useRouter` para navegación
- Usa `useCallback` para optimizar renders
- Componente completamente funcional (no class-based)
- TypeScript con tipos explícitos
- Responsive design con CSS Grid
- Animaciones suaves con CSS transitions
- Estados de carga y error manejados

## Cumplimiento de Requisitos

✅ **Selección de OC con pendientes** - COMPLETADO
- Lista órdenes APROBADAS y PARCIALES
- Filtra solo órdenes con items pendientes
- Muestra información completa de cada orden
- Permite navegación al wizard de recepción
- Estadísticas visuales
- Uso de variables CSS globales
- Sin archivos CSS adicionales
- Responsive y accesible
