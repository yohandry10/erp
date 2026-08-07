# Test Plan: RecepcionRegistrada Event Listener

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

## Objetivo
Verificar que el listener de `RecepcionRegistrada` funciona correctamente y crea cuentas por pagar automáticamente.

## Pre-requisitos

1. Base de datos con migración 035 aplicada
2. Tabla `cuentas_por_pagar` existente con RLS habilitado
3. Tabla `empresa_config` con campo `generar_cxp_en`
4. Proveedor existente con condiciones de pago configuradas
5. Orden de compra aprobada

## Escenarios de Prueba

### Escenario 1: Creación Exitosa de CxP

**Pasos:**
1. Configurar `empresa_config.generar_cxp_en = 'RECEPCION'`
2. Crear una orden de compra aprobada
3. Crear una recepción en estado BORRADOR
4. Cerrar la recepción mediante: `POST /api/compras/recepciones/:id/cerrar`

**Resultado Esperado:**
- ✅ Recepción cerrada exitosamente
- ✅ Evento `RecepcionRegistrada` emitido
- ✅ Listener procesa el evento
- ✅ CxP creada en tabla `cuentas_por_pagar`
- ✅ CxP vinculada a recepción (`referencia_tipo='RECEPCION'`, `referencia_id=[recepcion_id]`)
- ✅ Fecha de vencimiento calculada correctamente
- ✅ Estado inicial = 'PENDIENTE'
- ✅ Saldo = Total

**Logs Esperados:**
```
📦 [Recepciones] Cerrando recepción [uuid]
✅ Movimiento de inventario creado para producto [uuid]
✅ Detalle de orden actualizado: [uuid]
✅ Estado de orden actualizado a: RECIBIDA
✅ Recepción cerrada: REC-2025-0001
📡 [Recepciones] Emitiendo evento RecepcionRegistrada para [uuid]
✅ Evento RecepcionRegistrada emitido exitosamente
📦 Procesando RecepcionRegistrada: REC-2025-0001 ([uuid])
✅ CxP creada: CXP-2025-0001 - Monto: 1180.00 PEN - Vencimiento: 2025-11-24
```

**Verificación en BD:**
```sql
SELECT
  numero,
  proveedor_id,
  tipo_documento,
  numero_documento,
  fecha_emision,
  fecha_vencimiento,
  total,
  saldo,
  estado,
  referencia_tipo,
  referencia_id,
  orden_compra_id
FROM cuentas_por_pagar
WHERE referencia_tipo = 'RECEPCION'
  AND referencia_id = '[recepcion_id]';
```

### Escenario 2: Idempotencia - No Duplicar CxP

**Pasos:**
1. Ejecutar Escenario 1 (CxP ya creada)
2. Intentar procesar el mismo evento manualmente o cerrar nuevamente

**Resultado Esperado:**
- ✅ Listener detecta CxP existente
- ✅ No se crea CxP duplicada
- ✅ Log de advertencia

**Logs Esperados:**
```
📦 Procesando RecepcionRegistrada: REC-2025-0001 ([uuid])
⚠️ Ya existe una CxP para la recepción REC-2025-0001. Saltando...
```

**Verificación en BD:**
```sql
SELECT COUNT(*) as total
FROM cuentas_por_pagar
WHERE referencia_tipo = 'RECEPCION'
  AND referencia_id = '[recepcion_id]';
-- Debe retornar: total = 1
```

### Escenario 3: Configuración Deshabilitada

**Pasos:**
1. Configurar `empresa_config.generar_cxp_en = 'APROBACION_OC'`
2. Crear y cerrar una recepción

**Resultado Esperado:**
- ✅ Recepción cerrada exitosamente
- ✅ Evento emitido
- ✅ Listener detecta configuración
- ✅ NO se crea CxP

**Logs Esperados:**
```
📦 Procesando RecepcionRegistrada: REC-2025-0002 ([uuid])
⏭️ Configuración indica no generar CxP en recepción. Saltando...
```

