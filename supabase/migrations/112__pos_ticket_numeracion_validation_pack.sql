-- ============================================================================
-- 112__pos_ticket_numeracion_validation_pack.sql
-- Pack de validación runtime para ventas_pos/pos_numeracion y RPC POS.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_pos_ticket_numeracion_runtime(
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
  RETURN QUERY
  SELECT
    'ventas_pos_numero_ticket_type_text'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ventas_pos'
        AND c.column_name = 'numero_ticket'
        AND c.data_type = 'text'
    ),
    'numero_ticket debe ser text';

  RETURN QUERY
  SELECT
    'ventas_pos_impuestos_type_numeric'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ventas_pos'
        AND c.column_name = 'impuestos'
        AND c.data_type = 'numeric'
    ),
    'impuestos debe ser numeric';

  RETURN QUERY
  SELECT
    'ventas_pos_ultimo_intento_type_timestamptz'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ventas_pos'
        AND c.column_name = 'ultimo_intento_facturacion'
        AND c.data_type = 'timestamp with time zone'
    ),
    'ultimo_intento_facturacion debe ser timestamptz';

  RETURN QUERY
  SELECT
    'pos_numeracion_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pos_numeracion'
        AND c.column_name IN (
          'serie',
          'tipo_documento',
          'correlativo_actual',
          'correlativo_maximo',
          'caja_id',
          'activo'
        )
    ),
    'columnas runtime de pos_numeracion';

  RETURN QUERY
  SELECT
    'trigger_normalize_pos_numeracion_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pos_numeracion'
        AND t.tgname = 'trg_normalize_pos_numeracion_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de pos_numeracion';

  RETURN QUERY
  SELECT
    'trigger_enforce_pos_numeracion_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pos_numeracion'
        AND t.tgname = 'trg_enforce_pos_numeracion_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant/caja';

  RETURN QUERY
  SELECT
    'trigger_normalize_ventas_pos_ticket_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'ventas_pos'
        AND t.tgname = 'trg_normalize_ventas_pos_ticket_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización de ticket POS';

  RETURN QUERY
  SELECT
    'rpc_obtener_siguiente_numero_pos_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace pn ON pn.oid = pr.pronamespace
      WHERE pn.nspname = 'public'
        AND pr.proname = 'obtener_siguiente_numero_pos'
    ),
    'RPC de correlativos POS';

  RETURN QUERY
  SELECT
    'rpc_pos_registrar_venta_tx_modern_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace pn ON pn.oid = pr.pronamespace
      WHERE pn.nspname = 'public'
        AND pr.proname = 'pos_registrar_venta_tx'
        AND pr.pronargs = 13
    ),
    'firma moderna con idempotency/pagos';

  RETURN QUERY
  SELECT
    'rpc_pos_registrar_venta_tx_legacy_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace pn ON pn.oid = pr.pronamespace
      WHERE pn.nspname = 'public'
        AND pr.proname = 'pos_registrar_venta_tx'
        AND pr.pronargs = 11
    ),
    'firma legacy de compatibilidad';

  RETURN QUERY
  SELECT
    'ux_pos_numeracion_scope_active_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pos_numeracion'
        AND indexname = 'ux_pos_numeracion_scope_active'
    ),
    'unicidad de scope activo en pos_numeracion';

  RETURN QUERY
  SELECT
    'rls_pos_numeracion_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pos_numeracion'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado y forzado en pos_numeracion';

  RETURN QUERY
  SELECT
    'rls_pos_numeracion_tenant_policy_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'pos_numeracion'
        AND p.policyname = 'tenant_isolation'
    ),
    'política tenant_isolation reaplicada';

  SELECT COUNT(*)
  INTO v_count
  FROM public.pos_numeracion pn
  WHERE (
      pn.serie IS NULL
      OR pn.serie !~ '^[A-Z0-9]{1,10}$'
      OR pn.tipo_documento IS NULL
      OR btrim(pn.tipo_documento) = ''
      OR COALESCE(pn.correlativo_actual, -1) < 0
      OR COALESCE(pn.correlativo_maximo, 0) < GREATEST(COALESCE(pn.correlativo_actual, 0), 1)
      OR (COALESCE(pn.activo, false) = true AND upper(COALESCE(pn.estado, '')) <> 'ACTIVO')
    )
    AND (p_tenant_id IS NULL OR pn.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'pos_numeracion_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(pn.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(COALESCE(pn.tipo_documento, 'TICKET')) AS tipo_scope,
      upper(COALESCE(pn.serie, 'T001')) AS serie_scope,
      COALESCE(pn.caja_id, '00000000-0000-0000-0000-000000000000'::uuid) AS caja_scope,
      COUNT(*) AS c
    FROM public.pos_numeracion pn
    WHERE COALESCE(pn.activo, true) = true
      AND (p_tenant_id IS NULL OR pn.tenant_id = p_tenant_id)
    GROUP BY
      COALESCE(pn.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
      upper(COALESCE(pn.tipo_documento, 'TICKET')),
      upper(COALESCE(pn.serie, 'T001')),
      COALESCE(pn.caja_id, '00000000-0000-0000-0000-000000000000'::uuid)
    HAVING COUNT(*) > 1
  ) dup;

  RETURN QUERY
  SELECT
    'pos_numeracion_duplicate_active_scope_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.ventas_pos v
  WHERE (
      v.numero_ticket IS NOT NULL
      AND (
        v.numero_ticket !~ '^[A-Z0-9]{1,10}-[0-9]{8}$'
        OR v.serie IS NULL
        OR v.correlativo IS NULL
        OR upper(v.numero_ticket) <> upper(COALESCE(v.serie, '')) || '-' || COALESCE(v.correlativo, '')
      )
    )
    AND (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'ventas_pos_ticket_inconsistent_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      v.tenant_id,
      upper(v.numero_ticket) AS numero_ticket_norm,
      COUNT(*) AS c
    FROM public.ventas_pos v
    WHERE v.numero_ticket IS NOT NULL
      AND btrim(v.numero_ticket) <> ''
      AND (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    GROUP BY v.tenant_id, upper(v.numero_ticket)
    HAVING COUNT(*) > 1
  ) dup;

  RETURN QUERY
  SELECT
    'ventas_pos_duplicate_ticket_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_pos_ticket_numeracion_runtime_status_actual AS
SELECT *
FROM public.validar_pos_ticket_numeracion_runtime(app.resolve_request_tenant_id());

COMMIT;
