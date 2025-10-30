# Idempotencia en Pagos en Lote

## Descripción

La funcionalidad de pagos en lote ahora incluye soporte de idempotencia para prevenir el procesamiento duplicado de lotes de pagos cuando se reintenta una solicitud.

## Problema Resuelto

Sin idempotencia, si un cliente reintenta una solicitud de pago en lote (por ejemplo, debido a un timeout de red o error temporal), el sistema podría:
- Procesar los pagos dos veces
- Duplicar los movimientos bancarios
- Reducir incorrectamente el saldo de la cuenta bancaria
- Marcar las CxP como sobre-pagadas

## Solución Implementada

### 1. Tabla `pagos_lote`

Se creó una nueva tabla para rastrear los lotes de pagos procesados:

```sql
CREATE TABLE pagos_lote (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  referencia_lote TEXT NOT NULL,
  cuenta_bancaria_id UUID NOT NULL,
  fecha_pago DATE NOT NULL,
  metodo_pago TEXT NOT NULL,
  observaciones TEXT,
  monto_total NUMERIC(15, 2) NOT NULL,
  total_pagos INTEGER NOT NULL,
  pagos_exitosos INTEGER NOT NULL,
  pagos_fallidos INTEGER NOT NULL,
  resultado JSONB NOT NULL,
  estado TEXT NOT NULL DEFAULT 'COMPLETADO',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_lote_por_tenant UNIQUE (tenant_id, referencia_lote)
);
```

**Características clave:**
- `referencia_lote`: Identificador único del lote proporcionado por el cliente
- `resultado`: Almacena el resultado completo del procesamiento en formato JSON
- `UNIQUE (tenant_id, referencia_lote)`: Garantiza que no se pueda procesar el mismo lote dos veces

### 2. Función `procesar_pago_lote` Actualizada

La función ahora incluye verificación de idempotencia al inicio:

```sql
-- Check for idempotency
SELECT id, resultado, estado, monto_total, total_pagos, pagos_exitosos, pagos_fallidos
INTO v_lote_existente
FROM pagos_lote
WHERE tenant_id = p_tenant_id
  AND referencia_lote = p_referencia_lote;

IF FOUND THEN
  -- Batch already processed, return the existing result
  RETURN jsonb_build_object(
    'success', true,
    'idempotent', true,
    'lote_id', v_lote_existente.id,
    'referencia_lote', p_referencia_lote,
    'estado', v_lote_existente.estado,
    'monto_total', v_lote_existente.monto_total,
    'total_pagos', v_lote_existente.total_pagos,
    'pagos_exitosos', v_lote_existente.pagos_exitosos,
    'pagos_fallidos', v_lote_existente.pagos_fallidos,
    'resultado_original', v_lote_existente.resultado,
    'mensaje', 'Este lote ya fue procesado anteriormente'
  );
END IF;
```

**Flujo de procesamiento:**

1. **Verificación inicial**: Busca si ya existe un lote con la misma `referencia_lote`
2. **Si existe**: Retorna el resultado almacenado sin reprocesar
3. **Si no existe**: Procesa el lote normalmente
4. **Al finalizar**: Almacena el resultado en `pagos_lote` para futuras verificaciones

## Uso

### Desde el Backend (TypeScript)

```typescript
const resultado = await tesoreriaService.registrarPagoLote(
  tenantId,
  {
    cuenta_bancaria_id: 'uuid-cuenta',
    fecha_pago: '2025-01-15',
    metodo_pago: 'TRANSFERENCIA',
    referencia_lote: 'LOTE-2025-001', // ← Identificador único
    observaciones: 'Pago quincenal proveedores',
    pagos: [
      { cxp_id: 'uuid-cxp-1', monto: 1000.00 },
      { cxp_id: 'uuid-cxp-2', monto: 2000.00 }
    ]
  },
  userId
);

// Verificar si fue idempotente
if (resultado.data.idempotent) {
  console.log('Este lote ya fue procesado anteriormente');
  console.log('Resultado original:', resultado.data.resultado_original);
}
```

### Desde el API REST

```bash
POST /api/finanzas/tesoreria/lote
Content-Type: application/json
Authorization: Bearer <token>
x-tenant-id: <tenant-id>

{
  "cuenta_bancaria_id": "uuid-cuenta",
  "fecha_pago": "2025-01-15",
  "metodo_pago": "TRANSFERENCIA",
  "referencia_lote": "LOTE-2025-001",
  "observaciones": "Pago quincenal proveedores",
  "pagos": [
    { "cxp_id": "uuid-cxp-1", "monto": 1000.00 },
    { "cxp_id": "uuid-cxp-2", "monto": 2000.00 }
  ]
}
```

