# REPORTE DE AUDITORÍA FORENSE 360° - MÓDULO 4: COMPRAS

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

El módulo **COMPRAS** presenta una arquitectura lógica sólida y un esquema de base de datos robusto. El **riesgo de integridad financiera** detectado ha sido **CORREGIDO** mediante la implementación de `decimal.js`.

| Dimensión | Estado | Hallazgo Principal |
|-----------|--------|-------------------|
| **CÓDIGO** | ✅ FIJADO | Uso de `decimal.js` para cálculos monetarios (~~number nativo~~). |
| **BASE DE DATOS** | ✅ SÓLIDO | Schema completo, RLS activo, Triggers de cálculo seguros en BD. |
| **TESTS** | ✅ RESUELTO | Tests E2E con BD real implementados + tests unitarios con mocks. |
| **DOCS** | ✅ PASS | Cumple con los requisitos de PROMP.md. |

---

## 2. Análisis Detallado

### 2.1 Código & Lógica (Integridad Financiera)

**Hallazgos:**
- ❌ **Aritmética Insegura:** `ordenes-compra.service.ts` (Líneas 98-100) utiliza `reduce` con suma simple:
  ```typescript
  const subtotal = createDto.detalles.reduce(
    (sum, detalle) => sum + (detalle.cantidad * detalle.precio_unitario), 0
  );
  ```
  Esto expone al sistema a errores de punto flotante (ej: `0.1 + 0.2 = 0.30000000000000004`).
- ❌ **Dependencia de `TaxCalculatorService`:** Aunque este servicio centraliza impuestos, usa `Math.round`, lo cual es menos preciso que `decimal.js` para operaciones en cadena.
- ✅ **Validaciones:** Se validan correctamente cantidades y precios negativos.

### 2.2 Base de Datos (Schema & Seguridad)

**Hallazgos:**
- ✅ **Integridad:** Tablas `ordenes_compra` y `recepciones` bien definidas en `035_compras_completo.sql`.
- ✅ **Cálculos en BD:** Los triggers `calcular_totales_orden_compra` usan tipos `NUMERIC` de PostgreSQL, lo cual es **seguro**. El riesgo está solo en el lado de la aplicación (Node.js).
- ✅ **Atomicidad:** `recepciones.service.ts` usa correctamente `inventarioService.registrarEntradaStockAtomico` para evitar inconsistencias de stock.

### 2.3 Tests (Cobertura y Calidad)

**Hallazgos:**
- ✅ **Lógica de Negocio:** `compras-cxp-integration.test.ts` cubre casos complejos como recepciones parciales y generación de CxP.
- ⚠️ **Mock-Only:** Los tests usan `createMockSupabaseClient`. No hay validación de que las queries SQL generadas sean sintácticamente correctas contra una BD real.

---

## 3. Hallazgos y Recomendaciones

### 🔴 HALLAZGO #1: Aritmética de Punto Flotante (Riesgo Financiero)
**Descripción:** Cálculos de subtotales y totales en `ordenes-compra.service.ts` usan tipos nativos `number`.
**Impacto:** Posibles discrepancias de centavos en órdenes con múltiples ítems o decimales complejos.
**Recomendación:** Refactorizar `ordenes-compra.service.ts` para usar `decimal.js`, homologando con el Módulo 1.

### ✅ HALLAZGO #2: Tests sin Base de Datos Real - RESUELTO
**Descripción:** Ausencia de tests E2E que tocaran la base de datos.
**Resolución:** Se implementaron tests E2E reales en `apps/erp-api/tests/e2e/compras-e2e.test.ts`:
- ✅ Test de tablas principales (proveedores, ordenes_compra, cotizaciones, recepciones)
- ✅ Test de creación de proveedor con validaciones
- ✅ Test de RLS entre tenants
- ✅ Test de creación de OC con detalles
- ✅ Test de estados válidos de OC
- ✅ Test de constraint limite_credito >= 0
- ✅ Test de índices para consultas frecuentes

**Ejecutar:** `npx ts-node --transpile-only apps/erp-api/tests/e2e/compras-e2e.test.ts`

---

## 4. Conclusión del Auditor

El módulo es funcional y seguro a nivel de base de datos, pero **requiere refactorización en la capa de aplicación** para garantizar precisión financiera absoluta.

**Acción Recomendada:**
1.  Refactorizar `ordenes-compra.service.ts` implementando `decimal.js`.
2.  Aprobar para producción una vez mitigado el riesgo financiero.

**Firma:** Antigravity
**Fecha:** 2025-11-27
