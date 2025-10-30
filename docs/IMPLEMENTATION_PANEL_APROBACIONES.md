# Implementación: Panel de Aprobaciones

## Resumen

Se implementó el Panel de Aprobaciones para visualizar el estado de las aprobaciones de órdenes de compra en la página de detalle de orden. Este panel muestra información detallada sobre quién debe aprobar, quién ya aprobó, y el progreso general del proceso de aprobación.

## Archivos Creados

### Backend

1. **Endpoint en Controller** (`apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`)
   - Agregado: `GET /api/compras/ordenes/:id/aprobaciones`
   - Retorna todas las aprobaciones asociadas a una orden de compra

2. **Método en Service** (`apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`)
   - Agregado: `findAprobacionesByOrdenId(id: string, tenantId: string)`
   - Obtiene las aprobaciones desde el repositorio `OcAprobacionesRepository`

### Frontend

1. **Componente AprobacionesPanel** (`apps/web/components/compras/AprobacionesPanel.tsx`)
   - Componente React que muestra el panel de aprobaciones
   - Características:
     - Carga automática de aprobaciones al montar
     - Estadísticas resumidas (pendientes, aprobadas, rechazadas)
     - Barra de progreso visual
     - Lista detallada de cada aprobación con:
       - Nombre del aprobador
       - Estado (PENDIENTE, APROBADA, RECHAZADA)
       - Fecha de aprobación
       - Comentarios
     - Manejo de estados de carga y error
     - Se oculta automáticamente si no hay aprobaciones

2. **Integración en Página de Detalle** (`apps/web/app/dashboard/compras/ordenes/[id]/page.tsx`)
   - Importado y agregado el componente `AprobacionesPanel`
   - Se muestra solo cuando el estado de la orden es:
     - `APROBACION` (en proceso de aprobación)
     - `APROBADA` (ya aprobada, para ver historial)
     - `ANULADA` (rechazada, para ver quién rechazó)

## Estructura de Datos

### Interfaz Aprobacion

```typescript
interface Aprobacion {
  id: string
  orden_id: string
  nivel: number
  aprobador_id: string
  aprobador_nombre: string
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  fecha_aprobacion?: string
  comentarios?: string
  created_at: string
}
```

## Flujo de Funcionamiento

### 1. Carga de Aprobaciones

```typescript
// Al montar el componente o cuando cambia el ordenId
const loadAprobaciones = async () => {
  const response = await get(`/api/compras/ordenes/${ordenId}/aprobaciones`)
  if (response?.success) {
    setAprobaciones(response.data)
  }
}
```

### 2. Visualización del Panel

El panel se divide en tres secciones principales:

#### a) Estadísticas Resumidas
- Muestra tres cards con contadores:
  - Pendientes (color ámbar)
  - Aprobadas (color verde)
  - Rechazadas (color rojo)

#### b) Barra de Progreso
- Calcula el porcentaje de aprobaciones completadas
- Color verde si todas están aprobadas
- Color rojo si hay alguna rechazada

#### c) Lista de Aprobaciones
- Card individual para cada aprobación con:
  - Avatar del aprobador
  - Nombre y nivel
  - Badge de estado con color e icono
  - Fecha de aprobación (si aplica)
  - Comentarios (si existen)

### 3. Estados Visuales

```typescript
const ESTADO_CONFIG = {
  PENDIENTE: {
    label: 'Pendiente',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: Clock
  },
  APROBADA: {
    label: 'Aprobada',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  RECHAZADA: {
    label: 'Rechazada',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}
```

## Estilos

El componente utiliza **únicamente variables CSS globales** definidas en `apps/web/app/globals.css`:

- `--primary-*`: Colores principales (grises)
- `--blue-*`: Colores azules para elementos de información
- `--emerald-*`: Colores verdes para estados aprobados
- `--amber-*`: Colores ámbar para estados pendientes
- `--red-*`: Colores rojos para estados rechazados

**No se crearon archivos CSS adicionales**, siguiendo las directrices del proyecto.

## Casos de Uso

### Caso 1: Orden en Proceso de Aprobación

```
Estado: APROBACION
Aprobaciones:
  - Usuario A: PENDIENTE
  - Usuario B: PENDIENTE
  - Usuario C: APROBADA

Panel muestra:
  - 2 pendientes, 1 aprobada, 0 rechazadas
  - Progreso: 33%
  - Lista con los 3 aprobadores y sus estados
```

