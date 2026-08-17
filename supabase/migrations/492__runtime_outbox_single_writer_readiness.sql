-- 492: contrato operativo único para outbox, readiness pasivo y notificaciones.
--
-- La API no puede depender de privilegios DML directos sobre outbox_events:
-- en una reconstrucción limpia service_role no los tenía, los workers leían un
-- lote vacío y /health/ready seguía respondiendo 200. Esta migración concentra
-- enqueue/claim/complete/fail/reset en RPCs SECURITY DEFINER, con claim token,
-- deja la tabla de outbox como sólo lectura para el backend y expone un
-- diagnóstico pasivo (sin pg_notify ni otras mutaciones).

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $requirements$
BEGIN
  IF to_regclass('public.outbox_events') IS NULL
     OR to_regclass('public.notificaciones') IS NULL
     OR to_regclass('public.usuarios_sistema') IS NULL THEN
    RAISE EXCEPTION '492 requiere outbox_events, notificaciones y usuarios_sistema';
  END IF;
END
$requirements$;

ALTER TABLE public.outbox_events
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_outbox_events_claimable_492
  ON public.outbox_events (created_at, id)
  WHERE lower(status::text) IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_outbox_events_processing_492
  ON public.outbox_events (last_heartbeat_at, claimed_at, updated_at)
  WHERE lower(status::text) = 'processing';

-- Enqueue idempotente. Un reuse de event_id/idempotency_key con otra intención
-- falla cerrado en vez de devolver silenciosamente el evento equivocado.
CREATE OR REPLACE FUNCTION public.enqueue_outbox_event_tx(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_tenant_id uuid := app.to_uuid_or_null(p_event->>'tenant_id');
  v_event_id uuid := coalesce(app.to_uuid_or_null(p_event->>'event_id'), gen_random_uuid());
  v_event_type text := btrim(coalesce(p_event->>'event_type', ''));
  v_aggregate_type text := btrim(coalesce(p_event->>'aggregate_type', ''));
  v_aggregate_id text := btrim(coalesce(p_event->>'aggregate_id', ''));
  v_payload jsonb := coalesce(p_event->'payload', '{}'::jsonb);
  v_idempotency_key text := nullif(btrim(coalesce(p_event->>'idempotency_key', '')), '');
  v_created_at timestamptz := coalesce(
    nullif(p_event->>'created_at', '')::timestamptz,
    clock_timestamp()
  );
  v_row public.outbox_events%ROWTYPE;
BEGIN
  IF v_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = v_tenant_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'OUTBOX_TENANT_INVALID';
  END IF;
  IF v_event_type = '' OR v_aggregate_type = '' OR v_aggregate_id = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OUTBOX_EVENT_IDENTITY_REQUIRED';
  END IF;
  IF jsonb_typeof(v_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OUTBOX_PAYLOAD_MUST_BE_OBJECT';
  END IF;

  BEGIN
    INSERT INTO public.outbox_events (
      event_id, tenant_id, aggregate_type, aggregate_id, event_type, payload,
      status, retry_count, next_retry_at, processed_at, error_message,
      idempotency_key, occurred_at, created_at, updated_at
    ) VALUES (
      v_event_id, v_tenant_id, v_aggregate_type, v_aggregate_id, v_event_type,
      v_payload || jsonb_build_object('tenantId', v_tenant_id, 'tenant_id', v_tenant_id),
      'pending', 0, NULL, NULL, NULL, v_idempotency_key,
      coalesce(nullif(p_event->>'occurred_at', '')::timestamptz, v_created_at),
      v_created_at, clock_timestamp()
    )
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    SELECT o.* INTO v_row
    FROM public.outbox_events o
    WHERE o.event_id = v_event_id
       OR (
         v_idempotency_key IS NOT NULL
         AND o.tenant_id = v_tenant_id
         AND o.event_type = v_event_type
         AND o.idempotency_key = v_idempotency_key
       )
    ORDER BY (o.event_id = v_event_id) DESC
    LIMIT 1;

    IF v_row.id IS NULL THEN RAISE; END IF;
    IF v_row.tenant_id IS DISTINCT FROM v_tenant_id
       OR v_row.event_type IS DISTINCT FROM v_event_type
       OR coalesce(v_row.aggregate_type, '') IS DISTINCT FROM v_aggregate_type
       OR coalesce(v_row.aggregate_id, '') IS DISTINCT FROM v_aggregate_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'OUTBOX_IDEMPOTENCY_INTENT_MISMATCH';
    END IF;

    RETURN jsonb_build_object(
      'id', v_row.id, 'event_id', v_row.event_id,
      'status', lower(v_row.status::text), 'idempotent', true
    );
  END;

  RETURN jsonb_build_object(
    'id', v_row.id, 'event_id', v_row.event_id,
    'status', lower(v_row.status::text), 'idempotent', false
  );
END
$function$;

-- El claim es el único paso que cambia pending/failed -> processing. SKIP
-- LOCKED y el token evitan que dos instancias completen el mismo claim.
DROP FUNCTION IF EXISTS public.claim_outbox_events_tx(text,integer,text[],uuid,integer);
CREATE OR REPLACE FUNCTION public.claim_outbox_events_tx(
  p_worker text,
  p_limit integer DEFAULT 100,
  p_event_types text[] DEFAULT NULL,
  p_excluded_event_types text[] DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_max_retries integer DEFAULT 5
)
RETURNS SETOF public.outbox_events
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
  WITH candidates AS MATERIALIZED (
    SELECT o.id
    FROM public.outbox_events o
    WHERE lower(o.status::text) IN ('pending', 'failed')
      AND (o.next_retry_at IS NULL OR o.next_retry_at <= clock_timestamp())
      AND coalesce(o.retry_count, 0) < greatest(coalesce(p_max_retries, 5), 1)
      AND (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
      AND (p_event_types IS NULL OR o.event_type = ANY(p_event_types))
      AND (p_excluded_event_types IS NULL OR NOT (o.event_type = ANY(p_excluded_event_types)))
      AND nullif(btrim(coalesce(p_worker, '')), '') IS NOT NULL
    ORDER BY o.created_at, o.id
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
  ), claimed AS (
    UPDATE public.outbox_events o
       SET status = 'processing',
           claimed_by = btrim(p_worker),
           claim_token = gen_random_uuid(),
           claimed_at = clock_timestamp(),
           last_heartbeat_at = clock_timestamp(),
           updated_at = clock_timestamp()
      FROM candidates c
     WHERE o.id = c.id
     RETURNING o.*
  )
  SELECT * FROM claimed ORDER BY created_at, id;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_outbox_event_tx(
  p_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  WITH touched AS (
    UPDATE public.outbox_events
       SET last_heartbeat_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE id = p_id
       AND lower(status::text) = 'processing'
       AND claim_token = p_claim_token
     RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM touched);
$function$;

CREATE OR REPLACE FUNCTION public.complete_outbox_event_tx(
  p_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  WITH completed AS (
    UPDATE public.outbox_events
       SET status = 'completed', processed_at = clock_timestamp(),
           error_message = NULL, next_retry_at = NULL,
           claim_token = NULL, last_heartbeat_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE id = p_id
       AND lower(status::text) = 'processing'
       AND claim_token = p_claim_token
     RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM completed);
$function$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event_tx(
  p_id uuid,
  p_claim_token uuid,
  p_error text,
  p_next_retry_at timestamptz DEFAULT NULL,
  p_max_retries integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_row public.outbox_events%ROWTYPE;
  v_retry_count integer;
  v_status text;
BEGIN
  SELECT * INTO v_row
  FROM public.outbox_events
  WHERE id = p_id AND lower(status::text) = 'processing' AND claim_token = p_claim_token
  FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'claim_mismatch');
  END IF;

  v_retry_count := coalesce(v_row.retry_count, 0) + 1;
  v_status := CASE
    WHEN v_retry_count >= greatest(coalesce(p_max_retries, 5), 1) THEN 'dead_letter'
    ELSE 'failed'
  END;

  UPDATE public.outbox_events
     SET status = v_status,
         retry_count = v_retry_count,
         error_message = left(coalesce(nullif(btrim(p_error), ''), 'OUTBOX_PROCESSING_FAILED'), 2000),
         next_retry_at = CASE WHEN v_status = 'failed' THEN coalesce(
           p_next_retry_at,
           clock_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ least(v_retry_count - 1, 7))::integer))
         ) ELSE NULL END,
         claim_token = NULL,
         last_heartbeat_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = p_id;

  RETURN jsonb_build_object('updated', true, 'status', v_status, 'retry_count', v_retry_count);
END
$function$;

CREATE OR REPLACE FUNCTION public.dead_letter_outbox_event_tx(
  p_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  WITH moved AS (
    UPDATE public.outbox_events
       SET status = 'dead_letter',
           retry_count = greatest(coalesce(retry_count, 0) + 1, 3),
           error_message = left(coalesce(nullif(btrim(p_error), ''), 'OUTBOX_UNHANDLED_EVENT'), 2000),
           next_retry_at = NULL, claim_token = NULL,
           last_heartbeat_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE id = p_id
       AND lower(status::text) = 'processing'
       AND claim_token = p_claim_token
     RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM moved);
$function$;

CREATE OR REPLACE FUNCTION public.reset_stuck_outbox_events_tx(
  p_stale_before timestamptz,
  p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  WITH candidates AS MATERIALIZED (
    SELECT id
    FROM public.outbox_events
    WHERE lower(status::text) = 'processing'
      AND coalesce(last_heartbeat_at, claimed_at, updated_at, created_at) < p_stale_before
    ORDER BY coalesce(last_heartbeat_at, claimed_at, updated_at, created_at), id
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit, 500), 1), 2000)
  ), reset AS (
    UPDATE public.outbox_events o
       SET status = 'pending', next_retry_at = NULL,
           error_message = 'OUTBOX_CLAIM_EXPIRED',
           claimed_by = NULL, claim_token = NULL, claimed_at = NULL,
           last_heartbeat_at = NULL, updated_at = clock_timestamp()
      FROM candidates c WHERE o.id = c.id
      RETURNING o.id
  )
  SELECT count(*)::integer FROM reset;
$function$;

CREATE OR REPLACE FUNCTION app.assert_outbox_tenant_actor_492(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_permission text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_super boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR nullif(btrim(p_permission), '') IS NULL THEN
    RAISE EXCEPTION 'OUTBOX_TENANT_ACTOR_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(u.is_super_admin, false)
    INTO v_super
  FROM public.usuarios_sistema u
  WHERE u.id = p_actor_id
    AND u.tenant_id = p_tenant_id
    AND coalesce(u.activo, false)
    AND lower(coalesce(u.estado::text, '')) = 'activo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OUTBOX_ACTOR_NOT_ACTIVE_IN_TENANT' USING ERRCODE = '42501';
  END IF;
  IF v_super THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id
     AND r.tenant_id = p_tenant_id
     AND coalesce(r.activo, true)
    JOIN public.rol_permisos rp
      ON rp.role_id = r.id
     AND coalesce(rp.concedido, true)
    JOIN public.permisos p
      ON p.id = rp.permiso_id
     AND p.tenant_id = p_tenant_id
     AND coalesce(p.activo, true)
    WHERE ur.usuario_sistema_id = p_actor_id
      AND ur.tenant_id = p_tenant_id
      AND lower(coalesce(p.codigo, p.modulo || '.' || p.recurso || '.' || p.accion)) = lower(p_permission)
  ) THEN
    RAISE EXCEPTION 'OUTBOX_PERMISSION_REQUIRED:%', p_permission USING ERRCODE = '42501';
  END IF;
END
$function$;

-- Ownership del worker contable. No reutilizar app.is_accounting_event_458:
-- ese helper decide si un evento bloquea un periodo contable, mientras que
-- este también incluye proyecciones operativas que sólo consume el listener
-- contable (por ejemplo, alertas/movimientos de stock).
CREATE OR REPLACE FUNCTION app.is_accounting_owned_outbox_event_492(
  p_event_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT lower(COALESCE(btrim(p_event_type), '')) = ANY (ARRAY[
    'venta.procesada','ventafacturada','pos.venta.registrada','caja.cerrada',
    'caja.movimiento_manual.registrado','caja.retiro.registrado',
    'caja.cambio_turno.completado','banco.movimiento.registrado',
    'banco.transferencia.registrada','cobro.registrado','cobroregistrado',
    'cobro.revertido','cxc.ajuste.registrado','cxcajusteregistrado',
    'cxc.ajuste.revertido','cxp.ajuste.registrado','nota_credito.emitida',
    'nota_debito.emitida','saldo_favor.aplicado','saldo_favor.reembolsado',
    'saldo_favor.reembolso_revertido','recepcion.registrada',
    'recepcionregistrada','factura.proveedor.registrada',
    'facturaproveedorregistrada','devolucion.proveedor.registrada',
    'devolucionproveedoremitida','cxc.creada','cuentaporcobrarcreada',
    'pago.proveedor.registrado','pagoproveedorregistrado',
    'ajuste.inventario.aplicado','ajusteinventarioaplicado',
    'planilla.liquidada','planillaliquidada','planilla.pagada','planillapagada',
    'liquidacion.aprobada','liquidacion.pagada','liquidacion.pago.revertido',
    'cts.depositado','depreciacion.generada','depreciaciongenerada',
    'cpe.anulado','cpeanulado','factura.emitida','facturaemitida',
    'producto.stock_bajo','producto.stock.bajo','productostockbajo',
    'stock.movimiento','stockmovimiento'
  ]::text[])
$function$;

DROP FUNCTION IF EXISTS public.reset_outbox_event_tx(uuid,text,integer);
CREATE OR REPLACE FUNCTION public.reset_outbox_event_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_event_id uuid,
  p_reason text DEFAULT 'MANUAL_RETRY',
  p_max_restarts integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_row public.outbox_events%ROWTYPE;
  v_restarts integer;
BEGIN
  PERFORM app.assert_outbox_tenant_actor_492(
    p_tenant_id, p_actor_id, 'contabilidad.eventos.reintentar'
  );

  SELECT * INTO v_row FROM public.outbox_events
  WHERE tenant_id = p_tenant_id
    AND event_id = p_event_id
    AND app.is_accounting_owned_outbox_event_492(event_type)
    AND lower(status::text) IN ('failed', 'dead_letter')
  FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'not_retryable');
  END IF;
  v_restarts := coalesce((v_row.payload->>'restart_count')::integer, 0);
  IF v_restarts >= greatest(coalesce(p_max_restarts, 3), 1) THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'restart_limit', 'restart_count', v_restarts);
  END IF;

  UPDATE public.outbox_events
     SET status = 'pending', retry_count = 0, error_message = NULL,
         processed_at = NULL, next_retry_at = NULL,
         claimed_by = NULL, claim_token = NULL, claimed_at = NULL,
         last_heartbeat_at = NULL,
         payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
           'restart_count', v_restarts + 1,
           'restart_reason', left(coalesce(nullif(btrim(p_reason), ''), 'MANUAL_RETRY'), 500),
           'restart_actor_id', p_actor_id
         ),
         updated_at = clock_timestamp()
   WHERE id = v_row.id;
  RETURN jsonb_build_object('updated', true, 'restart_count', v_restarts + 1);
