# Auditoría profunda — Compras (OC → Recepción → CxP → Devolución)

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `historico_auditoria_archivado`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/DOCUMENTATION_QUARANTINE.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Fecha: 2025-12-13

## 1) Scope auditado (código)
- Órdenes de compra:
  - `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
  - `apps/erp-api/src/modules/compras/repositories/ordenes-compra.repository.ts`
- Recepciones:
  - `apps/erp-api/src/modules/compras/services/recepciones.service.ts`
- Integración Compras→CxP:
  - `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`
- Devoluciones a proveedor:
  - `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts`
- Inventario (impacto):
  - `apps/erp-api/src/modules/inventario/inventario.service.ts` (RPCs atómicos)

## 2) Flujo: Recepción (cierre) → Inventario + estado OC + evento → CxP

### 2.1 `RecepcionesService.cerrarRecepcion`
- **Entrada**: recepción en `BORRADOR` con items.
- **Inventario**: por cada item OK/OBSERVADO llama a `inventarioService.registrarEntradaStockAtomico(...)` (RPC atómica por item).
- **Actualización OC**: incrementa `orden_compra_detalles.cantidad_recibida` por item y recalcula estado de OC.
- **Persistencia recepción**: marca `recepciones.estado = 'CERRADA'`.
- **Eventos**:
  - Emite `RecepcionRegistrada` para que `ComprasCxpIntegrationService` genere CxP.

### Hallazgo corregido: over‑recepción y falta de filtro tenant en detalle de OC
- **Problema**: el cierre actualizaba `orden_compra_detalles.cantidad_recibida` sin validar que el acumulado no exceda `orden_compra_detalles.cantidad`, y el `select/update` del detalle no filtraba por `tenant_id`.
- **Fix aplicado**:
  - Validación `nuevaCantidadRecibida <= cantidad` antes de actualizar.
  - `select/update` ahora incluyen `.eq('tenant_id', tenantId)`.
- **Test**: `apps/erp-api/src/modules/compras/services/recepciones.service.spec.ts`

### Hallazgo: cierre de recepción no es transaccional (posibles estados parciales)
- Aunque la entrada a inventario es atómica por item, el cierre completo involucra:
  - múltiples RPCs + múltiples updates + cambio de estado,
  - sin una transacción única que garantice “todo o nada”.
- **Riesgo**: fallos intermedios pueden dejar:
  - stock ingresado pero recepción no cerrada,
  - cantidades recibidas actualizadas parcialmente,
  - evento emitido sin que el estado final sea consistente.
- **Mitigación recomendada**:
  - RPC transaccional “cerrar_recepcion_atomica” que:
    - valide recepción/items,
    - registre entradas,
    - actualice detalles OC,
    - cierre recepción,
    - inserte outbox/evento,
    todo en una sola transacción DB.

## 3) Integración Compras → CxP (idempotencia)
- `ComprasCxpIntegrationService`:
  - Decide si generar CxP según `empresa_config.generar_cxp_en`.
  - Idempotencia: valida existencia por `(tenant_id, referencia_tipo='RECEPCION', referencia_id=recepcionId)`.
  - Inserta CxP con `idempotency_key` y `event_id`.
  - Moneda: usa `event.moneda || empresa_config.moneda_defecto || 'PEN'` para evitar default incorrecto.
- **Riesgo residual**:
  - Si el evento se emite duplicado con distinta `referencia_id` o si hay race conditions, el check por referencia protege, pero depende de consistencia del `referencia_id`.
 - **Fix aplicado (idempotencyKey estable)**:
   - El fallback de `idempotency_key` para CxP ya no usa un `eventId` aleatorio (evita crear llaves distintas en reintentos):
     - `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`

## 4) Devoluciones a proveedor (gaps funcionales)
- En `DevolucionesProveedorService.emitirDevolucion` hay TODOs:
  - Crear nota de crédito proveedor / CxP negativo (finanzas ya existe).
  - Notificación al proveedor.
  - Moneda: deriva de `devolucion.moneda || orden.moneda || empresa_config.moneda_defecto || 'PEN'` (fix aplicado en el evento para evitar hardcode).
- **Riesgo**:
  - Flujo incompleto: devolución emitida sin impacto financiero ni notificación; moneda incorrecta puede distorsionar contabilidad.

## 5) Outbox: eventos de Compras sin `idempotency_key` en la fila (dedupe incompleto)
- **Dónde**:
  - `apps/erp-api/src/modules/compras/services/recepciones.service.ts` (outbox `recepcion.registrada`)
  - `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts` (outbox `devolucion.proveedor.registrada`)
- **Qué pasaba**: se pasaba `correlationId` con una llave estable, pero no se pasaba `idempotencyKey` al `EventEmitterService`, por lo que la columna `outbox_events.idempotency_key` podía quedar `NULL` y el dedupe por índice único no aplica.
- **Impacto**:
  - Duplicados en outbox ante reintentos (mismo flujo) aunque exista un índice único recomendado por `(tenant_id, idempotency_key)` (porque la columna no se llena).
- **Fix aplicado**:
  - Pasar explícitamente `idempotencyKey` a `EventEmitterService.emit(...)` en ambos flujos.

## 6) OC: cancelación con recepciones activas (consistencia)
- **Dónde**: `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts` (cancelación OC).
- **Qué pasa**: por defecto se bloquea cancelación si existen recepciones activas (no `CERRADA`); se permite override explícito.
- **Impacto**:
  - Riesgo de estados inconsistentes (OC anulada + recepciones en progreso), y decisiones ambiguas sobre stock ya ingresado vs devolución.
- **Fix aplicado**:
  - Bloqueo por defecto con excepción clara.
  - Campo DTO `permitir_cancelar_con_recepciones_activas=true` para forzar cancelación (manual).
  - Bloqueo por defecto si existen recepciones `CERRADA` (requiere reversa); override explícito `permitir_cancelar_con_recepciones_cerradas=true`.
- **Avance aplicado (sin migraciones)**:
  - Reversa automática de inventario (devoluciones) al cancelar con recepciones `CERRADA`.
  - Reversa financiera idempotente en CxP: listener a `devolucion.proveedor.emitida` ajusta/anula la CxP de la recepción (si no tiene pagos); si tiene pagos, registra error para tratamiento manual.

### Avance aplicado: reversa automática (best-effort) cuando se cancela con recepciones CERRADAS
- Implementación: al usar `permitir_cancelar_con_recepciones_cerradas=true`, se genera/emit(e) una devolución a proveedor por cada recepción cerrada.
- Dedupe: busca devolución existente por `(tenant_id, orden_id, recepcion_id, motivo='CANCELACION_OC')` y:
  - Si `EMITIDA`: no re-procesa.
  - Si `PENDIENTE`: reintenta `emitirDevolucion`.
- Archivos:
  - `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
  - `apps/erp-api/src/modules/compras/dto/cancelar-orden-compra.dto.ts`
  - Tests: `apps/erp-api/src/modules/compras/services/ordenes-compra.service.spec.ts`

## 7) Documentación interna desalineada (ruido)
- `apps/erp-api/src/modules/compras/TASK_2.5_CHECKLIST.md` marca TODO “emitir evento/outbox/tests”, pero el código actual ya emite eventos y escribe integration_logs.
- **Recomendación**: actualizar docs para reflejar estado real o migrarlas a `tareas-errores.md`.

## 8) Próximas verificaciones necesarias (para cerrar T-0602)
- Aprobaciones OC: límites, estados, notificaciones y rollback.
- Recepciones parciales: validación de `cantidad_recibida` vs `cantidad`, cierre múltiple, reintentos.
- Integración inventario multi-almacén/lotes/series en recepción.
- Devolución proveedor: stock reverso + CxP negativo + asiento contable idempotente.
