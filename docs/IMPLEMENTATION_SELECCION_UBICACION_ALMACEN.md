# Implementación: Selección de Ubicación por Almacén

## Resumen

Se implementó la funcionalidad de selección de almacén y ubicación en el wizard de recepción de mercancía, permitiendo a los usuarios especificar dónde se almacenará cada producto recibido.

## Cambios Realizados

### 1. Backend - API Endpoints

**Archivo:** `apps/erp-api/src/modules/inventario/inventario.controller.ts`

#### Nuevos Endpoints:

1. **GET /api/inventario/almacenes**
   - Lista todos los almacenes activos del tenant
   - Ordenados por principal primero, luego por nombre
   - Retorna: `{ success: boolean, data: Almacen[] }`

2. **GET /api/inventario/almacenes/:almacenId/ubicaciones**
   - Lista todas las ubicaciones de un almacén específico
   - Filtrado por tenant y almacén
   - Ordenadas por código
   - Retorna: `{ success: boolean, data: Ubicacion[] }`

#### Integración:
- Se inyectó `AlmacenesService` en el controlador
- Se reutilizó el servicio existente de almacenes
- Se consultó directamente la tabla `almacen_ubicaciones` para ubicaciones

### 2. Frontend - RecepcionWizard

**Archivo:** `apps/web/components/compras/RecepcionWizard.tsx`

#### Nuevas Interfaces:

```typescript
interface Almacen {
  id: string
  nombre: string
  codigo: string
  es_principal: boolean
}

interface Ubicacion {
  id: string
  codigo: string
  descripcion?: string
  tipo?: string
}
```

#### Nuevo Estado:

```typescript
const [almacenes, setAlmacenes] = useState<Almacen[]>([])
const [ubicacionesPorAlmacen, setUbicacionesPorAlmacen] = useState<Record<string, Ubicacion[]>>({})
```

#### Nuevas Funciones:

1. **loadAlmacenes()**
   - Carga la lista de almacenes al iniciar el wizard
   - Se ejecuta en el `useEffect` inicial

2. **loadUbicaciones(almacenId: string)**
   - Carga las ubicaciones de un almacén específico
   - Implementa caché para evitar cargas duplicadas
   - Se ejecuta cuando el usuario selecciona un almacén

3. **updateItemAlmacen(index: number, almacen_id: string)**
   - Actualiza el almacén seleccionado para un item
   - Resetea la ubicación cuando cambia el almacén
   - Carga automáticamente las ubicaciones del nuevo almacén

4. **updateItemUbicacion(index: number, ubicacion_id: string)**
   - Actualiza la ubicación seleccionada para un item

#### Cambios en Step 3:

**Antes:**
- Solo mostraba campos de lote, serie y fecha de expiración

**Después:**
- **Primera sección:** Almacén (obligatorio) y Ubicación (opcional)
  - Dropdown de almacenes con nombre y código
  - Dropdown de ubicaciones (habilitado solo si hay almacén seleccionado)
  - Carga dinámica de ubicaciones al seleccionar almacén
  
- **Segunda sección:** Lote, Serie y Fecha de Expiración (opcionales)

#### Validaciones Agregadas:

1. **En handleNext() - Step 3:**
   ```typescript
   const itemsToReceive = items.filter(item => item.cantidad_recibir > 0)
   const itemsWithoutAlmacen = itemsToReceive.filter(item => !item.almacen_id)
   
   if (itemsWithoutAlmacen.length > 0) {
     alert('Debe seleccionar un almacén para todos los productos a recepcionar')
     return
   }
   ```

2. **En handleSubmit():**
   - Se incluyen `almacen_id` y `ubicacion_id` en el DTO de creación
   - El almacén es obligatorio, la ubicación es opcional

#### Cambios en Step 4 (Confirmación):

- La tabla de confirmación ahora muestra:
  - **Almacén:** Nombre del almacén seleccionado
  - **Ubicación:** Código de la ubicación (si fue seleccionada)
  - **Lote, Serie, Fecha de Expiración:** Como antes

- Header de columna actualizado: "Almacén/Ubicación/Lote"

#### Cambios en UI:

1. **Progress Steps:**
   - Label actualizado: "Lotes/Series" → "Almacén/Lotes"

2. **Step 3 Title:**
   - "Asignar Lotes y Series" → "Asignar Almacén, Ubicación, Lotes y Series"

3. **Info Note:**
   - Actualizado para indicar que el almacén es obligatorio

## Flujo de Usuario

### Paso 3 del Wizard:

1. **Seleccionar Almacén (Obligatorio):**
   - Usuario ve dropdown con todos los almacenes activos
   - Formato: "Nombre del Almacén (CÓDIGO)"
   - Al seleccionar, se cargan automáticamente las ubicaciones

2. **Seleccionar Ubicación (Opcional):**
   - Dropdown habilitado solo si hay almacén seleccionado
   - Muestra ubicaciones del almacén seleccionado
   - Formato: "CÓDIGO - Descripción"
   - Opción por defecto: "Sin ubicación específica"

3. **Completar Lote/Serie/Expiración (Opcional):**
   - Campos adicionales como antes
   - No son obligatorios

4. **Validación al Avanzar:**
   - Sistema valida que todos los items tengan almacén
   - Muestra alerta si falta algún almacén
   - No permite avanzar hasta completar

### Paso 4 - Confirmación:

- Muestra resumen completo incluyendo:
  - Almacén asignado a cada producto
  - Ubicación (si fue seleccionada)
  - Lote, serie, fecha de expiración