END
$function$;

-- Superficie de administración usada por endpoints tenant-scoped. A diferencia
-- de list_outbox_events_492, nunca admite tenant NULL y valida al actor dentro
-- de PostgreSQL para que un uso accidental de service_role no cruce empresas.
DROP FUNCTION IF EXISTS public.list_tenant_outbox_events_492(uuid,uuid,text[],integer);
CREATE FUNCTION public.list_tenant_outbox_events_492(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_statuses text[] DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  event_type text,
  error_message text,
  retry_count integer,
  status text,
  created_at timestamptz,
  processed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
BEGIN
  PERFORM app.assert_outbox_tenant_actor_492(
    p_tenant_id, p_actor_id, 'contabilidad.reportes.read'
  );
  RETURN QUERY
  SELECT
    o.id,
    o.event_id,
    o.event_type::text,
    o.error_message,
    coalesce(o.retry_count, 0)::integer,
    o.status::text,
    o.created_at,
    o.processed_at
  FROM public.outbox_events o
  WHERE o.tenant_id = p_tenant_id
    AND app.is_accounting_owned_outbox_event_492(o.event_type)
    AND (p_statuses IS NULL OR lower(o.status::text) = ANY(
      ARRAY(SELECT lower(x) FROM unnest(p_statuses) AS x)
    ))
  ORDER BY o.created_at DESC, o.id DESC
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 1000);
END
$function$;

CREATE OR REPLACE FUNCTION public.outbox_tenant_stats_492(
  p_tenant_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM app.assert_outbox_tenant_actor_492(
    p_tenant_id, p_actor_id, 'contabilidad.reportes.read'
  );

  WITH scoped AS (
    SELECT lower(o.status::text) AS status, o.event_type, o.created_at, o.processed_at
    FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id
      AND app.is_accounting_owned_outbox_event_492(o.event_type)
  ), failed_by_type AS (
    SELECT event_type, count(*)::integer AS total
    FROM scoped
    WHERE status IN ('failed', 'dead_letter')
    GROUP BY event_type
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processed', count(*) FILTER (WHERE status IN ('processed', 'completed')),
    'processed_today', count(*) FILTER (
      WHERE status IN ('processed', 'completed')
        AND (processed_at AT TIME ZONE app.zona_horaria_pais(
          (SELECT t.pais FROM public.tenants t WHERE t.id = p_tenant_id)
        ))::date = app.hoy_tenant(p_tenant_id)
    ),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'dead_letter', count(*) FILTER (WHERE status = 'dead_letter'),
    'avg_processing_time_ms', round(avg(
      extract(epoch FROM (processed_at - created_at)) * 1000
    ) FILTER (
      WHERE status IN ('processed', 'completed')
        AND processed_at IS NOT NULL
        AND processed_at >= created_at
    )),
    'por_tipo', coalesce((
      SELECT jsonb_object_agg(f.event_type, f.total ORDER BY f.event_type)
      FROM failed_by_type f
    ), '{}'::jsonb)
  )
  INTO v_result
  FROM scoped;

  RETURN coalesce(v_result, jsonb_build_object(
    'pending', 0, 'processed', 0, 'processed_today', 0,
    'failed', 0, 'dead_letter', 0, 'avg_processing_time_ms', NULL,
    'por_tipo', '{}'::jsonb
  ));
END
$function$;

-- Lectura de administración y de conciliación contable. No reclama filas.
CREATE OR REPLACE FUNCTION public.list_outbox_events_492(
  p_tenant_id uuid DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_event_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_max_retries integer DEFAULT NULL
)
RETURNS SETOF public.outbox_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
  SELECT o.*
  FROM public.outbox_events o
  WHERE (p_tenant_id IS NULL OR o.tenant_id = p_tenant_id)
    AND (p_statuses IS NULL OR lower(o.status::text) = ANY(
      ARRAY(SELECT lower(x) FROM unnest(p_statuses) AS x)
    ))
    AND (p_event_type IS NULL OR o.event_type = p_event_type)
    AND (p_event_id IS NULL OR o.event_id = p_event_id)
    AND (p_max_retries IS NULL OR coalesce(o.retry_count, 0) < p_max_retries)
  ORDER BY o.created_at, o.id
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 1000);
$function$;

