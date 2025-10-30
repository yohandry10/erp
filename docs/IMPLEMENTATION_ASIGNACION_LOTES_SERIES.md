# Implementación: Asignación de Lotes y Series en Recepción

## Descripción
Se implementó la funcionalidad de asignación de lotes, series y fechas de expiración en el wizard de recepción de mercancía.

## Cambios Realizados

### 1. Actualización del Componente RecepcionWizard

**Archivo:** `apps/web/components/compras/RecepcionWizard.tsx`

#### Cambios en la Interfaz RecepcionItem
Se agregaron los siguientes campos opcionales:
```typescript
interface RecepcionItem {
  // ... campos existentes
  lote?: string
  serie?: string
  almacen_id?: string
  ubicacion_id?: string
  fecha_expiracion?: string
}
```

#### Nuevas Funciones de Actualización
Se agregaron funciones para actualizar los nuevos campos:
- `updateItemLote(index: number, lote: string)`
- `updateItemSerie(index: number, serie: string)`
- `updateItemFechaExpiracion(index: number, fecha_expiracion: string)`

#### Nuevo Paso en el Wizard
Se agregó un nuevo paso (Step 3) entre "Calidad" y "Confirmar":

**Pasos del Wizard:**
1. Cantidades - Ingresar cantidades a recibir
2. Calidad - Evaluar calidad (OK/OBSERVADO/RECHAZADO)
3. **Lotes/Series** - Asignar lotes, series y fechas de expiración (NUEVO)
4. Confirmar - Revisar y completar recepción

#### Campos del Paso 3 (Lotes/Series)
Para cada producto a recibir:
- **Número de Lote** (opcional): Campo de texto para ingresar el lote
- **Número de Serie** (opcional): Campo de texto para ingresar la serie
- **Fecha de Expiración** (opcional): Campo de fecha para productos perecederos

#### Actualización del DTO de Creación
Se actualizó el DTO enviado al backend para incluir los nuevos campos:
```typescript
const createDto = {
  orden_id: ordenId,
  items: itemsToReceive.map(item => ({
    detalle_id: item.detalle_id,
    cantidad_recibida: item.cantidad_recibir,
    calidad: item.calidad,
    observaciones: item.observaciones || undefined,
    lote: item.lote || undefined,           // NUEVO
    serie: item.serie || undefined,         // NUEVO
    fecha_expiracion: item.fecha_expiracion || undefined  // NUEVO
  })),
  observaciones: 'Recepción creada desde wizard'
}
```

#### Actualización de la Vista de Confirmación
Se actualizó la tabla de confirmación (Step 4) para mostrar:
- Nueva columna "Lote/Serie"
- Muestra lote, serie y fecha de expiración si están presentes
- Muestra "-" si no hay datos de lote/serie

### 2. Integración con Backend

El backend ya soportaba estos campos en:
- **DTO:** `apps/erp-api/src/modules/compras/dto/create-recepcion.dto.ts`
- **Tabla:** `recepcion_items` en la base de datos (migración 035)

Campos en la tabla `recepcion_items`:
```sql
lote VARCHAR(100),
serie VARCHAR(100),
fecha_expiracion DATE,
almacen_id UUID REFERENCES almacenes(id),
ubicacion_id UUID
```

## Flujo de Usuario

### Paso 3: Asignar Lotes y Series

1. El usuario ve solo los productos que tienen cantidad > 0
2. Para cada producto puede ingresar:
   - **Lote**: Número de lote del proveedor (ej: LOTE-2024-001)
   - **Serie**: Número de serie individual (ej: SN-123456789)
   - **Fecha de Expiración**: Fecha de vencimiento del lote

3. Todos los campos son opcionales
4. Se muestra una nota informativa indicando que los campos son opcionales

### Ejemplo de Uso

