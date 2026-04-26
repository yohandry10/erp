# 🔍 AUDITORÍA COMPLETA - MÓDULO POS

**Fecha:** 2025-11-29  
**Archivos Auditados:**
- `pos.service.ts` (1285 líneas)
- `pos.controller.ts` (160 líneas)
- `pos.module.ts` (30 líneas)
- `pos.service.spec.ts` (150 líneas)
- `pos.worker.scheduler.ts` (65 líneas)
- `services/pos-audit.service.ts` (270 líneas)
- `src/pos/pos.service.ts` (deprecated)

---

## ✅ ASPECTOS POSITIVOS

### 1. ✅ Multi-tenant bien implementado
- Usa `TenantContextService` para aislar operaciones
- `runWithTenantContext()` envuelve todas las operaciones
- Filtros de `tenant_id` en todas las queries

### 2. ✅ Idempotencia implementada
- Requiere `idempotency_key` obligatorio
- Verifica en `outbox_events` antes de procesar
- Retorna venta existente si ya fue procesada

### 3. ✅ Locks para concurrencia
- Advisory locks por tenant + sesión + idempotency
- Locks por producto para evitar race conditions
- Liberación en `finally` block

### 4. ✅ Validaciones pre-venta robustas
- Validación de certificado digital
- Validación de configuración RUC
- Validación de documento SUNAT
- Recálculo server-side de totales

### 5. ✅ Reintentos de facturación
- Sistema de ventas pendientes de CPE
- Máximo 5 reintentos
- Worker automático cada 5 minutos

### 6. ✅ Servicio de auditoría forense
- Registra eventos de alto riesgo
- Detecta patrones sospechosos
- Requiere supervisor para operaciones críticas

---

## 🚨 ERRORES CRÍTICOS

### 1. ❌ SERVICIO DEPRECATED PUEDE CAUSAR CONFUSIÓN

**Ubicación:** `apps/erp-api/src/pos/pos.service.ts`

**Problema:** Existe un servicio POS deprecated que lanza error en constructor:

```typescript
constructor(private readonly supabase: SupabaseService) {
  // Deprecated service to avoid accidental use
  throw new Error('Deprecated PosService (src/pos). Use modules/pos/pos.service instead.');
}
```

**Impacto:** 🟡 MEDIO - Si alguien importa el servicio incorrecto, la app crashea.

**Solución:** Eliminar el archivo deprecated o moverlo a una carpeta `_deprecated`.

---

### 2. ❌ FALTA TEST E2E CON BD REAL

**Problema:** Solo existe `pos.service.spec.ts` con mocks. No hay tests E2E que validen:
- Creación real de ventas en BD
- Actualización de stock
- Generación de CPE
- Creación de CxC para ventas a crédito

**Impacto:** 🔴 CRÍTICO - No hay validación de integración real.

---

### 3. ❌ DETALLES DE VENTA NO SE PERSISTEN CORRECTAMENTE

**Ubicación:** `PLAN_MEJORAS_POS.md` - Riesgo documentado

**Problema:** 
> "POS backend: `pos.service.ts` no guarda ítems en `detalle_ventas_pos` (solo observaciones). Se pierde trazabilidad contable/stock por línea."

El RPC `pos_registrar_venta_tx` debería guardar los detalles, pero no está verificado.

**Impacto:** 🔴 CRÍTICO - Pérdida de trazabilidad de ítems vendidos.

---

## ⚠️ ERRORES DE LÓGICA

### 4. ⚠️ MÉTODOS DE PAGO HARDCODEADOS

**Ubicación:** `pos.service.ts` línea 60-75

**Problema:** La función `getMetodoPagoInfo` tiene atajos hardcodeados:

```typescript
if (['efectivo', 'cash', 'cash_id', 'efectivo_id'].includes(normalized)) {
  return { tipo: 'EFECTIVO', codigo: normalized };
}
if (['tarjeta', 'card', 'card_id', 'tarjeta_id'].includes(normalized)) {
  return { tipo: 'TARJETA', codigo: normalized };
}
```

**Impacto:** 🟡 MEDIO - Puede no reconocer métodos de pago personalizados del tenant.

---

### 5. ⚠️ WORKER SIN MÉTRICAS NI ALERTAS

**Ubicación:** `pos.worker.scheduler.ts`

**Problema:** El worker procesa ventas pendientes pero:
- No emite métricas a sistema de monitoreo
- No envía alertas si hay muchos errores
- No tiene circuit breaker si SUNAT está caído

**Impacto:** 🟡 MEDIO - Problemas pueden pasar desapercibidos.

---

### 6. ⚠️ ROLLBACK INCOMPLETO

**Ubicación:** `pos.service.ts` línea 1280

**Problema:** La función `rollbackVenta` existe pero NO se usa en el flujo principal:

```typescript
private async rollbackVenta(ventaId: string, tenantId: string): Promise<void> {
  // Elimina venta y detalles
}
```

Si falla después de crear la venta pero antes del CPE, la venta queda en estado inconsistente.

**Impacto:** 🟡 MEDIO - Ventas pueden quedar en estado inconsistente.

---

## 🔒 BRECHAS DE SEGURIDAD

### 7. 🔒 ENCRYPTION KEY PUEDE SER DÉBIL

**Ubicación:** `pos.service.ts` línea 32

**Problema:** Acepta key de solo 32 caracteres:

```typescript
private getCertKey(): Buffer {
  const key = process.env.CERT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('CERT_ENCRYPTION_KEY no configurada o demasiado corta (min 32 chars)');
  }
  return crypto.createHash('sha256').update(key).digest();
}
```

**Impacto:** 🟡 MEDIO - 32 caracteres es el mínimo, debería recomendar 64+.