### Caso 2: Orden Completamente Aprobada

```
Estado: APROBADA
Aprobaciones:
  - Usuario A: APROBADA (con fecha y comentarios)
  - Usuario B: APROBADA (con fecha y comentarios)

Panel muestra:
  - 0 pendientes, 2 aprobadas, 0 rechazadas
  - Progreso: 100%
  - Historial completo de aprobaciones
```

### Caso 3: Orden Rechazada

```
Estado: ANULADA
Aprobaciones:
  - Usuario A: RECHAZADA (con fecha y motivo)

Panel muestra:
  - 0 pendientes, 0 aprobadas, 1 rechazada
  - Progreso: 0% (barra roja)
  - Detalle del rechazo con comentarios
```

### Caso 4: Orden sin Aprobaciones

```
Estado: BORRADOR o APROBADA (sin requerir aprobación)
Aprobaciones: []

Panel: No se muestra (se oculta automáticamente)
```

## API Endpoint

### GET /api/compras/ordenes/:id/aprobaciones

**Descripción:** Obtiene todas las aprobaciones asociadas a una orden de compra

**Parámetros:**
- `id` (path): ID de la orden de compra
- `tenant_id` (query, opcional): ID del tenant

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "orden_id": "uuid",
      "nivel": 1,
      "aprobador_id": "uuid",
      "aprobador_nombre": "Juan Pérez",
      "estado": "APROBADA",
      "fecha_aprobacion": "2024-01-15T10:30:00Z",
      "comentarios": "Aprobado según presupuesto",
      "created_at": "2024-01-15T09:00:00Z"
    }
  ],
  "count": 1
}
```

**Respuesta de Error:**
```json
{
  "success": false,
  "error": "Orden de compra con ID xxx no encontrada",
  "data": [],
  "count": 0
}
```

## Testing

### Script de Prueba

Se creó el archivo `test-aprobaciones-panel.ps1` que:

1. Crea una orden de compra en estado APROBACION
2. Obtiene las aprobaciones iniciales
3. Aprueba la orden
4. Verifica las aprobaciones actualizadas
5. Muestra un resumen con estadísticas

### Ejecución del Test

```powershell
.\test-aprobaciones-panel.ps1
```

### Verificación Manual

1. Ejecutar el script de prueba
2. Copiar el ID de la orden generada
3. Abrir el navegador en `http://localhost:3000`
4. Navegar a `/dashboard/compras/ordenes/{orden_id}`
5. Verificar que el panel de aprobaciones aparece en la columna derecha
6. Verificar que muestra:
   - Estadísticas correctas
   - Barra de progreso
   - Lista de aprobadores con estados

## Mejoras Futuras

1. **Acciones Inline**: Agregar botones para aprobar/rechazar directamente desde el panel
2. **Notificaciones en Tiempo Real**: Actualizar el panel automáticamente cuando cambia el estado
3. **Filtros**: Permitir filtrar aprobaciones por estado
4. **Historial Completo**: Mostrar todas las acciones (creación, modificación, etc.)
5. **Multi-nivel**: Soporte visual para múltiples niveles de aprobación
6. **Exportar**: Opción para descargar el historial de aprobaciones en PDF

## Dependencias

- **Backend:**
  - `OcAprobacionesRepository`: Para acceder a la tabla `oc_aprobaciones`
  - `OrdenesCompraRepository`: Para validar que la orden existe

- **Frontend:**
  - `useApi` hook: Para realizar peticiones HTTP
  - `lucide-react`: Para iconos
  - Variables CSS globales: Para estilos consistentes

## Notas Importantes

1. El panel se oculta automáticamente si no hay aprobaciones y la orden no está en estado APROBACION
2. Los estilos usan únicamente variables CSS globales (sin archivos CSS adicionales)
3. El componente maneja estados de carga y error de forma elegante
4. La barra de progreso cambia de color si hay rechazos (rojo) vs aprobaciones (verde)
5. El endpoint valida que la orden existe antes de retornar las aprobaciones

## Conclusión

El Panel de Aprobaciones está completamente implementado y funcional. Proporciona una visualización clara y profesional del estado de aprobación de las órdenes de compra, mejorando significativamente la experiencia del usuario al gestionar el flujo de aprobaciones.