```
Producto: Laptop Dell Inspiron 15
Cantidad a recibir: 5

┌─────────────────────────────────────────┐
│ Número de Lote                          │
│ [LOTE-2024-001                       ]  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Número de Serie                         │
│ [SN-123456789                        ]  │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Fecha de Expiración                     │
│ [2025-06-30                          ]  │
└─────────────────────────────────────────┘

ℹ️ Nota: Los campos de lote y serie son opcionales.
   Complete solo si aplica para este producto.
```

## Validaciones

- Los campos son opcionales, no se requiere validación obligatoria
- El formato de fecha se valida automáticamente por el input type="date"
- Los campos de texto aceptan cualquier formato alfanumérico

## Testing

### Script de Prueba
Se creó el script `test-recepcion-lotes-series.ps1` que:
1. Busca una orden de compra APROBADA
2. Crea una recepción con lotes y series aleatorios
3. Cierra la recepción
4. Verifica que los datos se guardaron correctamente

### Ejecución del Test
```powershell
.\test-recepcion-lotes-series.ps1
```

### Casos de Prueba Manual

#### Caso 1: Recepción con Lotes
1. Crear recepción desde una OC
2. Ingresar cantidades (Step 1)
3. Evaluar calidad (Step 2)
4. Asignar lotes a los productos (Step 3)
5. Confirmar y verificar que los lotes se guardaron

#### Caso 2: Recepción con Series
1. Crear recepción desde una OC
2. Ingresar cantidades (Step 1)
3. Evaluar calidad (Step 2)
4. Asignar series a los productos (Step 3)
5. Confirmar y verificar que las series se guardaron

#### Caso 3: Recepción con Fecha de Expiración
1. Crear recepción desde una OC de productos perecederos
2. Ingresar cantidades (Step 1)
3. Evaluar calidad (Step 2)
4. Asignar lote y fecha de expiración (Step 3)
5. Confirmar y verificar que la fecha se guardó

#### Caso 4: Recepción sin Lotes/Series
1. Crear recepción desde una OC
2. Ingresar cantidades (Step 1)
3. Evaluar calidad (Step 2)
4. Dejar campos de lote/serie vacíos (Step 3)
5. Confirmar y verificar que la recepción se crea sin errores

## Beneficios

1. **Trazabilidad**: Permite rastrear productos por lote y serie
2. **Control de Calidad**: Facilita recalls y devoluciones por lote
3. **Gestión de Inventario**: Mejor control de productos con fecha de expiración
4. **Cumplimiento**: Cumple con regulaciones de trazabilidad
5. **Flexibilidad**: Los campos son opcionales, no afecta productos sin lote/serie

## Próximos Pasos

### Mejoras Futuras
1. **Almacén y Ubicación**: Agregar selección de almacén y ubicación en el Step 3
2. **Escaneo de Lotes**: Integrar scanner para leer códigos de lote/serie
3. **Validación de Lotes**: Validar que el lote no esté duplicado
4. **Alertas de Expiración**: Notificar cuando productos estén próximos a vencer
5. **Reportes**: Generar reportes de inventario por lote/serie

### Integración con Inventario
- Los lotes/series se guardan en `recepcion_items`
- Al cerrar la recepción, se crean movimientos de inventario
- Los movimientos incluyen la referencia al lote/serie
- Se puede consultar inventario por lote/serie

## Notas Técnicas

### Compatibilidad
- Compatible con el DTO existente `CreateRecepcionDto`
- No requiere cambios en el backend
- No requiere migración de base de datos (ya existe en migración 035)

### Estilos
- Usa únicamente variables CSS globales de `apps/web/app/globals.css`
- No se crearon archivos CSS adicionales
- Mantiene consistencia visual con el resto del sistema

### Performance
- No impacta el rendimiento del wizard
- Los campos adicionales son opcionales y no requieren validación compleja
- La carga de datos es la misma que antes

## Referencias

- **Migración:** `supabase/migrations/035_compras_completo.sql`
- **DTO:** `apps/erp-api/src/modules/compras/dto/create-recepcion.dto.ts`
- **Componente:** `apps/web/components/compras/RecepcionWizard.tsx`
- **Test:** `test-recepcion-lotes-series.ps1`
