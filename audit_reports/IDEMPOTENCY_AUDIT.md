# Auditoría profunda — Idempotencia por dominio (API + DB)

Fecha: 2025-12-13

## Objetivo
Verificar que los flujos con reintentos (cliente, worker, integraciones SUNAT/OSE) sean **idempotentes** y no generen:
- Duplicados de documentos (CPE/GRE/SIRE)
- Duplicados contables (`asientos_contables`)
- Duplicados financieros (CxC/CxP pagos/cobros)
- Duplicados operativos (POS ventas, compras/recepciones)

## 1) CPE (comprobantes)
- **DB**: `supabase/migrations/073__cpe_hardening.sql`
  - `cpe.idempotency_key` + índice único `cpe_tenant_idempotency_idx (tenant_id, idempotency_key)`.
  - `cpe.event_id` único (`cpe_event_id_unique_idx`) como referencia de emisión.
- **API**: `apps/erp-api/src/modules/cpe/cpe.service.ts`
  - Resuelve `idempotency_key` (`resolveIdempotencyKey`) y hace lookup previo por tenant + key antes de crear.
  - Persiste `idempotency_key` en inserts/updates.
- **Reintentos**: `apps/erp-api/src/modules/sunat-retry/sunat-retry.service.ts`
  - Controla `retry_count`/`next_retry_at` y limita reintentos técnicos.
  - **Worker**: reintentos envían `Idempotency-Key` (dedupe por llave estable): `apps/worker/src/index.ts`.
  - **API (anti-duplicado “in-flight”)**:
    - `apps/erp-api/src/modules/cpe/cpe.controller.ts` acepta `Idempotency-Key`.
    - `apps/erp-api/src/modules/cpe/cpe.service.ts` omite duplicado si ya está `ENVIADO + SENDING`.

## 2) GRE (guías)
- **DB**: `supabase/migrations/073__cpe_hardening.sql`
  - `gre_guias.idempotency_key` + índice único `gre_guias_tenant_idempotency_idx (tenant_id, idempotency_key)`.
  - `gre_guias.event_id` único.
- **API**: `apps/erp-api/src/modules/gre/gre.service.ts`
  - Resuelve `idempotency_key` (`resolveGreIdempotencyKey`) y busca por tenant + key para deduplicar.
- **Reintentos**: `apps/erp-api/src/modules/sunat-retry/sunat-retry.service.ts` (retry GRE).
  - **Worker**: reintentos envían `Idempotency-Key` (dedupe por llave estable): `apps/worker/src/index.ts`.
  - **API (anti-duplicado “in-flight”)**:
    - `apps/erp-api/src/modules/gre/gre.controller.ts` acepta `Idempotency-Key`.
    - `apps/erp-api/src/modules/gre/gre.service.ts` omite duplicado si ya está `ENVIADO + SENDING`.

## 2b) SIRE (libros electrónicos)
- **Trigger actual**: `apps/erp-api/src/modules/sire/sire.service.ts` consume `comprobante.creado`.
- **Idempotencia**:
  - El evento `comprobante.creado` ahora incluye `tenantId` + `idempotencyKey` y se persiste en outbox vía `EventBusService.emit(...)`:
    - `apps/erp-api/src/shared/events/event-bus.service.ts`
    - `apps/erp-api/src/modules/cpe/cpe.service.ts` emite `idempotencyKey = cpe.creado:<tenant>:<cpeId>`
  - SIRE dedupe por `(tenant_id, cpe_id)` antes de insertar `sire_registros_detalle` y solo incrementa contador si insertó:
    - `apps/erp-api/src/modules/sire/sire.service.ts`
- **Pendiente DB (manual)**: agregar constraint/índice único sugerido (si existe tabla `sire_registros_detalle`): `(tenant_id, cpe_id)`.

## 3) POS (ventas rápidas)

### Hallazgo corregido: desalineación API ↔ RPC (idempotency_key)
- **Problema**: el backend exigía `ventaData.idempotency_key` y buscaba deduplicación en `outbox_events.idempotency_key`, pero el RPC `pos_registrar_venta_tx` **no recibía** esa llave y generaba otra (por número/correlativo), permitiendo duplicados en reintentos.
- **Fix aplicado**:
  - DB: `supabase/migrations/164__pos_tx_idempotency_key.sql`
    - `pos_registrar_venta_tx` (public y schema `app`) acepta `p_idempotency_key` y hace short‑circuit: si ya existe outbox con esa llave para el tenant → devuelve la venta existente sin tocar numeración/stock.
    - Persiste `idempotency_key` en `outbox_events` para `pos.venta.registrada`.
  - API: `apps/erp-api/src/modules/pos/pos.service.ts` envía `p_idempotency_key`.
  - Outbox: índice único recomendado para dedupe en outbox (`supabase/migrations/163__outbox_status_casefix.sql`).

## 4) CxC / CxP / Tesorería
- **CxC**: migraciones de hardening (`supabase/migrations/052_cxc_hardening.sql`, `094__ensure_cxc_idempotency.sql`) + lógica de `apps/erp-api/src/modules/finanzas/cxc/cxc.service.ts` para dedupe por `idempotency_key`.
- **CxP pagos**: `apps/erp-api/src/modules/finanzas/cxp/cxp.service.ts` usa `idempotency_key` al registrar pagos; migraciones crean índices únicos para evitar duplicados.
- **Pagos por lote**:
  - `supabase/migrations/037_add_idempotency_pago_lote.sql` crea `pagos_lote` con constraint único `(tenant_id, referencia_lote)`.
  - Nota: `supabase/migrations/074__tesoreria_pago_outbox.sql` redefine `procesar_pago_lote` y ya no inserta outbox (se validó por lectura del archivo).

## 5) Compras / Ventas (outbox + contabilidad)
- **Compras (recepciones/devoluciones/CxP)**:
  - Recepción registrada: idempotencia por `recepcion:<tenant>:<recepcionId>` (outbox + eventBus):
    - `apps/erp-api/src/modules/compras/services/recepciones.service.ts`
  - CxP desde recepción: el `idempotency_key` ya no depende de un `eventId` random; fallback estable:
    - `apps/erp-api/src/modules/compras/services/compras-cxp-integration.service.ts`
  - Devolución proveedor: `devolucion:<tenant>:<devolucionId>`:
    - `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts`
  - Pendiente (manual DB): confirmar índices únicos por `idempotency_key` en tablas destino (`cuentas_por_pagar`, devoluciones) y completar pruebas E2E (T-0602/T-0802).
- **Ventas (pedido→factura→CPE/GRE)**:
  - Facturación desde pedido: `ventas.cpe.factura:<tenant>:<pedidoId>` y `factura:<tenant>:<facturaId>`:
    - `apps/erp-api/src/modules/ventas/pedidos/pedidos.service.ts`
    - `apps/erp-api/src/modules/ventas/pedidos/cpe-integration.service.ts`
  - GRE precarga con `ventas.gre:<tenant>:<facturaId>`:
    - `apps/erp-api/src/modules/ventas/pedidos/gre-integration.service.ts`
  - Pendiente: auditoría end-to-end (T-0601).

## Bloqueador operativo
- La verificación “real” de constraints/policies en Supabase local está bloqueada por `H-DB-MIG-001` (migraciones no reproducibles desde cero).