**Verificación en BD:**
```sql
SELECT COUNT(*) as total
FROM cuentas_por_pagar
WHERE referencia_tipo = 'RECEPCION'
  AND referencia_id = '[recepcion_id]';
-- Debe retornar: total = 0
```

### Escenario 4: Cálculo de Fecha de Vencimiento

**Pasos:**
1. Crear proveedor con `dias_credito = 30`
2. Crear orden de compra con ese proveedor
3. Crear y cerrar recepción con fecha `2025-10-25`

**Resultado Esperado:**
- ✅ CxP creada con `fecha_vencimiento = 2025-11-24` (30 días después)

**Verificación:**
```sql
SELECT
  fecha_emision,
  fecha_vencimiento,
  DATE_PART('day', fecha_vencimiento::timestamp - fecha_emision::timestamp) as dias_diferencia
FROM cuentas_por_pagar
WHERE referencia_id = '[recepcion_id]';
-- dias_diferencia debe ser 30
```

### Escenario 5: Recepciones Parciales

**Pasos:**
1. Crear orden de compra con 100 unidades
2. Crear recepción 1 con 60 unidades y cerrar
3. Crear recepción 2 con 40 unidades y cerrar

**Resultado Esperado:**
- ✅ CxP 1 creada por 60 unidades
- ✅ CxP 2 creada por 40 unidades
- ✅ Ambas vinculadas a la misma orden de compra
- ✅ Totales correctos en cada CxP

**Verificación:**
```sql
SELECT
  numero,
  numero_documento,
  total,
  referencia_id
FROM cuentas_por_pagar
WHERE orden_compra_id = '[orden_id]'
ORDER BY created_at;
-- Debe retornar 2 registros
```

## Comandos de Prueba

### Crear Recepción y Cerrar
```bash
# 1. Crear recepción
curl -X POST http://localhost:3000/api/compras/ordenes/[orden_id]/recepciones \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: [tenant_id]" \
  -d '{
    "orden_id": "[orden_id]",
    "almacen_id": "[almacen_id]",
    "items": [
      {
        "detalle_id": "[detalle_id]",
        "cantidad_recibida": 10,
        "calidad": "OK"
      }
    ]
  }'

# 2. Cerrar recepción
curl -X POST http://localhost:3000/api/compras/recepciones/[recepcion_id]/cerrar \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: [tenant_id]" \
  -d '{
    "observaciones": "Recepción completa"
  }'
```

### Verificar CxP Creada
```bash
curl -X GET http://localhost:3000/api/finanzas/cuentas-por-pagar \
  -H "x-tenant-id: [tenant_id]" \
  | jq '.[] | select(.referencia_tipo == "RECEPCION")'
```

## Checklist de Validación

- [ ] Evento `RecepcionRegistrada` se emite correctamente
- [ ] Listener se registra al iniciar el módulo
- [ ] CxP se crea con todos los campos requeridos
- [ ] Número de CxP se genera secuencialmente
- [ ] Fecha de vencimiento se calcula correctamente
- [ ] Idempotencia funciona (no duplica CxP)
- [ ] Configuración de empresa se respeta
- [ ] Recepciones parciales crean múltiples CxP
- [ ] Vinculación con recepción y orden es correcta
- [ ] Estado inicial es PENDIENTE
- [ ] Saldo inicial es igual al total
- [ ] Logs son claros y descriptivos
- [ ] Errores no bloquean el cierre de recepción
- [ ] Multi-tenant funciona correctamente

## Notas

- El listener NO bloquea el cierre de la recepción si falla
- Los errores se loguean pero no se propagan
- La configuración por defecto es `generar_cxp_en = 'RECEPCION'`
- El número de CxP sigue el formato `CXP-YYYY-NNNN`
- La tabla `cuentas_por_pagar` debe tener RLS habilitado
