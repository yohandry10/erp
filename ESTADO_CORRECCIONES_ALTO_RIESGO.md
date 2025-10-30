# ESTADO ACTUAL DE CORRECCIONES ALTO RIESGO

**Fecha:** 2025-01-XX  
**Metodología:** Revisión exhaustiva de código existente antes de implementar

---

## 📋 REVISIÓN DE CÓDIGO EXISTENTE

### 🟠 PROBLEMA 5: Validación de moneda entre cuenta bancaria y CxP/CxC

**Estado:** ✅ PARCIALMENTE IMPLEMENTADO - **COMPLETADO**

**Ubicaciones revisadas:**
- ✅ `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts` (líneas 532-538): **YA TIENE** validación de moneda
- ✅ `apps/erp-api/src/modules/finanzas/tesoreria/tesoreria.service.ts` (líneas 83-88): **YA TIENE** validación de moneda
- ❌ `apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts` (línea 382-408): **NO TIENE** validación de moneda cuando se aplica pago

**Acción requerida:**
- Agregar validación de moneda en `CxpService.aplicarPago()` cuando se especifica `cuenta_bancaria_id`

---

### 🟠 PROBLEMA 7: Anulación de CPE debe revertir asientos contables

**Estado:** ✅ YA IMPLEMENTADO

**Ubicaciones revisadas:**
- ✅ `apps/erp-api/src/modules/cpe/cpe.service.ts` (línea 1098): Emite evento `cpe.anulado` en outbox_events
- ✅ `apps/erp-api/src/modules/contabilidad/listeners/contabilidad-events.listener.ts` (línea 599): Handler `handleCpeAnulado()` ya existe y revierte asientos

**Acción requerida:**
- ❌ NINGUNA - Ya está implementado completamente

---

### 🟠 PROBLEMA 8: Validación de que asiento contable se haya creado correctamente

**Estado:** ❌ NO IMPLEMENTADO - **COMPLETADO**

---

### 🟠 PROBLEMA 11: Validar que tenant tenga al menos un admin antes de desactivar

**Estado:** ❌ NO IMPLEMENTADO - **COMPLETADO**

**Ubicaciones revisadas:**
- `apps/erp-api/src/modules/tenants/tenant-management.service.ts` (línea 392): Método `deactivateTenant()` no valida admins

**Acción requerida:**
- Agregar validación antes de desactivar tenant
- Verificar que exista al menos un usuario con rol ADMIN activo
- Lanzar error si intenta desactivar sin admins

---

## ✅ IMPLEMENTACIONES REQUERIDAS

1. ✅ **Problema 5:** Agregar validación de moneda en `CxpService.aplicarPago()` - **COMPLETADO**
2. ✅ **Problema 8:** Agregar validación de creación de asientos en listeners - **COMPLETADO**
3. ✅ **Problema 11:** Agregar validación de admins antes de desactivar tenant - **COMPLETADO**

**Problema 7:** Ya está implementado, no requiere acción.

