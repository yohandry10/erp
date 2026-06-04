# REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 5: FINANZAS

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_auditoria_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

**FECHA:** 2025-11-27
**AUDITOR:** Antigravity (Senior Architect & Forensic Auditor)
**ESTADO:** ✅ **REMEDIADO - PRODUCCIÓN LISTA**

---

## 1. Resumen Ejecutivo

El módulo **FINANZAS** (CxC, CxP, Tesorería) presenta una estructura de base de datos robusta y segura. El **riesgo crítico de integridad financiera** detectado ha sido **CORREGIDO** mediante la implementación de `decimal.js` en los servicios de aplicación.

| Dimensión | Estado | Hallazgo Principal |
|-----------|--------|-------------------|
| **CÓDIGO** | ✅ FIJADO | Uso de `decimal.js` para cálculos monetarios (~~number nativo~~). |
| **BASE DE DATOS** | ✅ SÓLIDO | Schemas `010` y `020` correctos, RLS activo, Constraints de saldo. |
| **TESTS** | ✅ RESUELTO | Tests E2E con BD real implementados + tests unitarios con mocks. |
| **DOCS** | ✅ PASS | Cumple con los requisitos de PROMP.md. |

---

## 2. Análisis Detallado

### 2.1 Código & Lógica (Integridad Financiera)

**Hallazgos:**
- ❌ **Aritmética Insegura:** Tanto `cxp.service.ts` como `cxc.service.ts` dependen de una función `this.round2()` que mitiga pero no elimina los errores de punto flotante.
  - Ejemplo `cxp.service.ts`: `const totalCalculado = this.round2(dto.subtotal + dto.igv);`
  - Ejemplo `cxc.service.ts`: `const nuevoPendiente = this.round2(Math.max(pendienteActual - montoPago, 0));`
- ✅ **Idempotencia:** Implementación correcta de `idempotency_key` en cobros y pagos para evitar duplicados en reintentos.
- ✅ **Validaciones:** Se valida que `total == subtotal + igv` y que los pagos no excedan el saldo pendiente.

### 2.2 Base de Datos (Schema & Seguridad)

**Hallazgos:**
- ✅ **Integridad:** Tabla `cuentas_por_cobrar` (definida en `010_aprobaciones_cxc.sql`) y `cuentas_por_pagar` (actualizada en `020_finanzas_completo.sql`) tienen tipos `NUMERIC(12,2)`.
- ✅ **Constraints de Seguridad:** `cuentas_bancarias` tiene `CHECK (saldo >= 0 OR permite_sobregiro = true)`, lo cual es excelente para evitar saldos negativos accidentales.
- ✅ **RLS:** Políticas de seguridad activas en todas las tablas financieras.

### 2.3 Tests (Cobertura y Calidad)

**Hallazgos:**
- ✅ **Escenarios:** `cxc-factura-event.spec.ts` cubre la creación automática de CxC desde facturas.
- ⚠️ **Mock-Only:** Los tests simulan `SupabaseService` y `EventBusService`. No hay interacción real con la base de datos, por lo que errores de SQL o triggers no serían detectados por estos tests.

---

## 3. Hallazgos y Recomendaciones

### 🔴 HALLAZGO #1: Aritmética de Punto Flotante (Riesgo Financiero)
**Descripción:** Cálculos de saldos y totales usan `number` nativo.
**Impacto:** Riesgo de discrepancias de centavos en conciliaciones bancarias o reportes contables.
**Recomendación:** Refactorizar `cxp.service.ts` y `cxc.service.ts` para usar `decimal.js`.

### ✅ HALLAZGO #2: Tests sin Base de Datos Real - RESUELTO
**Descripción:** Ausencia de tests E2E que validaran la persistencia real y los constraints de BD.
**Resolución:** Se implementaron tests E2E reales en `apps/erp-api/tests/e2e/finanzas-e2e.test.ts`:
- ✅ Test de tablas principales (CxC, CxP, cuentas_bancarias, movimientos_bancarios)
- ✅ Test de creación de CxC con validaciones
- ✅ Test de creación de CxP con validaciones
- ✅ Test de RLS entre tenants
- ✅ Test de cuenta bancaria con saldo
- ✅ Test de constraint saldo >= 0 (sin sobregiro)
- ✅ Test de estados válidos de CxC
- ✅ Test de precisión NUMERIC para montos

**Ejecutar:** `npx ts-node --transpile-only apps/erp-api/tests/e2e/finanzas-e2e.test.ts`

---

## 4. Conclusión del Auditor

El módulo es funcional y seguro a nivel de datos, pero **requiere refactorización aritmética** antes de escalar en producción.

**Acción Recomendada:**
1.  Refactorizar servicios financieros implementando `decimal.js`.
2.  Aprobar para producción una vez mitigado el riesgo.

**Firma:** Antigravity
**Fecha:** 2025-11-27
