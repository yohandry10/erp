# Aprobación de Órdenes de Compra por Monto

## Descripción

El sistema evalúa automáticamente si una orden de compra requiere aprobación basándose en el monto total de la orden y un umbral configurado por tenant en la tabla `empresa_config`.

## Configuración

### Campo en Base de Datos

**Tabla:** `empresa_config`  
**Campo:** `monto_aprobacion_compras`  
**Tipo:** `NUMERIC(12,2)`  
**Default:** `0`  
**Descripción:** Monto mínimo (en moneda local) que requiere aprobación para órdenes de compra.

### Comportamiento

- **Si `monto_aprobacion_compras` = 0 o NULL:** No se requiere aprobación automática. Las órdenes se crean en estado `BORRADOR` o `PENDIENTE`.
- **Si `total_orden > monto_aprobacion_compras`:** La orden se crea automáticamente en estado `APROBACION` y requiere aprobación antes de poder procesarse.
- **Si `total_orden <= monto_aprobacion_compras`:** La orden se crea en el estado especificado por el usuario o en `BORRADOR` por defecto.

## Flujo de Aprobación

```
┌─────────────────────────────────────────────────────────────┐
│ Usuario crea Orden de Compra                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Sistema calcula total (subtotal + IGV 18%)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Sistema consulta monto_aprobacion_compras del tenant        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
              ┌──────┴──────┐
              │             │
    ┌─────────▼─────┐  ┌────▼──────────┐
    │ total >       │  │ total <=      │
    │ umbral        │  │ umbral        │
    └─────────┬─────┘  └────┬──────────┘
              │             │
              ▼             ▼
    ┌─────────────────┐  ┌──────────────┐
    │ Estado:         │  │ Estado:      │
    │ APROBACION      │  │ BORRADOR o   │
    │                 │  │ PENDIENTE    │
    └─────────────────┘  └──────────────┘
```

## Ejemplo de Configuración

### Configurar umbral de aprobación en 10,000 PEN

```sql
UPDATE empresa_config
SET monto_aprobacion_compras = 10000.00
WHERE tenant_id = 'tu-tenant-id';
```

### Resultado

- **OC con total de 8,000 PEN:** Se crea en estado `BORRADOR` (no requiere aprobación)
- **OC con total de 15,000 PEN:** Se crea en estado `APROBACION` (requiere aprobación)

## API

### Crear Orden de Compra

**Endpoint:** `POST /api/compras/ordenes`

**Request Body:**
```json
{
  "numero": "OC-2024-001",
  "proveedor_id": "uuid-proveedor",
  "fecha_orden": "2024-10-25",
  "fecha_entrega_esperada": "2024-11-25",
  "condiciones_pago": "CREDITO_30",
  "dias_credito": 30,
  "detalles": [
    {
      "producto_id": "uuid-producto",
      "descripcion": "Producto A",
      "cantidad": 10,
      "precio_unitario": 1500.00
    }
  ]
}
```

**Response (monto bajo):**
```json
{
  "id": "uuid-orden",
  "numero": "OC-2024-001",
  "estado": "BORRADOR",
  "subtotal": 15000.00,
  "igv": 2700.00,
  "total": 17700.00,
  ...
}
```

**Response (monto alto que requiere aprobación):**
```json
{
  "id": "uuid-orden",
  "numero": "OC-2024-001",
  "estado": "APROBACION",
  "subtotal": 15000.00,
  "igv": 2700.00,
  "total": 17700.00,
  ...
}
```

## Implementación Técnica

### Servicio: OrdenesCompraService

**Método:** `evaluarRequiereAprobacion(total: number, tenantId: string): Promise<boolean>`

Este método privado:
1. Consulta el campo `monto_aprobacion_compras` de `empresa_config` para el tenant
2. Compara el total de la orden con el umbral configurado
3. Retorna `true` si requiere aprobación, `false` en caso contrario
4. En caso de error o configuración no encontrada, retorna `false` (no bloquea el flujo)

### Integración en el Flujo de Creación

El método `create` del servicio:
1. Valida los datos de entrada
2. Calcula el total de la orden (subtotal + IGV)
3. Llama a `evaluarRequiereAprobacion` para determinar si requiere aprobación
4. Si requiere aprobación y no se especificó un estado, establece `estado = 'APROBACION'`
5. Crea la orden con el estado determinado

## Migración

**Archivo:** `supabase/migrations/036_add_monto_aprobacion_compras.sql`

Esta migración:
- Agrega el campo `monto_aprobacion_compras` a la tabla `empresa_config`
- Establece un valor por defecto de `0` (no requiere aprobación)
- Agrega un constraint para asegurar que el valor sea >= 0
- Crea un índice para optimizar consultas
- Incluye comentarios descriptivos

## Testing

### Script de Prueba

**Archivo:** `test-aprobacion-por-monto.ps1`

Este script prueba:
1. Creación de OC con monto bajo (no requiere aprobación)
2. Creación de OC con monto alto (requiere aprobación)
3. Verifica que los estados sean correctos según el umbral configurado

### Ejecutar Tests

```powershell
# Asegúrate de que el servidor esté corriendo
npm run dev

# En otra terminal, ejecuta el script de prueba
.\test-aprobacion-por-monto.ps1
```

## Consideraciones

1. **Seguridad:** El umbral se consulta por tenant, asegurando aislamiento multi-tenant
2. **Flexibilidad:** Cada tenant puede configurar su propio umbral de aprobación
3. **Tolerancia a Fallos:** Si hay error al consultar la configuración, no se bloquea la creación de la orden
4. **Auditoría:** El estado `APROBACION` queda registrado en la orden para trazabilidad
5. **Extensibilidad:** El diseño permite agregar múltiples niveles de aprobación en el futuro

## Próximos Pasos

- [ ] Implementar flujo de aprobaciones multi-nivel (tabla `oc_aprobaciones`)
- [ ] Crear notificaciones automáticas a aprobadores
- [ ] Agregar dashboard de órdenes pendientes de aprobación
- [ ] Implementar historial de aprobaciones/rechazos
- [ ] Agregar configuración de aprobadores por nivel de monto
