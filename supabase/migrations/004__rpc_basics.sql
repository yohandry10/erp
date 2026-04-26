-- ============================================================================
-- 004__rpc_basics.sql
-- RPC base para compatibilidad operativa con backend/frontend.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Lock table para jobs distribuidos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.job_locks (
  lock_key text PRIMARY KEY,
  locked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Locks para background jobs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acquire_job_lock(
  p_lock_key text,
  p_lock_ttl_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  INSERT INTO app.job_locks(lock_key, locked_until)
  VALUES (p_lock_key, v_now + make_interval(secs => p_lock_ttl_seconds))
  ON CONFLICT (lock_key) DO UPDATE
    SET locked_until = EXCLUDED.locked_until
    WHERE app.job_locks.locked_until < v_now;

  RETURN EXISTS (
    SELECT 1
    FROM app.job_locks
    WHERE lock_key = p_lock_key
      AND locked_until >= v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job_lock(p_lock_key text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM app.job_locks WHERE lock_key = p_lock_key;
  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- Advisory locks para POS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acquire_pos_lock(p_tenant_id uuid, p_lock_key text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_try_advisory_lock(hashtext(COALESCE(p_tenant_id::text, '') || ':' || COALESCE(p_lock_key, '')));
$$;

CREATE OR REPLACE FUNCTION public.release_pos_lock(p_tenant_id uuid, p_lock_key text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT pg_advisory_unlock(hashtext(COALESCE(p_tenant_id::text, '') || ':' || COALESCE(p_lock_key, '')));
$$;

-- ----------------------------------------------------------------------------
-- Outbox helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_outbox_events(p_limit integer DEFAULT 100)
RETURNS SETOF public.outbox_events
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.outbox_events
  WHERE status IN ('pending', 'failed')
    AND (next_retry_at IS NULL OR next_retry_at <= now())
  ORDER BY created_at
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

CREATE OR REPLACE FUNCTION public.mark_outbox_event_processing(p_event_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.outbox_events
     SET status = 'processing',
         updated_at = now()
   WHERE id = p_event_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbox_event_completed(p_event_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.outbox_events
     SET status = 'completed',
         processed_at = now(),
         updated_at = now()
   WHERE id = p_event_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbox_event_failed(
  p_event_id uuid,
  p_error text DEFAULT NULL,
  p_next_retry_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.outbox_events
     SET status = 'failed',
         retry_count = COALESCE(retry_count, 0) + 1,
         error_message = p_error,
         next_retry_at = COALESCE(p_next_retry_at, now() + interval '5 minutes'),
         updated_at = now()
   WHERE id = p_event_id;
$$;

-- ----------------------------------------------------------------------------
-- Numeracion de documentos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_serie(
  p_tenant_id uuid,
  p_tipo_documento text,
  p_serie text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_actual integer;
  v_next integer;
BEGIN
  INSERT INTO public.documento_series(id, tenant_id, tipo_documento, serie, correlativo_actual, activo)
  VALUES (gen_random_uuid(), p_tenant_id, p_tipo_documento, p_serie, 0, true)
  ON CONFLICT DO NOTHING;

  SELECT correlativo_actual
    INTO v_actual
    FROM public.documento_series
   WHERE tenant_id = p_tenant_id
     AND tipo_documento = p_tipo_documento
     AND serie = p_serie
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  v_next := COALESCE(v_actual, 0) + 1;

  UPDATE public.documento_series
     SET correlativo_actual = v_next,
         updated_at = now()
   WHERE tenant_id = p_tenant_id
     AND tipo_documento = p_tipo_documento
     AND serie = p_serie;

  RETURN lpad(v_next::text, 8, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_siguiente_numero_documento(
  p_tenant_id uuid,
  p_tipo_documento text,
  p_serie text
)
RETURNS text
LANGUAGE sql
AS $$
  SELECT public.obtener_siguiente_numero_serie(p_tenant_id, p_tipo_documento, p_serie);
$$;

-- ----------------------------------------------------------------------------
-- POS transaccional (firma nueva)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_registrar_venta_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_cliente_id uuid DEFAULT NULL,
  p_cliente_documento text DEFAULT NULL,
  p_cliente_nombre text DEFAULT NULL,
  p_metodo_pago text DEFAULT 'efectivo',
  p_items jsonb DEFAULT '[]'::jsonb,
  p_serie text DEFAULT 'B001',
  p_sesion_caja_id uuid DEFAULT NULL,
  p_vendedor text DEFAULT NULL,
  p_max_descuento_pct numeric DEFAULT 0,
  p_idempotency_key text DEFAULT NULL,
  p_pagos jsonb DEFAULT NULL
)
RETURNS TABLE (
  venta_id uuid,
  numero_ticket text,
  subtotal numeric,
  impuestos numeric,
  total numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_igv numeric := 0;
  v_ticket text;
  v_venta_id uuid;
BEGIN
  SELECT COALESCE(SUM((i->>'subtotal')::numeric), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i;

  v_igv := round(v_subtotal * 0.18, 2);
  v_total := round(v_subtotal + v_igv, 2);
  v_ticket := to_char(now(), 'YYYYMMDDHH24MISSMS');

  INSERT INTO public.ventas_pos(
    id, tenant_id, cliente_id, cliente_documento, cliente_nombre,
    metodo_pago, sesion_caja_id, subtotal, total, cpe_pendiente,
    estado, numero_ticket, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), p_tenant_id, p_cliente_id, p_cliente_documento, p_cliente_nombre,
    p_metodo_pago, p_sesion_caja_id, v_subtotal, v_total, true,
    'PAGADA', v_ticket, now(), now()
  )
  RETURNING id INTO v_venta_id;

  INSERT INTO public.outbox_events(
    id, tenant_id, aggregate_type, aggregate_id, event_type,
    payload, status, idempotency_key, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(),
    p_tenant_id,
    'venta_pos',
    v_venta_id::text,
    'venta_pos.registrada',
    jsonb_build_object(
      'venta_id', v_venta_id,
      'cliente_id', p_cliente_id,
      'total', v_total,
      'metodo_pago', p_metodo_pago,
      'pagos', p_pagos
    ),
    'pending',
    p_idempotency_key,
    now(),
    now()
  );

  RETURN QUERY
  SELECT v_venta_id, v_ticket, v_subtotal, v_igv, v_total;
END;
$$;

-- Firma legacy (compatibilidad con payload antiguo sin idempotency/pagos)
CREATE OR REPLACE FUNCTION public.pos_registrar_venta_tx(
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_cliente_id uuid,
  p_cliente_documento text,
  p_cliente_nombre text,
  p_metodo_pago text,
  p_items jsonb,
  p_serie text,
  p_sesion_caja_id uuid,
  p_vendedor text,
  p_max_descuento_pct numeric
)
RETURNS TABLE (
  venta_id uuid,
  numero_ticket text,
  subtotal numeric,
  impuestos numeric,
  total numeric
)
LANGUAGE sql
AS $$
  SELECT *
  FROM public.pos_registrar_venta_tx(
    p_tenant_id,
    p_usuario_id,
    p_cliente_id,
    p_cliente_documento,
    p_cliente_nombre,
    p_metodo_pago,
    p_items,
    p_serie,
    p_sesion_caja_id,
    p_vendedor,
    p_max_descuento_pct,
    NULL,
    NULL
  );
$$;

-- ----------------------------------------------------------------------------
-- RPC de analitica / contabilidad (version base operativa)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calcular_balance_comprobacion(
  p_tenant_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS TABLE (
  codigo text,
  nombre text,
  debe numeric,
  haber numeric,
  saldo_deudor numeric,
  saldo_acreedor numeric
)
LANGUAGE sql
AS $$
  SELECT
    pc.codigo,
    pc.nombre,
    COALESCE(SUM(da.debe), 0) AS debe,
    COALESCE(SUM(da.haber), 0) AS haber,
    GREATEST(COALESCE(SUM(da.debe), 0) - COALESCE(SUM(da.haber), 0), 0) AS saldo_deudor,
    GREATEST(COALESCE(SUM(da.haber), 0) - COALESCE(SUM(da.debe), 0), 0) AS saldo_acreedor
  FROM public.plan_cuentas pc
  LEFT JOIN public.detalle_asientos da
    ON da.cuenta_id = pc.id
  LEFT JOIN public.asientos_contables ac
    ON ac.id = da.asiento_id
  WHERE pc.tenant_id = p_tenant_id
    AND (ac.fecha IS NULL OR ac.fecha::date BETWEEN p_fecha_inicio AND p_fecha_fin)
  GROUP BY pc.codigo, pc.nombre
  ORDER BY pc.codigo;
$$;

CREATE OR REPLACE FUNCTION public.get_asientos_por_tipo(p_tenant_id uuid)
RETURNS TABLE (
  tipo_asiento text,
  total_asientos bigint,
  total_debe numeric,
  total_haber numeric
)
LANGUAGE sql
AS $$
  SELECT
    COALESCE(tipo_asiento, 'SIN_TIPO') AS tipo_asiento,
    COUNT(*) AS total_asientos,
    COALESCE(SUM(total_debe), 0) AS total_debe,
    COALESCE(SUM(total_haber), 0) AS total_haber
  FROM public.asientos_contables
  WHERE tenant_id = p_tenant_id
  GROUP BY COALESCE(tipo_asiento, 'SIN_TIPO');
$$;

CREATE OR REPLACE FUNCTION public.get_resumen_financiero_mensual()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'cxc_pendiente', COALESCE((SELECT SUM(monto_pendiente) FROM public.cuentas_por_cobrar), 0),
    'cxp_pendiente', COALESCE((SELECT SUM(saldo_pendiente) FROM public.cuentas_por_pagar), 0),
    'saldo_bancos', COALESCE((SELECT SUM(saldo_actual) FROM public.cuentas_bancarias), 0),
    'fecha_corte', now()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_kpis_financieros()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'ventas_pos_total', COALESCE((SELECT SUM(total) FROM public.ventas_pos), 0),
    'movimientos_bancarios_total', COALESCE((SELECT SUM(monto) FROM public.movimientos_bancarios), 0),
    'asientos_contables_total', COALESCE((SELECT COUNT(*) FROM public.asientos_contables), 0),
    'fecha_corte', now()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_analisis_crecimiento()
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'ventas_mes_actual', COALESCE((SELECT SUM(total) FROM public.ventas_pos WHERE created_at >= date_trunc('month', now())), 0),
    'ventas_mes_anterior', COALESCE((SELECT SUM(total) FROM public.ventas_pos WHERE created_at >= date_trunc('month', now()) - interval '1 month' AND created_at < date_trunc('month', now())), 0),
    'fecha_corte', now()
  );
$$;

COMMIT;
