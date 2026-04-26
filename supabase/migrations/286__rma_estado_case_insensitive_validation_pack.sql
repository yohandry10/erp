-- ============================================================================
-- 286__rma_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en flujo RMA.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_rma_estado_case_insensitive_runtime(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, app, pg_temp
AS $$
DECLARE
  v_count bigint;
  v_delta bigint;
BEGIN
  RETURN QUERY
  SELECT
    'citext_extension_present'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'extension citext instalada'::text;

  RETURN QUERY
  WITH expected(table_name, detail_msg) AS (
    VALUES
      ('rma_solicitudes', 'rma_solicitudes.estado usa citext'),
      ('rma_items', 'rma_items.estado usa citext')
  )
  SELECT
    format('%s_estado_type_citext', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = e.table_name
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  SELECT
    'helper_normalize_rma_estado_284_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_rma_estado_284'
    ),
    'helper canonico de normalizacion de estado RMA'::text;

  RETURN QUERY
  WITH expected(table_name, trigger_name, detail_msg) AS (
    VALUES
      ('rma_solicitudes', 'trg_normalize_rma_solicitudes_row', 'normalizacion de solicitudes RMA'),
      ('rma_items', 'trg_normalize_rma_items_row', 'normalizacion de items RMA'),
      ('rma_eventos', 'trg_normalize_rma_eventos_row', 'normalizacion de eventos RMA'),
      ('rma_solicitudes', 'trg_enforce_rma_solicitudes_tenant', 'consistencia tenant cabecera RMA'),
      ('rma_items', 'trg_enforce_rma_items_tenant', 'consistencia tenant items RMA'),
      ('rma_eventos', 'trg_enforce_rma_eventos_tenant', 'consistencia tenant eventos RMA')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(relname, conname, detail_msg) AS (
    VALUES
      ('rma_solicitudes', 'ck_rma_solicitudes_estado_valid', 'dominio estado en rma_solicitudes'),
      ('rma_items', 'ck_rma_items_estado_runtime_285', 'dominio estado en rma_items')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(tablename, indexname, detail_msg) AS (
    VALUES
      ('rma_solicitudes', 'idx_rma_solicitudes_tenant_estado_ci_runtime_284', 'indice CI solicitudes RMA'),
      ('rma_items', 'idx_rma_items_tenant_estado_ci_runtime_284', 'indice CI items RMA'),
      ('rma_solicitudes', 'ux_rma_solicitudes_tenant_numero', 'unicidad de numero RMA por tenant'),
      ('rma_items', 'ux_rma_items_rma_detalle_activo', 'unicidad activa por rma+detalle')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('rma_solicitudes'),
      ('rma_items'),
      ('rma_eventos')
  )
  SELECT
    format('rls_%s_enabled_forced', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.rma_solicitudes r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
         AND r.estado = 'CREADA')
    - (SELECT COUNT(*) FROM public.rma_solicitudes r
       WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
         AND r.estado = 'creada')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'rma_solicitudes_estado_case_insensitive_creada'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.rma_items i
       WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
         AND i.estado = 'PARCIAL')
    - (SELECT COUNT(*) FROM public.rma_items i
       WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
         AND i.estado = 'parcial')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'rma_items_estado_case_insensitive_parcial'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_solicitudes r
  WHERE (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
    AND (
      r.estado IS NULL
      OR lower(r.estado::text) NOT IN ('creada', 'aprobada', 'rechazada', 'parcial', 'recibida', 'cerrada', 'cancelada', 'inactivo')
    );
  RETURN QUERY
  SELECT 'rma_solicitudes_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_items i
  WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
    AND (
      i.estado IS NULL
      OR lower(i.estado::text) NOT IN ('creada', 'parcial', 'cerrado', 'rechazado', 'inactivo')
    );
  RETURN QUERY
  SELECT 'rma_items_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_items i
  WHERE (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
    AND (
      COALESCE(i.cantidad_autorizada, 0) < 0
      OR COALESCE(i.cantidad_devuelta, 0) < 0
      OR COALESCE(i.cantidad_devuelta, 0) > COALESCE(i.cantidad_autorizada, 0)
    );
  RETURN QUERY
  SELECT 'rma_items_cantidades_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_items i
  JOIN public.rma_solicitudes r ON r.id = i.rma_id
  WHERE i.tenant_id <> r.tenant_id
    AND (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'rma_items_tenant_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.rma_eventos e
  JOIN public.rma_solicitudes r ON r.id = e.rma_id
  WHERE e.tenant_id <> r.tenant_id
    AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'rma_eventos_tenant_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      i.rma_id,
      i.detalle_id,
      COUNT(*) AS c
    FROM public.rma_items i
    WHERE i.rma_id IS NOT NULL
      AND i.detalle_id IS NOT NULL
      AND lower(COALESCE(i.estado::text, 'creada')) NOT IN ('rechazado', 'inactivo')
      AND (p_tenant_id IS NULL OR i.tenant_id = p_tenant_id)
    GROUP BY i.rma_id, i.detalle_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'duplicate_rma_items_active_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_rma_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_rma_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