-- Proyección contable de nómina. El claim vigente es la autorización: no se
-- puede marcar una planilla con un evento ajeno, ya completado o reclamado por
-- otro worker, y el asiento durable debe existir antes de reflejar el flag.
CREATE OR REPLACE FUNCTION public.marcar_planilla_contabilizada_tx_492(
  p_tenant_id uuid,
  p_planilla_id uuid,
  p_event_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_asiento_id uuid;
  v_fecha_asiento timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_planilla_id IS NULL
     OR p_event_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PAYROLL_ACCOUNTING_PROJECTION_IDENTITY_REQUIRED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.outbox_events o
    WHERE o.tenant_id = p_tenant_id
      AND o.event_id = p_event_id
      AND o.event_type IN ('planilla.liquidada', 'PlanillaLiquidada')
      AND (
        o.aggregate_id = p_planilla_id::text
        OR o.payload->>'planillaId' = p_planilla_id::text
        OR o.payload->>'planilla_id' = p_planilla_id::text
      )
      AND lower(o.status::text) = 'processing'
      AND o.claim_token = p_claim_token
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PAYROLL_ACCOUNTING_OUTBOX_CLAIM_INVALID';
  END IF;

  SELECT a.id, coalesce(a.created_at, clock_timestamp())
    INTO v_asiento_id, v_fecha_asiento
  FROM public.asientos_contables a
  WHERE a.tenant_id = p_tenant_id
    AND a.source_event_id = p_event_id
    AND lower(a.estado::text) = 'confirmado'
    AND abs(coalesce(a.total_debe, 0) - coalesce(a.total_haber, 0)) <= 0.01
  ORDER BY a.created_at, a.id
  LIMIT 1;

  IF v_asiento_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PAYROLL_ACCOUNTING_ENTRY_NOT_FOUND';
  END IF;

  UPDATE public.planillas p
     SET asientos_generados = 'true',
         fecha_asientos = coalesce(p.fecha_asientos, v_fecha_asiento),
         updated_at = clock_timestamp()
   WHERE p.id = p_planilla_id
     AND p.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PAYROLL_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object(
    'updated', true,
    'planilla_id', p_planilla_id,
    'asiento_id', v_asiento_id,
    'event_id', p_event_id
  );
END
$function$;

-- Los writers RRHH históricos comparten la inserción bancaria como última
-- frontera antes de afectar saldo. Se limita el trigger a sus `source` para
-- no cambiar otros dominios: valida el mapping contable antes del movimiento
-- y congela la cuenta exacta en metadata. La reversa hereda el snapshot del
-- movimiento original, incluso si luego cambió la configuración del banco.
CREATE OR REPLACE FUNCTION app.freeze_rrhh_bank_ledger_492()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_source text := lower(btrim(coalesce(NEW.metadata->>'source', '')));
  v_account public.plan_cuentas%ROWTYPE;
  v_original public.movimientos_bancarios%ROWTYPE;
  v_original_account_id uuid;
  v_original_account_code text;
  v_uses_original_snapshot boolean := false;
BEGIN
  IF v_source NOT IN (
    'pagar_planilla_con_tesoreria_tx_495',
    'pagar_liquidacion_tx',
    'depositar_cts_tx',
    'revertir_pago_liquidacion_tx'
  ) THEN
    RETURN NEW;
  END IF;
  IF NEW.tenant_id IS NULL OR NEW.cuenta_bancaria_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RRHH_BANK_LEDGER_IDENTITY_REQUIRED';
  END IF;

  IF v_source = 'revertir_pago_liquidacion_tx' THEN
    IF NEW.movimiento_relacionado_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RRHH_BANK_REVERSAL_ORIGIN_REQUIRED';
    END IF;
    SELECT mb.* INTO v_original
    FROM public.movimientos_bancarios mb
    WHERE mb.id = NEW.movimiento_relacionado_id
      AND mb.tenant_id = NEW.tenant_id
      AND mb.cuenta_bancaria_id = NEW.cuenta_bancaria_id
      AND upper(coalesce(mb.tipo, '')) = 'CARGO';
    v_original_account_id := app.to_uuid_or_null(v_original.metadata->>'cuenta_contable_id');
    v_original_account_code := nullif(btrim(v_original.metadata->>'cuenta_contable_codigo'), '');
    IF v_original.id IS NULL OR v_original_account_id IS NULL
       OR v_original.metadata->>'ledger_frozen_by' <> '492' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RRHH_BANK_REVERSAL_LEDGER_SNAPSHOT_REQUIRED';
    END IF;
    SELECT pc.* INTO v_account
    FROM public.plan_cuentas pc
    WHERE pc.id = v_original_account_id AND pc.tenant_id = NEW.tenant_id;
    v_uses_original_snapshot := true;
  ELSE
    SELECT pc.* INTO v_account
    FROM public.cuentas_bancarias cb
    JOIN public.plan_cuentas pc
      ON pc.id = cb.cuenta_contable_id AND pc.tenant_id = cb.tenant_id
    WHERE cb.id = NEW.cuenta_bancaria_id
      AND cb.tenant_id = NEW.tenant_id
      AND coalesce(cb.activa, false)
      AND coalesce(cb.activo, false)
      AND upper(coalesce(cb.estado, '')) = 'ACTIVO'
      AND coalesce(pc.activo, false)
      AND lower(coalesce(pc.estado::text, '')) = 'activo'
      AND coalesce(pc.acepta_movimiento, false);
  END IF;

  IF v_account.id IS NULL OR v_account.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR (NOT v_uses_original_snapshot AND NOT coalesce(v_account.acepta_movimiento, false)) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RRHH_BANK_LEDGER_NOT_CONFIGURED';
  END IF;

  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'cuenta_contable_id', v_account.id,
    'cuenta_contable_codigo', coalesce(v_original_account_code, btrim(v_account.codigo)),
    'ledger_frozen_by', '492'
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_freeze_rrhh_bank_ledger_492 ON public.movimientos_bancarios;
CREATE TRIGGER trg_freeze_rrhh_bank_ledger_492
BEFORE INSERT ON public.movimientos_bancarios
FOR EACH ROW EXECUTE FUNCTION app.freeze_rrhh_bank_ledger_492();

CREATE OR REPLACE FUNCTION app.freeze_rrhh_cash_ledger_492()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_account public.plan_cuentas%ROWTYPE;
BEGIN
  IF lower(btrim(coalesce(NEW.metadata->>'source', '')))
       <> 'pagar_planilla_con_tesoreria_tx_495' THEN
    RETURN NEW;
  END IF;
  v_account := app.cash_account_10111_474(NEW.tenant_id);
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'cuenta_contable_id', v_account.id,
    'cuenta_contable_codigo', btrim(v_account.codigo),
    'ledger_frozen_by', '492'
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_freeze_rrhh_cash_ledger_492 ON public.movimientos_caja;
CREATE TRIGGER trg_freeze_rrhh_cash_ledger_492
BEFORE INSERT ON public.movimientos_caja
FOR EACH ROW EXECUTE FUNCTION app.freeze_rrhh_cash_ledger_492();

CREATE OR REPLACE FUNCTION app.freeze_rrhh_liquidation_cash_ledger_492()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_account public.plan_cuentas%ROWTYPE;
BEGIN
  IF lower(btrim(coalesce(NEW.metodo_pago, ''))) <> 'efectivo' THEN
    RETURN NEW;
  END IF;
  IF NEW.cuenta_bancaria_id IS NOT NULL OR NEW.movimiento_bancario_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LIQUIDATION_CASH_BANK_REFERENCES_FORBIDDEN';
  END IF;
  v_account := app.cash_account_10111_474(NEW.tenant_id);
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
    'cuenta_contable_id', v_account.id,
    'cuenta_contable_codigo', btrim(v_account.codigo),
    'ledger_frozen_by', '492'
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_freeze_rrhh_liquidation_cash_ledger_492
  ON public.pagos_liquidaciones;
CREATE TRIGGER trg_freeze_rrhh_liquidation_cash_ledger_492
BEFORE INSERT ON public.pagos_liquidaciones
FOR EACH ROW EXECUTE FUNCTION app.freeze_rrhh_liquidation_cash_ledger_492();

-- La clasificación de una liquidación se congela al publicar el evento. El
-- worker no vuelve a leer la fila mutable: beneficios sociales comprende CTS
-- e indemnización hasta el total, y el remanente conserva vacaciones/otros
-- conceptos remunerativos. Ambos componentes deben cerrar exactamente contra
-- el total que quedará por pagar en 411.
CREATE OR REPLACE FUNCTION app.freeze_liquidacion_components_492()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_liquidacion public.liquidaciones%ROWTYPE;
  v_liquidacion_id uuid;
  v_total numeric(14,2);
  v_cts numeric(14,2);
  v_indemnizacion numeric(14,2);
  v_beneficios numeric(14,2);
  v_remuneraciones_otros numeric(14,2);
BEGIN
  IF lower(coalesce(NEW.event_type, '')) <> 'liquidacion.aprobada' THEN
    RETURN NEW;
  END IF;

  v_liquidacion_id := coalesce(
    app.to_uuid_or_null(NEW.payload->>'liquidacionId'),
    app.to_uuid_or_null(NEW.payload->>'liquidacion_id'),
    app.to_uuid_or_null(NEW.aggregate_id)
  );
  IF NEW.tenant_id IS NULL OR v_liquidacion_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_SNAPSHOT_IDENTITY_REQUIRED';
  END IF;
  IF jsonb_typeof(coalesce(NEW.payload, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LABOR_SETTLEMENT_PAYLOAD_MUST_BE_OBJECT';
  END IF;

  SELECT l.* INTO v_liquidacion
  FROM public.liquidaciones l
  WHERE l.id = v_liquidacion_id AND l.tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_SNAPSHOT_SOURCE_NOT_FOUND';
  END IF;

  v_total := round(coalesce(v_liquidacion.total_liquidacion, 0), 2);
  v_cts := round(coalesce(v_liquidacion.monto_cts, 0), 2);
  v_indemnizacion := round(coalesce(v_liquidacion.indemnizacion, 0), 2);
  IF v_total <= 0 OR v_cts < 0 OR v_indemnizacion < 0
     OR v_cts + v_indemnizacion > v_total THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_COMPONENTS_INVALID';
  END IF;
  IF nullif(NEW.payload->>'totalLiquidacion', '') IS NOT NULL
     AND round(app.to_numeric_or_zero(NEW.payload->>'totalLiquidacion'), 2) IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_TOTAL_SNAPSHOT_MISMATCH';
  END IF;

  v_beneficios := least(v_total, round(v_cts + v_indemnizacion, 2));
  v_remuneraciones_otros := round(v_total - v_beneficios, 2);
  IF round(v_beneficios + v_remuneraciones_otros, 2) IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_COMPONENTS_UNBALANCED';
  END IF;

  NEW.aggregate_type := 'liquidacion';
  NEW.aggregate_id := v_liquidacion_id::text;
  NEW.payload := coalesce(NEW.payload, '{}'::jsonb) || jsonb_build_object(
    'liquidacionId', v_liquidacion_id,
    'totalLiquidacion', v_total,
    'componentesLiquidacion', jsonb_strip_nulls(jsonb_build_object(
      'version', 492,
      'montoCts', v_cts,
      'indemnizacion', v_indemnizacion,
      'beneficiosSociales', v_beneficios,
      'remuneracionesYOtros', v_remuneraciones_otros,
      'total', v_total,
      'vacacionesPendientesDias', v_liquidacion.vacaciones_pendientes,
      'montoVacacionesTruncas', v_liquidacion.metadata->'monto_vacaciones_truncas',
      'gratificacionTrunca', v_liquidacion.metadata->'gratificacion_trunca',
      'bonificacionExtraordinaria', v_liquidacion.metadata->'bonificacion_extraordinaria_9'
    )),
    'laborComponentsFrozenBy', '492'
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_freeze_liquidacion_components_492 ON public.outbox_events;
CREATE TRIGGER trg_freeze_liquidacion_components_492
BEFORE INSERT OR UPDATE OF event_type, payload, tenant_id, aggregate_id
ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.freeze_liquidacion_components_492();

-- Un upgrade puede encontrar eventos laborales publicados antes de que los
-- writers congelaran la cuenta contable. Se completa únicamente evidencia
-- 1:1. Si el movimiento, la cuenta o el vínculo de dominio no son inequívocos,
-- la migración aborta con el event_id: nunca se deja el problema para que el
-- worker lo convierta silenciosamente en dead-letter.
CREATE OR REPLACE FUNCTION app.freeze_legacy_bank_movement_492(
  p_tenant_id uuid,
  p_movement_id uuid,
  p_bank_id uuid,
  p_expected_type text,
  p_amount numeric,
  p_currency text,
  p_context text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_movement public.movimientos_bancarios%ROWTYPE;
  v_account public.plan_cuentas%ROWTYPE;
  v_account_id uuid;
  v_account_code text;
BEGIN
  SELECT mb.* INTO v_movement
  FROM public.movimientos_bancarios mb
  WHERE mb.id = p_movement_id
    AND mb.tenant_id = p_tenant_id
    AND mb.cuenta_bancaria_id = p_bank_id
    AND upper(coalesce(mb.tipo, '')) = upper(p_expected_type)
    AND round(coalesce(mb.monto_moneda_local, mb.monto, 0), 2) = round(p_amount, 2)
    AND upper(coalesce(mb.moneda, p_currency)) = upper(p_currency)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('OUTBOX_492_BACKFILL_BANK_EVIDENCE_INVALID:%s', p_context);
  END IF;

  v_account_id := app.to_uuid_or_null(v_movement.metadata->>'cuenta_contable_id');
  IF v_account_id IS NULL THEN
    -- El mapping actual del banco es mutable (477 permite cambiarlo), por lo
    -- que no demuestra qué cuenta regía al momento del pago histórico.
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('OUTBOX_492_BACKFILL_BANK_REGULARIZATION_REQUIRED:%s', p_context),
      DETAIL = 'El movimiento histórico no conserva cuenta_contable_id; no se puede inferir desde la configuración bancaria actual.';
  END IF;
  -- Un id ya persistido en el movimiento es evidencia histórica y prevalece
  -- sobre una reconfiguración posterior del banco o del plan de cuentas.
  SELECT pc.* INTO v_account
  FROM public.plan_cuentas pc
  WHERE pc.id = v_account_id AND pc.tenant_id = p_tenant_id;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('OUTBOX_492_BACKFILL_BANK_LEDGER_AMBIGUOUS:%s', p_context);
  END IF;

  v_account_code := coalesce(
    nullif(btrim(v_movement.metadata->>'cuenta_contable_codigo'), ''),
    nullif(btrim(v_account.codigo), '')
  );
  IF v_account_code IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('OUTBOX_492_BACKFILL_BANK_LEDGER_CODE_MISSING:%s', p_context);
  END IF;

  UPDATE public.movimientos_bancarios
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cuenta_contable_id', v_account.id,
        'cuenta_contable_codigo', v_account_code,
        'ledger_frozen_by', '492'
      ),
      updated_at = clock_timestamp()
  WHERE id = p_movement_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'cuenta_contable_id', v_account.id,
    'cuenta_contable_codigo', v_account_code
  );
END
$function$;

CREATE OR REPLACE FUNCTION app.freeze_legacy_cash_movement_492(
  p_tenant_id uuid,
  p_movement_id uuid,
  p_session_id uuid,
  p_planilla_id uuid,
  p_fingerprint text,
  p_amount numeric,
  p_currency text,
  p_context text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_movement public.movimientos_caja%ROWTYPE;
  v_account public.plan_cuentas%ROWTYPE;
  v_account_id uuid;
  v_account_code text;
BEGIN
  SELECT mc.* INTO v_movement
  FROM public.movimientos_caja mc
  JOIN public.sesiones_caja sc
    ON sc.id = mc.sesion_caja_id AND sc.tenant_id = mc.tenant_id
  WHERE mc.id = p_movement_id
    AND mc.tenant_id = p_tenant_id
    AND mc.sesion_caja_id = p_session_id
    AND upper(coalesce(sc.moneda, 'PEN')) = upper(p_currency)
    AND upper(coalesce(mc.tipo_movimiento, '')) = 'RETIRO'
    AND round(abs(coalesce(mc.monto, 0)), 2) = round(p_amount, 2)
    AND lower(btrim(coalesce(mc.referencia_tipo, ''))) = 'rrhh_planilla_pago'
    AND app.to_uuid_or_null(mc.referencia_documento) = p_planilla_id
    AND coalesce(app.to_uuid_or_null(mc.metadata->>'planilla_id'), p_planilla_id) = p_planilla_id
    AND coalesce(nullif(btrim(mc.metadata->>'fingerprint'), ''), p_fingerprint) = p_fingerprint
  FOR UPDATE OF mc;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('OUTBOX_492_BACKFILL_CASH_EVIDENCE_INVALID:%s', p_context);
  END IF;

  v_account_id := app.to_uuid_or_null(v_movement.metadata->>'cuenta_contable_id');
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('OUTBOX_492_BACKFILL_CASH_REGULARIZATION_REQUIRED:%s', p_context),
      DETAIL = 'El movimiento histórico no conserva cuenta_contable_id; no se puede inferir desde la configuración de caja actual.';
  END IF;
  SELECT pc.* INTO v_account
  FROM public.plan_cuentas pc
  WHERE pc.id = v_account_id AND pc.tenant_id = p_tenant_id;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('OUTBOX_492_BACKFILL_CASH_LEDGER_AMBIGUOUS:%s', p_context);
  END IF;
  v_account_code := coalesce(
    nullif(btrim(v_movement.metadata->>'cuenta_contable_codigo'), ''),
    nullif(btrim(v_account.codigo), '')
  );

  UPDATE public.movimientos_caja
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'planilla_id', p_planilla_id,
        'fingerprint', p_fingerprint,
        'cuenta_contable_id', v_account.id,
        'cuenta_contable_codigo', v_account_code,
        'ledger_frozen_by', '492'
      ),
      updated_at = clock_timestamp()
  WHERE id = p_movement_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'cuenta_contable_id', v_account.id,
    'cuenta_contable_codigo', v_account_code
  );
END
$function$;

CREATE OR REPLACE FUNCTION app.backfill_labor_outbox_492()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_event public.outbox_events%ROWTYPE;
  v_payment public.pagos_liquidaciones%ROWTYPE;
  v_deposit public.depositos_cts%ROWTYPE;
  v_original_snapshot jsonb;
  v_method text;
  v_currency text;
  v_amount numeric(14,2);
  v_planilla_id uuid;
  v_liquidation_id uuid;
  v_payment_id uuid;
  v_deposit_id uuid;
  v_bank_id uuid;
  v_bank_movement_id uuid;
  v_cash_session_id uuid;
  v_cash_movement_id uuid;
  v_fingerprint text;
  v_count integer := 0;
BEGIN
  FOR v_event IN
    SELECT o.*
    FROM public.outbox_events o
    WHERE lower(o.event_type) IN (
      'planilla.pagada', 'planillapagada', 'liquidacion.aprobada',
      'liquidacion.pagada', 'liquidacion.pago.revertido', 'cts.depositado'
    )
      AND lower(o.status::text) IN ('pending', 'failed', 'processing')
      AND NOT EXISTS (
        SELECT 1 FROM public.asientos_contables a
        WHERE a.tenant_id = o.tenant_id AND a.source_event_id = o.event_id
      )
    ORDER BY o.created_at, o.id
    FOR UPDATE
  LOOP
    IF lower(v_event.event_type) = 'liquidacion.aprobada' THEN
      -- El UPDATE dispara el normalizador de componentes también para claims
      -- que estaban processing cuando comenzó el upgrade.
      UPDATE public.outbox_events
      SET payload = coalesce(payload, '{}'::jsonb), updated_at = clock_timestamp()
      WHERE id = v_event.id;
      v_count := v_count + 1;
      CONTINUE;
    END IF;

    v_method := lower(btrim(coalesce(
      v_event.payload->>'metodoPago', v_event.payload->>'metodo_pago', ''
    )));
    v_currency := upper(btrim(coalesce(v_event.payload->>'moneda', 'PEN')));
    v_amount := round(coalesce(
      nullif(v_event.payload->>'totalPagado', '')::numeric,
      nullif(v_event.payload->>'total_pagado', '')::numeric,
      nullif(v_event.payload->>'montoRevertido', '')::numeric,
      nullif(v_event.payload->>'monto_revertido', '')::numeric,
      nullif(v_event.payload->>'totalDepositado', '')::numeric,
      nullif(v_event.payload->>'total_depositado', '')::numeric,
      0
    ), 2);
    IF v_event.tenant_id IS NULL OR v_event.event_id IS NULL
       OR v_amount <= 0 OR v_currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = format('OUTBOX_492_BACKFILL_EVENT_EVIDENCE_INCOMPLETE:%s', v_event.id);
    END IF;

    v_planilla_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'planillaId'),
      app.to_uuid_or_null(v_event.payload->>'planilla_id'),
      CASE WHEN lower(v_event.event_type) IN ('planilla.pagada', 'planillapagada')
        THEN app.to_uuid_or_null(v_event.aggregate_id) END
    );
    v_liquidation_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'liquidacionId'),
      app.to_uuid_or_null(v_event.payload->>'liquidacion_id')
    );
    v_payment_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'pagoId'),
      app.to_uuid_or_null(v_event.payload->>'pago_id')
    );
    v_deposit_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'depositoId'),
      app.to_uuid_or_null(v_event.payload->>'deposito_id')
    );
    v_bank_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'cuentaBancariaId'),
      app.to_uuid_or_null(v_event.payload->>'cuenta_bancaria_id')
    );
    v_bank_movement_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'movimientoBancarioId'),
      app.to_uuid_or_null(v_event.payload->>'movimiento_bancario_id')
    );
    v_cash_session_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'sesionCajaId'),
      app.to_uuid_or_null(v_event.payload->>'sesion_caja_id')
    );
    v_cash_movement_id := coalesce(
      app.to_uuid_or_null(v_event.payload->>'movimientoCajaId'),
      app.to_uuid_or_null(v_event.payload->>'movimiento_caja_id')
    );
    v_fingerprint := nullif(btrim(coalesce(
      v_event.payload->>'treasuryFingerprint',
      v_event.payload->>'treasury_fingerprint',
      v_event.payload->>'paymentFingerprint',
      v_event.payload->>'payment_fingerprint',
      ''
    )), '');

    IF lower(v_event.event_type) IN ('planilla.pagada', 'planillapagada') THEN
      IF v_planilla_id IS NULL OR v_fingerprint IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('OUTBOX_492_BACKFILL_PLANILLA_IDENTITY_INCOMPLETE:%s', v_event.id);
      END IF;
      IF v_method = 'transferencia' THEN
        IF v_bank_id IS NULL OR v_bank_movement_id IS NULL
           OR v_cash_session_id IS NOT NULL OR v_cash_movement_id IS NOT NULL
           OR NOT EXISTS (
             SELECT 1 FROM public.movimientos_bancarios mb
             WHERE mb.id = v_bank_movement_id AND mb.tenant_id = v_event.tenant_id
               AND app.to_uuid_or_null(mb.metadata->>'planilla_id') = v_planilla_id
               AND nullif(btrim(mb.metadata->>'fingerprint'), '') = v_fingerprint
           ) THEN
          RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = format('OUTBOX_492_BACKFILL_PLANILLA_BANK_AMBIGUOUS:%s', v_event.id);
        END IF;
        PERFORM app.freeze_legacy_bank_movement_492(
          v_event.tenant_id, v_bank_movement_id, v_bank_id, 'CARGO',
          v_amount, v_currency, v_event.id::text
        );
      ELSIF v_method = 'efectivo' THEN
        IF v_cash_session_id IS NULL OR v_cash_movement_id IS NULL
           OR v_bank_id IS NOT NULL OR v_bank_movement_id IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = format('OUTBOX_492_BACKFILL_PLANILLA_CASH_AMBIGUOUS:%s', v_event.id);
        END IF;
        PERFORM app.freeze_legacy_cash_movement_492(
          v_event.tenant_id, v_cash_movement_id, v_cash_session_id,
          v_planilla_id, v_fingerprint, v_amount, v_currency, v_event.id::text
        );
      ELSE
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('OUTBOX_492_BACKFILL_PLANILLA_METHOD_UNSUPPORTED:%s', v_event.id);
      END IF;
      UPDATE public.outbox_events
      SET payload = coalesce(payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'planillaId', v_planilla_id,
            'metodoPago', v_method,
            'treasuryFingerprint', v_fingerprint,
            'cuentaBancariaId', v_bank_id,
            'movimientoBancarioId', v_bank_movement_id,
            'sesionCajaId', v_cash_session_id,
            'movimientoCajaId', v_cash_movement_id,
            'accountingHandledByOutbox', true
          )),
          updated_at = clock_timestamp()
      WHERE id = v_event.id;

    ELSIF lower(v_event.event_type) = 'liquidacion.pagada' THEN
      SELECT p.* INTO v_payment
      FROM public.pagos_liquidaciones p
      WHERE p.tenant_id = v_event.tenant_id
        AND p.event_id = v_event.event_id
        AND (v_payment_id IS NULL OR p.id = v_payment_id)
        AND (v_liquidation_id IS NULL OR p.liquidacion_id = v_liquidation_id)
      FOR UPDATE;
      IF NOT FOUND OR round(v_payment.monto, 2) <> v_amount
         OR upper(v_payment.moneda) <> v_currency THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('OUTBOX_492_BACKFILL_LIQUIDATION_PAYMENT_AMBIGUOUS:%s', v_event.id);
      END IF;
      v_payment_id := v_payment.id;
      v_liquidation_id := v_payment.liquidacion_id;
      v_method := lower(v_payment.metodo_pago);
      v_bank_id := v_payment.cuenta_bancaria_id;
      v_bank_movement_id := v_payment.movimiento_bancario_id;
      IF v_method = 'transferencia' THEN
        IF v_bank_id IS NULL OR v_bank_movement_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.movimientos_bancarios mb
          WHERE mb.id = v_bank_movement_id AND mb.tenant_id = v_event.tenant_id
            AND app.to_uuid_or_null(mb.metadata->>'liquidacion_id') = v_liquidation_id
        ) THEN
          RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = format('OUTBOX_492_BACKFILL_LIQUIDATION_BANK_AMBIGUOUS:%s', v_event.id);
        END IF;
        PERFORM app.freeze_legacy_bank_movement_492(
          v_event.tenant_id, v_bank_movement_id, v_bank_id, 'CARGO',
          v_amount, v_currency, v_event.id::text
        );
      ELSIF v_method = 'efectivo' THEN
        IF app.to_uuid_or_null(v_payment.metadata->>'cuenta_contable_id') IS NULL
           OR v_payment.metadata->>'ledger_frozen_by' <> '492' THEN
          RAISE EXCEPTION USING ERRCODE = '23514',
            MESSAGE = format('OUTBOX_492_BACKFILL_LIQUIDATION_CASH_REGULARIZATION_REQUIRED:%s', v_event.id);
        END IF;
      ELSE
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('OUTBOX_492_BACKFILL_LIQUIDATION_METHOD_UNSUPPORTED:%s', v_event.id);
      END IF;
      UPDATE public.outbox_events
      SET payload = coalesce(payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
            'liquidacionId', v_liquidation_id,
            'pagoId', v_payment_id,
            'metodoPago', v_method,
            'cuentaBancariaId', v_bank_id,
            'movimientoBancarioId', v_bank_movement_id,
            'accountingHandledByOutbox', true
          )),
          updated_at = clock_timestamp()
      WHERE id = v_event.id;

    ELSIF lower(v_event.event_type) = 'liquidacion.pago.revertido' THEN
      SELECT p.* INTO v_payment
      FROM public.pagos_liquidaciones p
      WHERE p.tenant_id = v_event.tenant_id
        AND p.reversion_event_id = v_event.event_id
        AND (v_payment_id IS NULL OR p.id = v_payment_id)
        AND (v_liquidation_id IS NULL OR p.liquidacion_id = v_liquidation_id)
      FOR UPDATE;
      IF NOT FOUND OR round(v_payment.monto, 2) <> v_amount
         OR upper(v_payment.moneda) <> v_currency
         OR lower(v_payment.metodo_pago) <> 'transferencia'
         OR v_payment.cuenta_bancaria_id IS NULL
         OR v_payment.movimiento_bancario_id IS NULL
         OR v_payment.movimiento_reversion_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('OUTBOX_492_BACKFILL_REVERSAL_REGULARIZATION_REQUIRED:%s', v_event.id);
      END IF;
      v_payment_id := v_payment.id;
      v_liquidation_id := v_payment.liquidacion_id;
      v_method := 'transferencia';
      v_bank_id := v_payment.cuenta_bancaria_id;
      v_bank_movement_id := v_payment.movimiento_reversion_id;
      IF NOT EXISTS (
        SELECT 1 FROM public.movimientos_bancarios mb
        WHERE mb.id = v_payment.movimiento_bancario_id
          AND mb.tenant_id = v_event.tenant_id
          AND app.to_uuid_or_null(mb.metadata->>'liquidacion_id') = v_liquidation_id
      ) OR NOT EXISTS (
        SELECT 1 FROM public.movimientos_bancarios mb
        WHERE mb.id = v_bank_movement_id
          AND mb.tenant_id = v_event.tenant_id
          AND app.to_uuid_or_null(mb.metadata->>'pago_id') = v_payment_id
          AND mb.movimiento_relacionado_id = v_payment.movimiento_bancario_id
      ) OR (
        NOT EXISTS (
          SELECT 1 FROM public.asientos_contables a
          WHERE a.tenant_id = v_event.tenant_id AND a.source_event_id = v_payment.event_id
        ) AND NOT EXISTS (
          SELECT 1 FROM public.outbox_events original
          WHERE original.tenant_id = v_event.tenant_id
            AND original.event_id = v_payment.event_id
            AND lower(original.event_type) = 'liquidacion.pagada'
            AND lower(original.status::text) IN ('pending', 'failed', 'processing')
        )
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('OUTBOX_492_BACKFILL_REVERSAL_ORIGIN_AMBIGUOUS:%s', v_event.id);
      END IF;
      v_original_snapshot := app.freeze_legacy_bank_movement_492(
        v_event.tenant_id, v_payment.movimiento_bancario_id, v_bank_id, 'CARGO',
        v_amount, v_currency, v_event.id::text || ':origin'
      );
      UPDATE public.movimientos_bancarios
      SET metadata = coalesce(metadata, '{}'::jsonb) || v_original_snapshot
      WHERE id = v_bank_movement_id AND tenant_id = v_event.tenant_id;
      PERFORM app.freeze_legacy_bank_movement_492(
        v_event.tenant_id, v_bank_movement_id, v_bank_id, 'ABONO',
        v_amount, v_currency, v_event.id::text || ':reversal'
      );
      UPDATE public.outbox_events
      SET payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
            'liquidacionId', v_liquidation_id,
            'pagoId', v_payment_id,
            'metodoPago', v_method,
            'cuentaBancariaId', v_bank_id,
            'movimientoBancarioId', v_bank_movement_id,
            'accountingHandledByOutbox', true
          ),
          updated_at = clock_timestamp()
      WHERE id = v_event.id;

    ELSIF lower(v_event.event_type) = 'cts.depositado' THEN
      SELECT d.* INTO v_deposit
      FROM public.depositos_cts d
      WHERE d.tenant_id = v_event.tenant_id
        AND d.event_id = v_event.event_id
        AND (v_deposit_id IS NULL OR d.id = v_deposit_id)
      FOR UPDATE;
      IF NOT FOUND OR round(v_deposit.monto, 2) <> v_amount
         OR upper(v_deposit.moneda) <> v_currency
         OR v_deposit.cuenta_bancaria_id IS NULL
         OR v_deposit.movimiento_bancario_id IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM public.movimientos_bancarios mb
           WHERE mb.id = v_deposit.movimiento_bancario_id
             AND mb.tenant_id = v_event.tenant_id
             AND app.to_uuid_or_null(mb.metadata->>'deposito_cts_id') = v_deposit.id
         ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('OUTBOX_492_BACKFILL_CTS_AMBIGUOUS:%s', v_event.id);
      END IF;
      v_deposit_id := v_deposit.id;
      v_bank_id := v_deposit.cuenta_bancaria_id;
      v_bank_movement_id := v_deposit.movimiento_bancario_id;
      PERFORM app.freeze_legacy_bank_movement_492(
        v_event.tenant_id, v_bank_movement_id, v_bank_id, 'CARGO',
        v_amount, v_currency, v_event.id::text
      );
      UPDATE public.outbox_events
      SET payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
            'depositoId', v_deposit_id,
            'metodoPago', 'transferencia',
            'cuentaBancariaId', v_bank_id,
            'movimientoBancarioId', v_bank_movement_id,
            'accountingHandledByOutbox', true
          ),
          updated_at = clock_timestamp()
      WHERE id = v_event.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END