**Respuesta (primera vez):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "idempotent": false,
    "lote_id": "uuid-lote",
    "monto_total": 3000.00,
    "total_pagos": 2,
    "pagos_exitosos": 2,
    "pagos_fallidos": 0,
    "cuenta_bancaria": { ... },
    "pagos": [ ... ]
  }
}
```

**Respuesta (reintento con misma referencia):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "idempotent": true,
    "lote_id": "uuid-lote",
    "referencia_lote": "LOTE-2025-001",
    "estado": "COMPLETADO",
    "monto_total": 3000.00,
    "total_pagos": 2,
    "pagos_exitosos": 2,
    "pagos_fallidos": 0,
    "resultado_original": { ... },
    "mensaje": "Este lote ya fue procesado anteriormente"
  }
}
```

## Generación de Referencias Únicas

### Recomendaciones

1. **Incluir timestamp**: `LOTE-${Date.now()}`
2. **Incluir identificador de proceso**: `LOTE-${processId}-${timestamp}`
3. **Usar UUID**: `LOTE-${uuidv4()}`
4. **Formato empresarial**: `LOTE-YYYYMMDD-NNN` (con contador secuencial)

### Ejemplo de Generación

```typescript
// Opción 1: Timestamp
const loteId = `LOTE-${new Date().getTime()}`;

// Opción 2: UUID
import { v4 as uuidv4 } from 'uuid';
const loteId = `LOTE-${uuidv4()}`;

// Opción 3: Fecha + Secuencial (requiere contador en BD)
const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
const secuencial = await obtenerSiguienteSecuencial(tenantId, fecha);
const loteId = `LOTE-${fecha}-${secuencial.toString().padStart(3, '0')}`;
```

## Testing

### Test SQL Directo

Ejecutar el script de prueba:

```bash
psql -h localhost -U postgres -d erp_db -f test-idempotencia-pago-lote.sql
```

### Test API (PowerShell)

```bash
.\test-idempotencia-pago-lote.ps1
```

### Verificación Manual

```sql
-- Ver lotes procesados
SELECT 
  referencia_lote,
  fecha_pago,
  monto_total,
  total_pagos,
  pagos_exitosos,
  estado,
  created_at
FROM pagos_lote
WHERE tenant_id = 'your-tenant-id'
ORDER BY created_at DESC;

-- Ver si un lote específico ya fue procesado
SELECT EXISTS (
  SELECT 1 
  FROM pagos_lote 
  WHERE tenant_id = 'your-tenant-id' 
    AND referencia_lote = 'LOTE-2025-001'
);
```

## Consideraciones

### Ventajas

✅ **Seguridad**: Previene pagos duplicados por reintentos
✅ **Consistencia**: Garantiza que el mismo lote siempre retorna el mismo resultado
✅ **Auditoría**: Mantiene registro de todos los lotes procesados
✅ **Performance**: Verificación rápida por índice único

### Limitaciones

⚠️ **Responsabilidad del cliente**: El cliente debe generar referencias únicas
⚠️ **No detecta cambios**: Si se reintenta con la misma referencia pero diferentes datos, retorna el resultado original
⚠️ **Almacenamiento**: Cada lote procesado se almacena permanentemente (considerar limpieza periódica)

### Limpieza de Datos Antiguos

Para evitar crecimiento indefinido de la tabla `pagos_lote`, considerar:

```sql
-- Eliminar lotes procesados hace más de 1 año
DELETE FROM pagos_lote
WHERE created_at < NOW() - INTERVAL '1 year'
  AND estado = 'COMPLETADO';
```

## Migración

La migración `037_add_idempotency_pago_lote.sql` incluye:

1. Creación de tabla `pagos_lote`
2. Índices para búsqueda rápida
3. Políticas RLS para aislamiento multi-tenant
4. Actualización de función `procesar_pago_lote`

Para aplicar:

```bash
# Desarrollo local
psql -h localhost -U postgres -d erp_db -f supabase/migrations/037_add_idempotency_pago_lote.sql

# Producción (Supabase)
# La migración se aplicará automáticamente en el próximo deploy
```

## Monitoreo

### Métricas Recomendadas

- **Tasa de idempotencia**: % de requests que fueron idempotentes
- **Lotes procesados por día**: Tendencia de uso
- **Lotes fallidos**: Identificar problemas

### Query de Monitoreo

```sql
-- Estadísticas de idempotencia (últimos 30 días)
SELECT 
  DATE(created_at) as fecha,
  COUNT(*) as total_lotes,
  SUM(CASE WHEN estado = 'COMPLETADO' THEN 1 ELSE 0 END) as exitosos,
  SUM(CASE WHEN estado = 'ERROR' THEN 1 ELSE 0 END) as fallidos,
  SUM(monto_total) as monto_total_procesado
FROM pagos_lote
WHERE tenant_id = 'your-tenant-id'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY fecha DESC;
```

## Referencias

- Migración: `supabase/migrations/037_add_idempotency_pago_lote.sql`
- Test SQL: `test-idempotencia-pago-lote.sql`
- Test API: `test-idempotencia-pago-lote.ps1`
- Servicio: `apps/erp-api/src/modules/finanzas/tesoreria/tesoreria.service.ts`