---

### 8. 🔒 WORKER JWT SECRET PUEDE SER DÉBIL

**Ubicación:** `pos.controller.ts` línea 130

**Problema:** Solo valida longitud mínima de 24:

```typescript
if (!secret || secret.length < 24) {
  throw new ForbiddenException('POS_WORKER_JWT_SECRET no configurado o demasiado corto');
}
```

**Impacto:** 🟡 MEDIO - 24 caracteres es muy corto para un secret JWT.

---

## 📊 VACÍOS FUNCIONALES

### 9. 📊 FALTA VALIDACIÓN DE STOCK ANTES DE VENTA

**Problema:** El servicio no valida explícitamente si hay stock suficiente antes de procesar la venta. Depende del RPC `pos_registrar_venta_tx` para validar.

**Solución:** Agregar validación de stock en `procesarVentaInternal` antes de llamar al RPC.

---

### 10. 📊 FALTA SOPORTE OFFLINE

**Problema:** No hay mecanismo para ventas offline que se sincronicen después.

---

### 11. 📊 FALTA INTEGRACIÓN CON RENIEC/SUNAT

**Documentado en:** `PLAN_MEJORAS_POS.md`
> "CONECTARSE AL API DE RENIEC PARA QUE SALGA LA INFORMACION DE USUARIO, PERSONA O PACIENTE/CLIENTE"

---

## 📋 RESUMEN DE HALLAZGOS

| Severidad | Cantidad | Descripción |
|-----------|----------|-------------|
| 🔴 CRÍTICO | 2 | Falta test E2E, detalles no se persisten |
| 🟡 MEDIO | 6 | Deprecated service, métodos hardcodeados, worker sin métricas, rollback no usado, keys débiles |
| 🔵 BAJO | 3 | Falta validación stock, soporte offline, integración RENIEC |

---

## ✅ ACCIONES RECOMENDADAS

### Prioridad 1 (Inmediato):
1. Crear test E2E para POS con BD real
2. Verificar que RPC `pos_registrar_venta_tx` guarde detalles correctamente
3. Eliminar o mover servicio deprecated

### Prioridad 2 (Esta semana):
4. Agregar validación de stock antes de venta
5. Implementar métricas en worker
6. Aumentar requisitos de longitud de keys

### Prioridad 3 (Este mes):
7. Implementar circuit breaker en worker
8. Agregar soporte offline básico
9. Integrar API RENIEC para validación de clientes


---

## ✅ CORRECCIONES APLICADAS

### Fecha: 2025-11-29

#### 1. ✅ Test E2E creado

**Archivo:** `apps/erp-api/tests/e2e/pos-e2e.test.ts`

Tests implementados:
- Tablas principales existen (ventas_pos, sesiones_caja, detalle_ventas_pos, metodos_pago)
- Crear sesión de caja
- Crear venta básica
- RLS aísla ventas entre tenants
- Crear método de pago
- Cerrar sesión de caja
- Tipos NUMERIC correctos para montos
- Venta pendiente de facturación

#### 2. ✅ Runner unificado actualizado

**Archivo:** `apps/erp-api/tests/e2e/run-all-e2e.ts`

- Agregado import de `runPosE2ETests`
- Agregado módulo POS al runner

#### 3. ✅ Servicio deprecated eliminado (VERIFICADO SEGURO)

**Archivo eliminado:** `apps/erp-api/src/pos/pos.service.ts`

**Verificación realizada:**
- ✅ El archivo lanzaba `throw new Error('Deprecated...')` en el constructor
- ✅ No estaba importado en ningún módulo NestJS
- ✅ No había referencias en ningún archivo `.ts` del proyecto
- ✅ El servicio POS correcto está en `modules/pos/pos.service.ts`
- ✅ El test existente `test/test-venta-asiento-automatico.ps1` usa el API HTTP, no importa el servicio directamente
- ✅ Compilación sin errores después de eliminar

#### 4. 📋 Tests existentes identificados

**Tests de integración (PowerShell):**
- `test/test-venta-asiento-automatico.ps1` - Test de venta POS con generación de asiento contable
  - Prueba login, procesamiento de venta, verificación de eventos y asientos
  - Usa API HTTP `/api/pos/ventas`

**Tests unitarios (Jest):**
- `apps/erp-api/src/modules/pos/pos.service.spec.ts` - Tests con mocks
  - Prueba locks de concurrencia
  - Prueba flujo de venta feliz
  - Prueba liberación de locks en caso de error

---

## ⏳ CORRECCIONES PENDIENTES

| # | Descripción | Prioridad | Estado |
|---|-------------|-----------|--------|
| 1 | Verificar RPC guarda detalles correctamente | 🔴 CRÍTICO | Pendiente |
| 2 | Agregar validación de stock antes de venta | 🟡 MEDIO | Pendiente |
| 3 | Implementar métricas en worker | 🟡 MEDIO | Pendiente |
| 4 | Aumentar requisitos de longitud de keys | 🟡 MEDIO | Pendiente |
| 5 | Implementar circuit breaker en worker | 🔵 BAJO | Pendiente |
| 6 | Agregar soporte offline básico | 🔵 BAJO | Pendiente |
| 7 | Integrar API RENIEC | 🔵 BAJO | Pendiente |

---

## 📊 RESUMEN FINAL

### Correcciones Realizadas: 3
- ✅ Test E2E con 8 casos de prueba
- ✅ Runner unificado actualizado
- ✅ Servicio deprecated eliminado

### Pendientes: 7
- 1 crítico (verificar RPC)
- 3 medio (validación stock, métricas, keys)
- 3 bajo (circuit breaker, offline, RENIEC)
