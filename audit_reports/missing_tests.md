# Reporte de Tests Faltantes por Módulo

Este documento consolida los hallazgos de la auditoría forense respecto a la cobertura y calidad de los tests en cada módulo.

## Resumen Global
La mayoría de los módulos críticos (Ventas, Compras, Finanzas) tienen tests de integración, pero sufren del problema **"Mock-Only"**, donde se simula la base de datos, ocultando posibles errores de SQL o triggers. Otros módulos periféricos tienen tests pendientes de implementación.

---

## Detalle por Módulo

### 📦 Módulo 1: VENTAS
- **Estado:** ⚠️ ALERTA (Mock-Only)
- **Faltantes:**
  - Tests de integración con **Base de Datos Real** (Docker/Supabase Local).
  - Validación real de triggers y constraints de BD durante la creación de pedidos.
  - Tests E2E que ejecuten el RPC `crear_pedido_completo` verdaderamente.

### 📦 Módulo 2: CPE
- **Estado:** ⚠️ ALERTA (Mock-Only)
- **Faltantes:**
  - Tests E2E con inserción real en tabla `cpe`.
  - Validación de que las columnas esperadas por el código coincidan con la tabla real.
  - Tests unitarios puros (actualmente solo hay integración mockeada).

### 📦 Módulo 3: INVENTARIO
- **Estado:** 🟢 PASS (Con observaciones)
- **Faltantes:**
  - Tests de **Race Conditions** (simulación de 10 ventas simultáneas).
  - Tests unitarios aislados para `inventario.service.ts` (opcional).

### 📦 Módulo 4: COMPRAS
- **Estado:** ⚠️ ALERTA (Mock-Only)
- **Faltantes:**
  - Tests E2E que toquen la base de datos real.
  - Validación de triggers de cálculo (`calcular_totales_orden_compra`) desde la aplicación.

### 📦 Módulo 5: FINANZAS
- **Estado:** ⚠️ ALERTA (Mock-Only)
- **Faltantes:**
  - Tests E2E para flujos de dinero (pagos/cobros) con persistencia real.
  - Validación de constraints de saldo (`CHECK (saldo >= 0)`) mediante tests.

### 📦 Módulo 6: RRHH
- **Estado:** ⏸️ PENDIENTE
- **Faltantes:**
  - **Todos los tests.** Implementación pendiente (batched).
  - Prioridad: Cálculos de planilla (5ta categoría, AFP, ONP) y validación de precisión decimal.

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

## Recomendación General
Priorizar la creación de una **infraestructura de Testing E2E con Base de Datos Efímera** (Testcontainers o Supabase Local) para mitigar el riesgo de "Falsos Positivos" en los módulos críticos (1-5).









Preguntas de Q&A que te haría el auditor forense: 

1.  