$function$;

SELECT app.backfill_labor_outbox_492();

-- La cuenta de tesorería de los eventos laborales se deriva de evidencia
-- durable, nunca de la cuenta genérica 10. El claim vigente evita que un
-- caller sustituya banco por caja, mezcle tenants o elija otra cuenta. Una
-- reversa de liquidación reutiliza la cuenta exacta del asiento del pago.
DROP FUNCTION IF EXISTS public.resolver_cuenta_tesoreria_planilla_492(uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION public.resolver_cuenta_tesoreria_laboral_492(
  p_tenant_id uuid,
  p_outbox_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_event public.outbox_events%ROWTYPE;
  v_account public.plan_cuentas%ROWTYPE;
  v_payment public.pagos_liquidaciones%ROWTYPE;
  v_deposit public.depositos_cts%ROWTYPE;
  v_event_type text;
  v_method text;
  v_planilla_id uuid;
  v_liquidation_id uuid;
  v_payment_id uuid;
  v_deposit_id uuid;
  v_bank_id uuid;
  v_bank_movement_id uuid;
  v_cash_session_id uuid;
  v_cash_movement_id uuid;
  v_amount numeric(14,2);
  v_currency text;
  v_fingerprint text;
  v_expected_bank_type text;
  v_original_account_count integer;
  v_uses_original_ledger boolean := false;
  v_uses_frozen_ledger boolean := false;
  v_frozen_account_code text;
BEGIN
  IF p_tenant_id IS NULL OR p_outbox_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PAYROLL_TREASURY_OUTBOX_IDENTITY_REQUIRED';
  END IF;

  SELECT o.* INTO v_event
  FROM public.outbox_events o
  WHERE o.id = p_outbox_id
    AND o.tenant_id = p_tenant_id
    AND o.event_type IN (
      'planilla.pagada', 'PlanillaPagada', 'liquidacion.pagada',
      'liquidacion.pago.revertido', 'cts.depositado'
    )
    AND lower(o.status::text) = 'processing'
    AND o.claim_token = p_claim_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PAYROLL_TREASURY_OUTBOX_CLAIM_INVALID';
  END IF;

  IF coalesce((v_event.payload->>'accountingHandledByOutbox')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PAYROLL_TREASURY_OUTBOX_CONTRACT_INVALID';
  END IF;

  v_event_type := lower(v_event.event_type);
  v_method := lower(btrim(coalesce(
    v_event.payload->>'metodoPago',
    v_event.payload->>'metodo_pago',
    ''
  )));
  v_planilla_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'planillaId'),
    app.to_uuid_or_null(v_event.payload->>'planilla_id'),
    app.to_uuid_or_null(v_event.aggregate_id)
  );
  v_liquidation_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'liquidacionId'),
    app.to_uuid_or_null(v_event.payload->>'liquidacion_id')
  );
  v_payment_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'pagoId'),
    app.to_uuid_or_null(v_event.payload->>'pago_id')
  );
  v_deposit_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'depositoId'),
    app.to_uuid_or_null(v_event.payload->>'deposito_id')
  );
  v_bank_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'cuentaBancariaId'),
    app.to_uuid_or_null(v_event.payload->>'cuenta_bancaria_id')
  );
  v_bank_movement_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'movimientoBancarioId'),
    app.to_uuid_or_null(v_event.payload->>'movimiento_bancario_id')
  );
  v_cash_session_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'sesionCajaId'),
    app.to_uuid_or_null(v_event.payload->>'sesion_caja_id')
  );
  v_cash_movement_id := coalesce(
    app.to_uuid_or_null(v_event.payload->>'movimientoCajaId'),
    app.to_uuid_or_null(v_event.payload->>'movimiento_caja_id')
  );
  v_amount := round(coalesce(
    nullif(v_event.payload->>'totalPagado', '')::numeric,
    nullif(v_event.payload->>'total_pagado', '')::numeric,
    nullif(v_event.payload->>'montoRevertido', '')::numeric,
    nullif(v_event.payload->>'monto_revertido', '')::numeric,
    nullif(v_event.payload->>'totalDepositado', '')::numeric,
    nullif(v_event.payload->>'total_depositado', '')::numeric,
    0
  ), 2);
  v_currency := upper(btrim(coalesce(v_event.payload->>'moneda', 'PEN')));
  v_fingerprint := nullif(btrim(coalesce(
    v_event.payload->>'treasuryFingerprint',
    v_event.payload->>'treasury_fingerprint',
    ''
  )), '');

  IF v_amount <= 0 OR v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PAYROLL_TREASURY_EVIDENCE_INCOMPLETE';
  END IF;

  IF v_event_type IN ('planilla.pagada', 'planillapagada') THEN
    IF v_planilla_id IS NULL OR v_fingerprint IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PAYROLL_TREASURY_EVIDENCE_INCOMPLETE';
    END IF;

    IF v_method = 'transferencia' THEN
      v_expected_bank_type := 'CARGO';
    ELSIF v_method = 'efectivo' THEN
      IF v_cash_session_id IS NULL OR v_cash_movement_id IS NULL
         OR v_bank_id IS NOT NULL OR v_bank_movement_id IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PAYROLL_TREASURY_CASH_REFERENCES_INVALID';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.movimientos_caja mc
        JOIN public.sesiones_caja sc
          ON sc.id = mc.sesion_caja_id
         AND sc.tenant_id = mc.tenant_id
        WHERE mc.id = v_cash_movement_id
          AND mc.tenant_id = p_tenant_id
          AND mc.sesion_caja_id = v_cash_session_id
          AND upper(coalesce(sc.moneda, 'PEN')) = v_currency
          AND upper(coalesce(mc.tipo_movimiento, '')) = 'RETIRO'
          AND round(abs(coalesce(mc.monto, 0)), 2) = v_amount
          AND lower(btrim(coalesce(mc.referencia_tipo, ''))) = 'rrhh_planilla_pago'
          AND app.to_uuid_or_null(mc.referencia_documento) = v_planilla_id
          AND app.to_uuid_or_null(mc.metadata->>'planilla_id') = v_planilla_id
          AND nullif(btrim(coalesce(mc.metadata->>'fingerprint', '')), '') = v_fingerprint
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PAYROLL_TREASURY_CASH_MOVEMENT_INVALID';
      END IF;
      SELECT pc.* INTO v_account
      FROM public.movimientos_caja mc
      JOIN public.plan_cuentas pc
        ON pc.id = app.to_uuid_or_null(mc.metadata->>'cuenta_contable_id')
       AND pc.tenant_id = mc.tenant_id
      WHERE mc.id = v_cash_movement_id AND mc.tenant_id = p_tenant_id
        AND mc.metadata->>'ledger_frozen_by' = '492';
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYROLL_TREASURY_CASH_LEDGER_SNAPSHOT_MISSING';
      END IF;
      SELECT nullif(btrim(mc.metadata->>'cuenta_contable_codigo'), '')
      INTO v_frozen_account_code
      FROM public.movimientos_caja mc WHERE mc.id = v_cash_movement_id;
      v_uses_frozen_ledger := true;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYROLL_TREASURY_METHOD_INVALID';
    END IF;
  ELSIF v_event_type = 'liquidacion.pagada' THEN
    IF v_liquidation_id IS NULL OR v_payment_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_PAYMENT_EVIDENCE_INCOMPLETE';
    END IF;
    SELECT p.* INTO v_payment
    FROM public.pagos_liquidaciones p
    WHERE p.id = v_payment_id
      AND p.tenant_id = p_tenant_id
      AND p.liquidacion_id = v_liquidation_id
      AND p.event_id = v_event.event_id
      AND round(coalesce(p.monto, 0), 2) = v_amount
      AND upper(coalesce(p.moneda, 'PEN')) = v_currency
      AND lower(coalesce(p.metodo_pago, '')) = v_method
      AND upper(coalesce(p.estado, '')) IN ('APLICADO', 'REVERTIDO');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_PAYMENT_EVIDENCE_INVALID';
    END IF;
    IF v_method = 'transferencia' THEN
      IF v_bank_id IS DISTINCT FROM v_payment.cuenta_bancaria_id
         OR v_bank_movement_id IS DISTINCT FROM v_payment.movimiento_bancario_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_BANK_REFERENCES_INVALID';
      END IF;
      v_expected_bank_type := 'CARGO';
    ELSIF v_method = 'efectivo' THEN
      IF v_bank_id IS NOT NULL OR v_bank_movement_id IS NOT NULL
         OR v_cash_session_id IS NOT NULL OR v_cash_movement_id IS NOT NULL
         OR v_payment.cuenta_bancaria_id IS NOT NULL OR v_payment.movimiento_bancario_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_CASH_REFERENCES_INVALID';
      END IF;
      SELECT pc.* INTO v_account
      FROM public.plan_cuentas pc
      WHERE pc.id = app.to_uuid_or_null(v_payment.metadata->>'cuenta_contable_id')
        AND pc.tenant_id = p_tenant_id
        AND v_payment.metadata->>'ledger_frozen_by' = '492';
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_CASH_LEDGER_SNAPSHOT_MISSING';
      END IF;
      v_frozen_account_code := nullif(btrim(v_payment.metadata->>'cuenta_contable_codigo'), '');
      v_uses_frozen_ledger := true;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYROLL_TREASURY_METHOD_INVALID';
    END IF;
  ELSIF v_event_type = 'liquidacion.pago.revertido' THEN
    IF v_liquidation_id IS NULL OR v_payment_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_REVERSAL_EVIDENCE_INCOMPLETE';
    END IF;
    SELECT p.* INTO v_payment
    FROM public.pagos_liquidaciones p
    WHERE p.id = v_payment_id
      AND p.tenant_id = p_tenant_id
      AND p.liquidacion_id = v_liquidation_id
      AND p.reversion_event_id = v_event.event_id
      AND upper(coalesce(p.estado, '')) = 'REVERTIDO'
      AND round(coalesce(p.monto, 0), 2) = v_amount
      AND upper(coalesce(p.moneda, 'PEN')) = v_currency
      AND lower(coalesce(p.metodo_pago, '')) = v_method;
    IF NOT FOUND OR v_payment.event_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_REVERSAL_EVIDENCE_INVALID';
    END IF;

    IF v_method = 'transferencia' THEN
      IF v_bank_id IS DISTINCT FROM v_payment.cuenta_bancaria_id
         OR v_bank_movement_id IS DISTINCT FROM v_payment.movimiento_reversion_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_REVERSAL_BANK_REFERENCES_INVALID';
      END IF;
      v_expected_bank_type := 'ABONO';
    ELSIF v_method = 'efectivo' THEN
      IF v_bank_id IS NOT NULL OR v_bank_movement_id IS NOT NULL
         OR v_cash_session_id IS NOT NULL OR v_cash_movement_id IS NOT NULL
         OR v_payment.cuenta_bancaria_id IS NOT NULL OR v_payment.movimiento_bancario_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_REVERSAL_CASH_REFERENCES_INVALID';
      END IF;
      v_frozen_account_code := nullif(btrim(v_payment.metadata->>'cuenta_contable_codigo'), '');
    ELSE
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'PAYROLL_TREASURY_METHOD_INVALID';
    END IF;

    SELECT count(*) INTO v_original_account_count
    FROM public.asientos_contables a
    JOIN public.detalle_asientos d
      ON d.asiento_id = a.id AND d.tenant_id = a.tenant_id
    JOIN public.plan_cuentas pc
      ON pc.id = d.cuenta_id AND pc.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND a.source_event_id = v_payment.event_id
      AND lower(a.estado::text) = 'confirmado'
      AND round(coalesce(d.debe, 0), 2) = 0
      AND round(coalesce(d.haber, 0), 2) = v_amount;
    IF v_original_account_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_ORIGINAL_LEDGER_AMBIGUOUS';
    END IF;
    SELECT pc.* INTO v_account
    FROM public.asientos_contables a
    JOIN public.detalle_asientos d
      ON d.asiento_id = a.id AND d.tenant_id = a.tenant_id
    JOIN public.plan_cuentas pc
      ON pc.id = d.cuenta_id AND pc.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND a.source_event_id = v_payment.event_id
      AND lower(a.estado::text) = 'confirmado'
      AND round(coalesce(d.debe, 0), 2) = 0
      AND round(coalesce(d.haber, 0), 2) = v_amount
    LIMIT 1;
    v_uses_original_ledger := true;
    v_uses_frozen_ledger := true;
  ELSIF v_event_type = 'cts.depositado' THEN
    v_method := 'transferencia';
    IF v_deposit_id IS NULL OR v_bank_id IS NULL OR v_bank_movement_id IS NULL
       OR v_cash_session_id IS NOT NULL OR v_cash_movement_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CTS_TREASURY_EVIDENCE_INCOMPLETE';
    END IF;
    SELECT d.* INTO v_deposit
    FROM public.depositos_cts d
    WHERE d.id = v_deposit_id
      AND d.tenant_id = p_tenant_id
      AND d.event_id = v_event.event_id
      AND d.cuenta_bancaria_id = v_bank_id
      AND d.movimiento_bancario_id = v_bank_movement_id
      AND upper(coalesce(d.estado, '')) = 'DEPOSITADO'
      AND round(coalesce(d.monto, 0), 2) = v_amount
      AND upper(coalesce(d.moneda, 'PEN')) = v_currency;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CTS_TREASURY_EVIDENCE_INVALID';
    END IF;
    v_expected_bank_type := 'CARGO';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_TREASURY_EVENT_UNSUPPORTED';
  END IF;

  IF v_expected_bank_type IS NOT NULL THEN
    IF v_bank_id IS NULL OR v_bank_movement_id IS NULL
       OR v_cash_session_id IS NOT NULL OR v_cash_movement_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PAYROLL_TREASURY_TRANSFER_REFERENCES_INVALID';
    END IF;

    IF v_uses_original_ledger THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.cuentas_bancarias cb
        JOIN public.movimientos_bancarios mb
          ON mb.id = v_bank_movement_id
         AND mb.tenant_id = cb.tenant_id
         AND mb.cuenta_bancaria_id = cb.id
        WHERE cb.id = v_bank_id
          AND cb.tenant_id = p_tenant_id
          AND upper(coalesce(cb.moneda, 'PEN')) = v_currency
          AND app.to_uuid_or_null(mb.metadata->>'cuenta_contable_id') = v_account.id
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'LABOR_SETTLEMENT_ORIGINAL_BANK_INVALID';
      END IF;
      SELECT nullif(btrim(mb.metadata->>'cuenta_contable_codigo'), '')
      INTO v_frozen_account_code
      FROM public.movimientos_bancarios mb
      WHERE mb.id = v_bank_movement_id AND mb.tenant_id = p_tenant_id;
    ELSE
      SELECT pc.* INTO v_account
      FROM public.cuentas_bancarias cb
      JOIN public.movimientos_bancarios mb
        ON mb.id = v_bank_movement_id
       AND mb.tenant_id = cb.tenant_id
       AND mb.cuenta_bancaria_id = cb.id
      JOIN public.plan_cuentas pc
        ON pc.id = app.to_uuid_or_null(mb.metadata->>'cuenta_contable_id')
       AND pc.tenant_id = mb.tenant_id
      WHERE cb.id = v_bank_id
        AND cb.tenant_id = p_tenant_id
        AND upper(coalesce(mb.moneda, v_currency)) = v_currency
        AND mb.metadata->>'ledger_frozen_by' = '492';
      IF NOT FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PAYROLL_TREASURY_BANK_LEDGER_INVALID';
      END IF;
      SELECT nullif(btrim(mb.metadata->>'cuenta_contable_codigo'), '')
      INTO v_frozen_account_code
      FROM public.movimientos_bancarios mb
      WHERE mb.id = v_bank_movement_id AND mb.tenant_id = p_tenant_id;
      v_uses_frozen_ledger := true;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.movimientos_bancarios mb
      WHERE mb.id = v_bank_movement_id
        AND mb.tenant_id = p_tenant_id
        AND mb.cuenta_bancaria_id = v_bank_id
        AND upper(coalesce(mb.tipo, '')) = v_expected_bank_type
        AND round(coalesce(mb.monto_moneda_local, mb.monto, 0), 2) = v_amount
        AND upper(coalesce(mb.moneda, v_currency)) = v_currency
        AND CASE v_event_type
          WHEN 'planilla.pagada' THEN
            upper(coalesce(mb.metodo_pago, '')) = 'TRANSFERENCIA'
            AND app.to_uuid_or_null(mb.metadata->>'planilla_id') = v_planilla_id
            AND nullif(btrim(coalesce(mb.metadata->>'fingerprint', '')), '') = v_fingerprint
          WHEN 'planillapagada' THEN
            upper(coalesce(mb.metodo_pago, '')) = 'TRANSFERENCIA'
            AND app.to_uuid_or_null(mb.metadata->>'planilla_id') = v_planilla_id
            AND nullif(btrim(coalesce(mb.metadata->>'fingerprint', '')), '') = v_fingerprint
          WHEN 'liquidacion.pagada' THEN
            app.to_uuid_or_null(mb.metadata->>'liquidacion_id') = v_liquidation_id
          WHEN 'liquidacion.pago.revertido' THEN
            app.to_uuid_or_null(mb.metadata->>'pago_id') = v_payment_id
            AND mb.movimiento_relacionado_id = v_payment.movimiento_bancario_id
          WHEN 'cts.depositado' THEN
            app.to_uuid_or_null(mb.metadata->>'deposito_cts_id') = v_deposit_id
          ELSE false
        END
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PAYROLL_TREASURY_BANK_MOVEMENT_INVALID';
    END IF;
  END IF;

  IF v_account.id IS NULL OR v_account.tenant_id IS DISTINCT FROM p_tenant_id
     OR (NOT v_uses_frozen_ledger AND NOT coalesce(v_account.acepta_movimiento, false)) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PAYROLL_TREASURY_LEDGER_NOT_POSTABLE';
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'metodo_pago', v_method,
    'cuenta_tesoreria_id', v_account.id,
    'cuenta_tesoreria_codigo', coalesce(v_frozen_account_code, btrim(v_account.codigo)),
    'planilla_id', v_planilla_id,
    'liquidacion_id', v_liquidation_id,
    'pago_id', v_payment_id,
    'deposito_id', v_deposit_id,
    'cuenta_bancaria_id', v_bank_id,
    'movimiento_bancario_id', v_bank_movement_id,
    'sesion_caja_id', v_cash_session_id,
    'movimiento_caja_id', v_cash_movement_id,
    'moneda', v_currency,
    'monto', v_amount
  ));
