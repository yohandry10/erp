-- ============================================================================
-- 130__cxc_pagos_lotes_validation_pack.sql
-- Pack de validación runtime para cxc_pagos y pagos_lote.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cxc_pagos_lotes_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_count bigint;
BEGIN
  -- Triggers runtime
  RETURN QUERY
  SELECT
    'trigger_normalize_cxc_pagos_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cxc_pagos'
        AND t.tgname = 'trg_normalize_cxc_pagos_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de cxc_pagos';

  RETURN QUERY
  SELECT
    'trigger_enforce_cxc_pagos_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cxc_pagos'
        AND t.tgname = 'trg_enforce_cxc_pagos_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en cxc_pagos';

  RETURN QUERY
  SELECT
    'trigger_normalize_pagos_lote_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pagos_lote'
        AND t.tgname = 'trg_normalize_pagos_lote_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de pagos_lote';

  RETURN QUERY
  SELECT
    'trigger_enforce_pagos_lote_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pagos_lote'
        AND t.tgname = 'trg_enforce_pagos_lote_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en pagos_lote';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'cxc_pagos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 20
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cxc_pagos'
        AND c.column_name IN (
          'tenant_id', 'cuenta_id', 'pedido_id', 'documento_id',
          'monto', 'moneda', 'fecha_pago', 'metodo_pago', 'referencia',
          'notas', 'tipo', 'aplica_retencion', 'retencion_monto',
          'retencionmonto', 'usuario_id', 'cuenta_bancaria_id',
          'event_id', 'idempotency_key', 'source', 'activo'
        )
    ),
    'columnas runtime de cxc_pagos';

  RETURN QUERY
  SELECT
    'pagos_lote_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pagos_lote'
        AND c.column_name IN (
          'tenant_id', 'referencia_lote', 'cuenta_bancaria_id', 'fecha_pago',
          'metodo_pago', 'monto_total', 'pagos', 'resultado', 'activo'
        )
    ),
    'columnas runtime de pagos_lote';

  -- FKs esperadas para embeds/joins.
  RETURN QUERY
  SELECT
    'fk_cxc_pagos_cuenta_id_fkey_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cxc_pagos_cuenta_id_fkey'
        AND conrelid = 'public.cxc_pagos'::regclass
    ),
    'FK de cxc_pagos a cuentas_por_cobrar';

  RETURN QUERY
  SELECT
    'fk_cxc_pagos_cuenta_bancaria_id_fkey_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'cxc_pagos_cuenta_bancaria_id_fkey'
        AND conrelid = 'public.cxc_pagos'::regclass
    ),
    'FK de cxc_pagos a cuentas_bancarias';

  RETURN QUERY
  SELECT
    'fk_pagos_lote_cuenta_bancaria_id_fkey_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'pagos_lote_cuenta_bancaria_id_fkey'
        AND conrelid = 'public.pagos_lote'::regclass
    ),
    'FK de pagos_lote a cuentas_bancarias';

  -- Índices de soporte.
  RETURN QUERY
  SELECT
    'ux_cxc_pagos_tenant_cuenta_referencia_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cxc_pagos'
        AND indexname = 'ux_cxc_pagos_tenant_cuenta_referencia'
    ),
    'unicidad tenant+cuenta+referencia en cxc_pagos';

  RETURN QUERY
  SELECT
    'ux_cxc_pagos_tenant_idempotency_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cxc_pagos'
        AND indexname = 'ux_cxc_pagos_tenant_idempotency'
    ),
    'unicidad tenant+idempotency_key en cxc_pagos';

  RETURN QUERY
  SELECT
    'ux_cxc_pagos_tenant_event_id_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cxc_pagos'
        AND indexname = 'ux_cxc_pagos_tenant_event_id'
    ),
    'unicidad tenant+event_id en cxc_pagos';

  RETURN QUERY
  SELECT
    'idx_pagos_lote_tenant_fecha_estado_runtime_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pagos_lote'
        AND indexname = 'idx_pagos_lote_tenant_fecha_estado_runtime'
    ),
    'índice por tenant+fecha+estado en pagos_lote';

  RETURN QUERY
  SELECT
    'ux_pagos_lote_tenant_referencia_full_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pagos_lote'
        AND indexname = 'ux_pagos_lote_tenant_referencia_full'
    ),
    'unicidad tenant+referencia_lote en pagos_lote';

  -- RLS
  RETURN QUERY
  SELECT
    'rls_cxc_pagos_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cxc_pagos'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cxc_pagos';

  RETURN QUERY
  SELECT
    'rls_pagos_lote_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pagos_lote'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pagos_lote';

  -- RPC crítica del flujo de lote.
  RETURN QUERY
  SELECT
    'rpc_procesar_pago_lote_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'procesar_pago_lote'
    ),
    'RPC procesar_pago_lote disponible';

  -- Duplicados de scope.
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, cuenta_id, upper(btrim(referencia)) AS ref_norm, COUNT(*) AS cnt
    FROM public.cxc_pagos
    WHERE tenant_id IS NOT NULL
      AND cuenta_id IS NOT NULL
      AND referencia IS NOT NULL
      AND btrim(referencia) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, cuenta_id, upper(btrim(referencia))
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'cxc_pagos_duplicate_referencia_scope'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, idempotency_key, COUNT(*) AS cnt
    FROM public.cxc_pagos
    WHERE tenant_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND btrim(idempotency_key) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, idempotency_key
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'cxc_pagos_duplicate_idempotency'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(referencia_lote)) AS ref_norm, COUNT(*) AS cnt
    FROM public.pagos_lote
    WHERE tenant_id IS NOT NULL
      AND referencia_lote IS NOT NULL
      AND btrim(referencia_lote) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(referencia_lote))
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'pagos_lote_duplicate_referencia'::text,
    (v_count = 0),
    format('duplicates=%s', v_count);

  -- Filas inválidas.
  SELECT COUNT(*)
  INTO v_count
  FROM public.cxc_pagos p
  WHERE (
      p.tenant_id IS NULL
      OR p.cuenta_id IS NULL
      OR p.monto IS NULL OR p.monto <= 0
      OR p.fecha_pago IS NULL
      OR p.tipo IS NULL OR p.tipo NOT IN ('PAGO', 'ANTICIPO', 'DETRACCION', 'PERCEPCION', 'RETENCION', 'NOTA_CREDITO')
      OR p.moneda IS NULL OR p.moneda !~ '^[A-Z]{3}$'
      OR p.metodo_pago IS NULL OR btrim(p.metodo_pago) = ''
      OR (
        COALESCE(p.aplica_retencion, false) = true
        AND (COALESCE(p.retencion_monto, 0) <= 0 OR COALESCE(p.retencion_monto, 0) > p.monto)
      )
      OR (
        COALESCE(p.aplica_retencion, false) = false
        AND COALESCE(p.retencion_monto, 0) <> 0
      )
      OR p.idempotency_key IS NULL OR btrim(p.idempotency_key) = ''
      OR p.source IS NULL OR btrim(p.source) = ''
      OR p.estado IS NULL OR p.estado NOT IN ('ACTIVO', 'INACTIVO')
      OR COALESCE(p.activo, true) <> (p.estado = 'ACTIVO')
    )
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxc_pagos_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_lote pl
  WHERE (
      pl.tenant_id IS NULL
      OR pl.cuenta_bancaria_id IS NULL
      OR pl.referencia_lote IS NULL OR btrim(pl.referencia_lote) = ''
      OR pl.fecha_pago IS NULL
      OR pl.metodo_pago IS NULL OR btrim(pl.metodo_pago) = ''
      OR pl.monto_total IS NULL OR pl.monto_total < 0
      OR pl.pagos IS NULL OR jsonb_typeof(pl.pagos) <> 'array'
      OR pl.resultado IS NULL OR jsonb_typeof(pl.resultado) <> 'object'
      OR pl.estado IS NULL OR pl.estado NOT IN ('PENDIENTE', 'PROCESADO', 'ERROR', 'CANCELADO')
      OR COALESCE(pl.activo, false) <> (pl.estado IN ('PENDIENTE', 'PROCESADO'))
    )
    AND (p_tenant_id IS NULL OR pl.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'pagos_lote_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  -- Mismatches tenant por relaciones.
  SELECT COUNT(*)
  INTO v_count
  FROM public.cxc_pagos p
  JOIN public.cuentas_por_cobrar c
    ON c.id = p.cuenta_id
  WHERE p.tenant_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND p.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxc_pagos_vs_cuentas_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.cxc_pagos p
  JOIN public.cuentas_bancarias cb
    ON cb.id = p.cuenta_bancaria_id
  WHERE p.cuenta_bancaria_id IS NOT NULL
    AND p.tenant_id IS NOT NULL
    AND cb.tenant_id IS NOT NULL
    AND p.tenant_id <> cb.tenant_id
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'cxc_pagos_vs_cuentas_bancarias_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.pagos_lote pl
  JOIN public.cuentas_bancarias cb
    ON cb.id = pl.cuenta_bancaria_id
  WHERE pl.tenant_id IS NOT NULL
    AND cb.tenant_id IS NOT NULL
    AND pl.tenant_id <> cb.tenant_id
    AND (p_tenant_id IS NULL OR pl.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'pagos_lote_vs_cuentas_bancarias_tenant_mismatch'::text,
    (v_count = 0),
    format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_cxc_pagos_lotes_runtime_status_actual AS
SELECT *
FROM public.validar_cxc_pagos_lotes_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