## Estructura de Datos

### DTO de Creación de Recepción:

```typescript
{
  orden_id: string,
  items: [
    {
      detalle_id: string,
      cantidad_recibida: number,
      calidad: 'OK' | 'OBSERVADO' | 'RECHAZADO',
      observaciones?: string,
      lote?: string,
      serie?: string,
      almacen_id: string,           // ✅ NUEVO - Obligatorio
      ubicacion_id?: string,         // ✅ NUEVO - Opcional
      fecha_expiracion?: string
    }
  ],
  observaciones: string
}
```

## Base de Datos

### Tablas Utilizadas:

1. **almacenes**
   - Campos: id, tenant_id, nombre, codigo, es_principal, activo
   - RLS habilitado por tenant
   - Índice único: (tenant_id, codigo)

2. **almacen_ubicaciones**
   - Campos: id, tenant_id, almacen_id, codigo, descripcion, tipo
   - RLS habilitado por tenant
   - FK a almacenes con CASCADE
   - Índice único: (almacen_id, codigo)

3. **recepcion_items**
   - Campos existentes: almacen_id, ubicacion_id
   - FK a almacenes con RESTRICT
   - FK a almacen_ubicaciones (sin constraint explícito)

## Testing

### Script de Prueba:

**Archivo:** `test-almacenes-ubicaciones.ps1`

Prueba:
1. GET /api/inventario/almacenes
2. GET /api/inventario/almacenes/:id/ubicaciones
3. Validación de respuestas
4. Manejo de casos sin datos

### Casos de Prueba:

1. **Sin almacenes configurados:**
   - API retorna array vacío
   - Frontend muestra dropdown vacío
   - Usuario no puede avanzar en el wizard

2. **Con almacenes pero sin ubicaciones:**
   - API retorna almacenes correctamente
   - Dropdown de ubicaciones muestra solo "Sin ubicación específica"
   - Usuario puede avanzar sin seleccionar ubicación

3. **Con almacenes y ubicaciones:**
   - Ambos dropdowns funcionan correctamente
   - Carga dinámica de ubicaciones funciona
   - Validación de almacén obligatorio funciona

## Requisitos Previos

### Datos Mínimos Necesarios:

Para que la funcionalidad sea útil, debe existir al menos un almacén:

```sql
INSERT INTO almacenes (tenant_id, nombre, codigo, es_principal, activo)
VALUES ('tenant-id-aqui', 'Almacén Principal', 'ALM-01', true, true);
```

Opcionalmente, ubicaciones:

```sql
INSERT INTO almacen_ubicaciones (tenant_id, almacen_id, codigo, descripcion, tipo)
VALUES 
  ('tenant-id-aqui', 'almacen-id-aqui', 'A-01', 'Pasillo A - Estante 1', 'GENERAL'),
  ('tenant-id-aqui', 'almacen-id-aqui', 'A-02', 'Pasillo A - Estante 2', 'GENERAL');
```

## Integración con Backend Existente

### Servicio de Recepciones:

El backend ya soporta `almacen_id` y `ubicacion_id` en:
- DTO de creación de recepción
- Tabla `recepcion_items`
- Lógica de cierre de recepción

**No se requieren cambios adicionales en el backend de recepciones.**

### Servicio de Inventario:

Al cerrar la recepción, el sistema:
1. Crea movimientos de inventario con almacen_id
2. Actualiza producto_existencias por almacén/ubicación/lote
3. Mantiene trazabilidad completa

## Beneficios

1. **Trazabilidad Completa:**
   - Se sabe exactamente dónde está cada producto
   - Facilita la gestión de inventario multialmacén

2. **Validación Temprana:**
   - Usuario debe especificar almacén antes de completar
   - Evita recepciones sin ubicación definida

3. **UX Mejorada:**
   - Carga dinámica de ubicaciones
   - Validaciones claras
   - Feedback visual inmediato

4. **Flexibilidad:**
   - Ubicación es opcional (para almacenes simples)
   - Soporta múltiples almacenes
   - Compatible con configuración existente

## Notas Técnicas

### Caché de Ubicaciones:

Se implementó un caché simple en el estado del componente:
- Evita cargas duplicadas de ubicaciones
- Mejora performance
- Se limpia al desmontar el componente

### Manejo de Errores:

- Errores en carga de almacenes: Se muestra array vacío
- Errores en carga de ubicaciones: Se muestra array vacío
- Validación de almacén: Alert al usuario antes de avanzar

### Compatibilidad:

- Compatible con recepciones existentes sin almacén
- No rompe funcionalidad anterior
- Migración gradual posible

## Estado de la Tarea

✅ **COMPLETADO**

- [x] Endpoints de API implementados
- [x] Frontend actualizado con selección de almacén
- [x] Frontend actualizado con selección de ubicación
- [x] Validaciones implementadas
- [x] Integración con DTO de recepción
- [x] Actualización de vista de confirmación
- [x] Script de prueba creado
- [x] Documentación completa

## Próximos Pasos Sugeridos

1. **Testing E2E:**
   - Probar flujo completo con datos reales
   - Verificar integración con cierre de recepción
   - Validar actualización de inventario

2. **Mejoras Futuras:**
   - Autoselección de almacén principal si solo hay uno
   - Sugerencia de ubicación basada en producto
   - Validación de capacidad de ubicación
   - Escaneo de código de ubicación

3. **Configuración:**
   - Permitir configurar si ubicación es obligatoria
   - Configurar almacén por defecto por usuario
   - Reglas de asignación automática
