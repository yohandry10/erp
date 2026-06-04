# Reporte de Tests Faltantes por Módulo

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_auditoria_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Este documento consolida los hallazgos de la auditoría forense respecto a la cobertura y calidad de los tests en cada módulo.

## Resumen Global
La mayoría de los módulos críticos (Ventas, Compras, Finanzas) tienen tests de integración, pero sufren del problema **"Mock-Only"**, donde se simula la base de datos, ocultando posibles errores de SQL o triggers. Otros módulos periféricos tienen tests pendientes de implementación.

---

## Detalle por Módulo

### 📦 Módulo 1: VENTAS
- **Estado:** ✅ RESUELTO
- **Implementado:**
  - ✅ Tests E2E con BD real en `apps/erp-api/tests/e2e/ventas-e2e.test.ts`
  - ✅ Test de RPC `crear_pedido_completo` contra Supabase local
  - ✅ Test de constraint de stock (CHECK >= 0)
  - ✅ Test de aislamiento RLS entre tenants
  - ✅ Test de verificación de índices
- **Ejecutar:** `npx ts-node --transpile-only apps/erp-api/tests/e2e/ventas-e2e.test.ts`

### 📦 Módulo 2: CPE
- **Estado:** ✅ RESUELTO
- **Implementado:**
  - ✅ Tests E2E con BD real en `apps/erp-api/tests/e2e/cpe-e2e.test.ts`
  - ✅ Test de existencia y estructura de tabla cpe
  - ✅ Test de índice de idempotencia (previene duplicados)
  - ✅ Test de aislamiento RLS entre tenants
  - ✅ Test de estados SUNAT válidos
  - ✅ Test de campos de retry
- **Ejecutar:** `npx ts-node --transpile-only apps/erp-api/tests/e2e/cpe-e2e.test.ts`

### 📦 Módulo 3: INVENTARIO
- **Estado:** ✅ RESUELTO
- **Implementado:**
  - ✅ Tests E2E con BD real en `apps/erp-api/tests/e2e/inventario-e2e.test.ts`
  - ✅ Constraint CHECK (stock >= 0) en migración `129__stock_constraints.sql`
  - ✅ Test de tablas principales
  - ✅ Test de RPC atómico
  - ✅ Test de RLS entre tenants
  - ✅ Test de precisión NUMERIC
- **Ejecutar:** `npx ts-node --transpile-only apps/erp-api/tests/e2e/inventario-e2e.test.ts`
- **Pendiente (opcional):** Tests de race conditions extremos

### 📦 Módulo 4: COMPRAS
- **Estado:** ✅ RESUELTO
- **Implementado:**
  - ✅ Tests E2E con BD real en `apps/erp-api/tests/e2e/compras-e2e.test.ts`
  - ✅ Test de tablas principales (proveedores, ordenes_compra, cotizaciones, recepciones)
  - ✅ Test de creación de proveedor con validaciones
  - ✅ Test de RLS entre tenants
  - ✅ Test de creación de OC con detalles
  - ✅ Test de estados válidos de OC
  - ✅ Test de constraint limite_credito >= 0
- **Existente adicional:** Tests unitarios con mocks, tests Playwright E2E frontend
- **Ejecutar:** `npx ts-node --transpile-only apps/erp-api/tests/e2e/compras-e2e.test.ts`

### 📦 Módulo 5: FINANZAS
- **Estado:** ✅ RESUELTO
- **Implementado:**
  - ✅ Tests E2E con BD real en `apps/erp-api/tests/e2e/finanzas-e2e.test.ts`
  - ✅ Test de tablas principales (CxC, CxP, cuentas_bancarias, movimientos)
  - ✅ Test de creación de CxC y CxP
  - ✅ Test de RLS entre tenants
  - ✅ Test de cuenta bancaria con saldo
  - ✅ Test de constraint saldo >= 0 (sin sobregiro)
  - ✅ Test de estados válidos de CxC
  - ✅ Test de precisión NUMERIC
- **Existente adicional:** Tests unitarios con mocks (bancos, conciliacion, cxc, cxp, tesoreria)
- **Ejecutar:** `npx ts-node --transpile-only apps/erp-api/tests/e2e/finanzas-e2e.test.ts`

### 📦 Módulo 6: RRHH
- **Estado:** ⏸️ PENDIENTE
- **Faltantes:**
  - Tests de cálculos de planilla (5ta categoría, AFP, ONP)
  - Validación de precisión decimal
- **Prioridad:** ALTA (módulo crítico sin tests)

### 📦 Módulo 7: AUTH
- **Estado:** ✅ PASS (Cobertura funcional)
- **Faltantes:**
  - No se reportaron faltantes críticos. Se recomienda añadir tests de carga para login.

### 📦 Módulo 8: TENANTS
- **Estado:** ✅ PASS (Cobertura funcional)
- **Faltantes:**
  - No se reportaron faltantes críticos.

### 📦 Módulo 9: POS
- **Estado:** ⏸️ PENDIENTE
- **Faltantes:**
  - **Todos los tests.** Implementación pendiente (batched).
  - Prioridad: Sincronización Offline-Online y cálculos de venta en frontend.

### 📦 Módulo 10: DASHBOARD
- **Estado:** ⏸️ PENDIENTE
- **Faltantes:**
  - **Todos los tests.** Implementación pendiente (batched).
  - Prioridad: Validación de precisión en KPIs agregados.

### 📦 Módulo 11: REPORTES
- **Estado:** ⏸️ PENDIENTE
- **Faltantes:**
  - **Todos los tests.** Implementación pendiente (batched).
  - Prioridad: Generación de reportes con grandes volúmenes de datos.

### 📦 Módulo 12: CONFIGURACIÓN
- **Estado:** ⏸️ PENDIENTE
- **Faltantes:**
  - **Todos los tests.** Implementación pendiente (batched).

---

## ✅ Infraestructura E2E Implementada

Se creó infraestructura de Testing E2E con Supabase Local:

**Archivos creados:**
- `apps/erp-api/tests/e2e/helpers/supabase-test-client.ts` - Helper de conexión
- `apps/erp-api/tests/e2e/ventas-e2e.test.ts` - Tests E2E Ventas
- `apps/erp-api/tests/e2e/cpe-e2e.test.ts` - Tests E2E CPE
- `apps/erp-api/tests/e2e/inventario-e2e.test.ts` - Tests E2E Inventario
- `apps/erp-api/tests/e2e/run-all-e2e.ts` - Runner unificado

**Ejecutar todos los tests E2E:**
```bash
npx supabase start  # Iniciar Supabase local
npx ts-node --transpile-only apps/erp-api/tests/e2e/run-all-e2e.ts
```

**Ejecutar por módulo:**
```bash
npx ts-node --transpile-only apps/erp-api/tests/e2e/ventas-e2e.test.ts
npx ts-node --transpile-only apps/erp-api/tests/e2e/cpe-e2e.test.ts
npx ts-node --transpile-only apps/erp-api/tests/e2e/inventario-e2e.test.ts
npx ts-node --transpile-only apps/erp-api/tests/e2e/compras-e2e.test.ts
npx ts-node --transpile-only apps/erp-api/tests/e2e/finanzas-e2e.test.ts
```


Preguntas de Q&A que te haría el auditor forense:

1.
