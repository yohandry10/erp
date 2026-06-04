# Auditoría profunda — Outbox (DB + API + worker)

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

## 1) Estado actual (qué se verificó en repo)
- Definición base de tabla/funciones/RLS: `supabase/migrations/059_create_outbox_events.sql`.
- Contrato actual documentado: `docs/outbox-events.md`.
- Verificador de integridad: `supabase/verify/verify_outbox_integrity.sql`.
- Worker en API (cron): `apps/erp-api/src/shared/outbox/outbox-worker.service.ts`.
- Inserción estándar (API): `apps/erp-api/src/shared/outbox/outbox-event.interface.ts`.
- POS usa RPC SQL: `apps/erp-api/src/modules/pos/pos.service.ts` → `.rpc('pos_registrar_venta_tx', ...)`.

## 2) Hallazgo crítico: `status` case-sensitive rompe el procesamiento

### Problema
- `get_pending_outbox_events` (DB) filtraba: `COALESCE(status,'PENDING') = 'PENDING'` (case-sensitive).
- Varias funciones SQL insertaban eventos con `status = 'pending'` (lowercase), por lo que esos eventos **nunca** eran retornados por `get_pending_outbox_events` y quedaban “atascados”.

### Evidencia
- Inserción en POS (función usada por API): `supabase/migrations/140__fix_pos_function_ventas_pos.sql` insertaba `status 'pending'`.
- Inserción alternativa (schema `app`): `supabase/migrations/111__pos_tx_outbox.sql` insertaba `status 'pending'`.
- Inserciones legacy de pagos por lote: `supabase/migrations/021_*` y `supabase/migrations/037_*` (hoy ya no son la versión activa; ver `supabase/migrations/074__tesoreria_pago_outbox.sql`).

### Fix aplicado en repo
- `supabase/migrations/163__outbox_status_casefix.sql`:
  - Normaliza estados existentes a UPPERCASE (y mapea `processed` → `COMPLETED`).
  - Cambia `get_pending_outbox_events` a case-insensitive: `UPPER(COALESCE(status,'PENDING')) = 'PENDING'`.
  - Reemplaza `pos_registrar_venta_tx` (public) y `app.pos_registrar_venta_tx` para insertar `status = 'PENDING'`.

### Riesgo residual a cerrar (entorno)
- Ejecutar la migración 163 en la base real (staging/prod) para corregir eventos ya insertados con lowercase.

## 3) Idempotencia: deduplicación recomendada para integraciones

### Observación
- Ya existe uso de `idempotency_key` en flujos endurecidos (ej. CPE/GRE/CxC) y POS (schema `app`).
- `outbox_events` no tenía garantizado el índice único para esa llave a nivel de tabla.

### Fix aplicado en repo
- `supabase/migrations/163__outbox_status_casefix.sql`:
  - Asegura `outbox_events.idempotency_key` si faltaba.
  - Agrega índice único recomendado:
    - `outbox_events_tenant_event_idempotency_uidx (tenant_id, event_type, idempotency_key) WHERE idempotency_key IS NOT NULL`
- `supabase/migrations/164__pos_tx_idempotency_key.sql`:
  - Alinea POS (API) ↔ RPC: agrega `p_idempotency_key` y hace short‑circuit idempotente (si ya existe outbox con la misma llave, devuelve la venta existente sin mutar stock/numeración).

### Riesgo residual
- Si existen eventos duplicados históricos con la misma `idempotency_key`, la creación del índice podría fallar al aplicar la migración; se debe limpiar/normalizar antes (query de diagnóstico: agrupar por tenant_id/event_type/idempotency_key).

## 4) RLS y ejecución del worker

### Observación
- `outbox_events` tiene RLS por tenant (ver `supabase/migrations/059_create_outbox_events.sql`).
- El worker de API (`OutboxWorker`) procesa con `service_role` (via `SupabaseService`) y además cambia contexto por tenant para respetar RLS cuando aplica.

### Riesgo residual
- Si el cliente Supabase usado por el worker no es `service_role`, el acceso puede fallar por falta de `app.current_user_id` UUID válido en policies (cast a UUID).

## 5) Locks/reintentos (apps/worker)

### Observación
- `apps/worker/src/processors/outbox-processor.ts` usaba un lock Redis simple con `get + del` (no atómico).

### Fix aplicado en repo
- `apps/worker/src/processors/outbox-processor.ts`:
  - Lock key y TTL configurables: `OUTBOX_PROCESSOR_LOCK_KEY`, `OUTBOX_PROCESSOR_LOCK_TTL_MS`.
  - Unlock atómico por Lua (CAS).

## 6) Scripts útiles
- Verificación integridad outbox: `supabase/verify/verify_outbox_integrity.sql`
- Matriz de grants (incluye EXECUTE sobre RPCs): `supabase/verify/verify_grants_matrix.sql`
- Verificación exposición a `anon`: `supabase/verify/verify_anon_access.sql`