END
$function$;

-- Readiness exclusivamente pasivo: valida contrato, privilegios, versión de
-- esquema aplicada por Supabase y backlog. La firma anterior se elimina para
-- que PostgREST no pueda resolver ambiguamente una llamada por argumentos.
DROP FUNCTION IF EXISTS public.outbox_runtime_health_492(integer,integer,integer,integer);
DROP FUNCTION IF EXISTS public.outbox_runtime_health_492(integer,integer,integer,integer,integer);
CREATE OR REPLACE FUNCTION public.outbox_runtime_health_492(
  p_max_claimable integer DEFAULT 5000,
  p_max_oldest_seconds integer DEFAULT 900,
  p_max_dead_letter integer DEFAULT 100,
  p_processing_stale_seconds integer DEFAULT 900,
  p_required_schema_version integer DEFAULT 492
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, pg_temp
AS $function$
DECLARE
  v_claimable bigint;
  v_failed bigint;
  v_processing bigint;
  v_stale bigint;
  v_dead bigint;
  v_oldest_seconds bigint;
  v_missing_reads text[] := '{}'::text[];
  v_table text;
  v_rpc_ready boolean;
  v_schema_history_available boolean;
  v_schema_version integer;
  v_required_schema_applied boolean;
  v_ready boolean;
BEGIN
  SELECT
    count(*) FILTER (WHERE lower(status::text) IN ('pending','failed') AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp())),
    count(*) FILTER (WHERE lower(status::text) = 'failed'),
    count(*) FILTER (WHERE lower(status::text) = 'processing'),
    count(*) FILTER (
      WHERE lower(status::text) = 'processing'
        AND coalesce(last_heartbeat_at, claimed_at, updated_at, created_at)
          < clock_timestamp() - make_interval(secs => greatest(p_processing_stale_seconds, 1))
    ),
    count(*) FILTER (WHERE lower(status::text) = 'dead_letter'),
    coalesce(extract(epoch FROM clock_timestamp() - min(created_at) FILTER (
      WHERE lower(status::text) IN ('pending','failed') AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp())
    ))::bigint, 0)
  INTO v_claimable, v_failed, v_processing, v_stale, v_dead, v_oldest_seconds
  FROM public.outbox_events;

  FOREACH v_table IN ARRAY ARRAY[
    'outbox_events','notificaciones','sesiones_caja','cpe','planillas',
    'empleados','cuentas_bancarias'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL
       AND NOT has_table_privilege('service_role', 'public.' || v_table, 'SELECT') THEN
      v_missing_reads := array_append(v_missing_reads, v_table);
    END IF;
  END LOOP;

  v_rpc_ready :=
    has_function_privilege('service_role', 'public.enqueue_outbox_event_tx(jsonb)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.claim_outbox_events_tx(text,integer,text[],text[],uuid,integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.heartbeat_outbox_event_tx(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.complete_outbox_event_tx(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.fail_outbox_event_tx(uuid,uuid,text,timestamptz,integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.dead_letter_outbox_event_tx(uuid,uuid,text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.reset_stuck_outbox_events_tx(timestamptz,integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.reset_outbox_event_tx(uuid,uuid,uuid,text,integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.list_outbox_events_492(uuid,text[],text,uuid,integer,integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.list_tenant_outbox_events_492(uuid,uuid,text[],integer)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.outbox_tenant_stats_492(uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.marcar_planilla_contabilizada_tx_492(uuid,uuid,uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.resolver_cuenta_tesoreria_laboral_492(uuid,uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.gestionar_notificacion_tx(uuid,uuid,text,jsonb)', 'EXECUTE');

  v_schema_history_available :=
    to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;
  v_schema_version := NULL;
  v_required_schema_applied := p_required_schema_version <= 0;

  IF v_schema_history_available THEN
    EXECUTE $sql$
      SELECT
        max(CASE
          WHEN version ~ '^[0-9]{1,9}$' THEN version::integer
          ELSE NULL
        END),
        bool_or(CASE
          WHEN version ~ '^[0-9]{1,9}$' THEN version::integer = $1
          ELSE false
        END)
      FROM supabase_migrations.schema_migrations
    $sql$
    INTO v_schema_version, v_required_schema_applied
    USING p_required_schema_version;
    v_required_schema_applied := p_required_schema_version <= 0
      OR coalesce(v_required_schema_applied, false);
  END IF;

  v_ready := v_rpc_ready
    AND cardinality(v_missing_reads) = 0
    AND v_required_schema_applied
    AND v_claimable <= greatest(p_max_claimable, 0)
    AND v_oldest_seconds <= greatest(p_max_oldest_seconds, 0)
    AND v_dead <= greatest(p_max_dead_letter, 0)
    AND v_stale = 0;

  RETURN jsonb_build_object(
    'ready', v_ready,
    'database', 'ok',
    'contract', jsonb_build_object(
      'outbox_rpcs', v_rpc_ready,
      'service_role_reads', cardinality(v_missing_reads) = 0,
      'missing_service_role_reads', to_jsonb(v_missing_reads),
      'schema_history_available', v_schema_history_available,
      'schema_version', v_schema_version,
      'required_schema_version', p_required_schema_version,
      'required_schema_applied', v_required_schema_applied
    ),
    'backlog', jsonb_build_object(
      'claimable', v_claimable,
      'failed', v_failed,
      'processing', v_processing,
      'stale_processing', v_stale,
      'dead_letter', v_dead,
      'oldest_claimable_seconds', v_oldest_seconds,
      'limits', jsonb_build_object(
        'max_claimable', p_max_claimable,
        'max_oldest_seconds', p_max_oldest_seconds,
        'max_dead_letter', p_max_dead_letter,
        'processing_stale_seconds', p_processing_stale_seconds
      )
    )
  );
END
$function$;

-- Writer único de notificaciones. Las decisiones de RBAC/propiedad se hacen en
-- la capa de aplicación y la frontera SQL vuelve a fijar tenant/actor.
CREATE OR REPLACE FUNCTION public.gestionar_notificacion_tx(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_operacion text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, app, extensions, pg_temp
AS $function$
DECLARE
  v_operacion text := upper(btrim(coalesce(p_operacion, '')));
  v_notification_id uuid := app.to_uuid_or_null(p_payload->>'notification_id');
  v_usuario_id uuid := app.to_uuid_or_null(p_payload->>'usuario_id');
  v_roles uuid[] := ARRAY(
    SELECT app.to_uuid_or_null(value)
    FROM jsonb_array_elements_text(coalesce(p_payload->'roles_destinatarios', '[]'::jsonb)) AS value
    WHERE app.to_uuid_or_null(value) IS NOT NULL
  );
  v_row public.notificaciones%ROWTYPE;
  v_count integer;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'NOTIFICATION_TENANT_INVALID';
  END IF;
  IF p_actor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_sistema u
    WHERE u.id = p_actor_id AND u.tenant_id = p_tenant_id AND coalesce(u.activo, true)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'NOTIFICATION_ACTOR_INVALID';
  END IF;

  IF v_operacion = 'CREATE' THEN
    INSERT INTO public.notificaciones (
      tenant_id, usuario_id, roles_destinatarios, tipo, severidad,
      titulo, mensaje, action_url, action_label, leida, created_at
    ) VALUES (
      p_tenant_id, v_usuario_id, coalesce(v_roles, '{}'::uuid[]),
      nullif(btrim(p_payload->>'tipo'), ''),
      coalesce(nullif(btrim(p_payload->>'severidad'), ''), 'info'),
      nullif(btrim(p_payload->>'titulo'), ''),
      nullif(btrim(p_payload->>'mensaje'), ''),
      nullif(btrim(p_payload->>'action_url'), ''),
      nullif(btrim(p_payload->>'action_label'), ''),
      false, clock_timestamp()
    ) RETURNING * INTO v_row;
    RETURN to_jsonb(v_row);
  ELSIF v_operacion = 'MARK_READ' THEN
    UPDATE public.notificaciones
       SET leida = true, leida_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE id = v_notification_id AND tenant_id = p_tenant_id
     RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NOTIFICATION_NOT_FOUND';
    END IF;
    RETURN to_jsonb(v_row);
  ELSIF v_operacion = 'MARK_ALL_READ' THEN
    UPDATE public.notificaciones
       SET leida = true, leida_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE tenant_id = p_tenant_id AND coalesce(leida, false) = false
       AND (v_usuario_id IS NULL OR usuario_id = v_usuario_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('updated_count', v_count);
  ELSIF v_operacion = 'DELETE' THEN
    DELETE FROM public.notificaciones
     WHERE id = v_notification_id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NOTIFICATION_NOT_FOUND';
    END IF;
    RETURN jsonb_build_object('deleted', true);
  END IF;

  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'NOTIFICATION_OPERATION_INVALID';
END
$function$;

-- La API puede consultar estas dos superficies. Toda mutación queda reservada
-- a las RPC anteriores; no se reabre DML directo a service_role.
REVOKE ALL ON TABLE public.outbox_events, public.notificaciones
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.outbox_events, public.notificaciones TO service_role;

-- Matriz mínima de lectura del backend en una reconstrucción limpia. No abre
-- writers: cualquier DML de estas superficies sigue pasando por su RPC de
-- dominio (492/493/494/495 y contratos anteriores).
DO $service_read_matrix$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'sesiones_caja','cpe','planillas','empleados','cuentas_bancarias'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM service_role',
        v_table
      );
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', v_table);
    END IF;
  END LOOP;
END
$service_read_matrix$;

REVOKE ALL ON FUNCTION
  public.enqueue_outbox_event_tx(jsonb),
  public.claim_outbox_events_tx(text,integer,text[],text[],uuid,integer),
  public.heartbeat_outbox_event_tx(uuid,uuid),
  public.complete_outbox_event_tx(uuid,uuid),
  public.fail_outbox_event_tx(uuid,uuid,text,timestamptz,integer),
  public.dead_letter_outbox_event_tx(uuid,uuid,text),
  public.reset_stuck_outbox_events_tx(timestamptz,integer),
  public.reset_outbox_event_tx(uuid,uuid,uuid,text,integer),
  public.list_outbox_events_492(uuid,text[],text,uuid,integer,integer),
  public.list_tenant_outbox_events_492(uuid,uuid,text[],integer),
  public.outbox_tenant_stats_492(uuid,uuid),
  public.marcar_planilla_contabilizada_tx_492(uuid,uuid,uuid,uuid),
  public.resolver_cuenta_tesoreria_laboral_492(uuid,uuid,uuid),
  public.outbox_runtime_health_492(integer,integer,integer,integer,integer),
  public.gestionar_notificacion_tx(uuid,uuid,text,jsonb)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION app.freeze_rrhh_bank_ledger_492()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.assert_outbox_tenant_actor_492(uuid,uuid,text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.is_accounting_owned_outbox_event_492(text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.freeze_rrhh_cash_ledger_492()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.freeze_rrhh_liquidation_cash_ledger_492()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.freeze_liquidacion_components_492()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.freeze_legacy_bank_movement_492(uuid,uuid,uuid,text,numeric,text,text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.freeze_legacy_cash_movement_492(uuid,uuid,uuid,uuid,text,numeric,text,text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app.backfill_labor_outbox_492()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.enqueue_outbox_event_tx(jsonb),
  public.claim_outbox_events_tx(text,integer,text[],text[],uuid,integer),
  public.heartbeat_outbox_event_tx(uuid,uuid),
  public.complete_outbox_event_tx(uuid,uuid),
  public.fail_outbox_event_tx(uuid,uuid,text,timestamptz,integer),
  public.dead_letter_outbox_event_tx(uuid,uuid,text),
  public.reset_stuck_outbox_events_tx(timestamptz,integer),
  public.reset_outbox_event_tx(uuid,uuid,uuid,text,integer),
  public.list_outbox_events_492(uuid,text[],text,uuid,integer,integer),
  public.list_tenant_outbox_events_492(uuid,uuid,text[],integer),
  public.outbox_tenant_stats_492(uuid,uuid),
  public.marcar_planilla_contabilizada_tx_492(uuid,uuid,uuid,uuid),
  public.resolver_cuenta_tesoreria_laboral_492(uuid,uuid,uuid),
  public.outbox_runtime_health_492(integer,integer,integer,integer,integer),
  public.gestionar_notificacion_tx(uuid,uuid,text,jsonb)
TO service_role;

-- Los helpers históricos sin claim dejan de ser una segunda frontera de
-- escritura. Se conservan para compatibilidad de catálogo, pero nadie del API
-- puede ejecutarlos después de 492.
REVOKE ALL ON FUNCTION public.mark_outbox_event_processing(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_outbox_event_completed(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_outbox_event_failed(uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.outbox_runtime_health_492(integer,integer,integer,integer,integer) IS
  'Diagnóstico pasivo de DB, versión aplicada, ACL/RPC y backlog; no notifica ni modifica filas.';
COMMENT ON FUNCTION public.claim_outbox_events_tx(text,integer,text[],text[],uuid,integer) IS
  'Claim atómico SKIP LOCKED con token; única transición pending/failed -> processing.';

COMMIT;
