-- ============================================================================
-- 295__help_knowledge_base_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estado case-insensitive en knowledge_base.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_help_knowledge_base_estado_case_insensitive_runtime(
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
  v_policy_expr text;
  v_policy_expr_norm text;
BEGIN
  RETURN QUERY
  SELECT
    'citext_extension_present'::text,
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext'),
    'extension citext instalada'::text;

  RETURN QUERY
  SELECT
    'knowledge_base_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'knowledge_base'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'knowledge_base.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'helper_normalize_help_knowledge_base_estado_293_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_help_knowledge_base_estado_293'
    ),
    'helper canonico de normalizacion de estado knowledge_base'::text;

  RETURN QUERY
  SELECT
    'trigger_trg_normalize_knowledge_base_row_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'knowledge_base'
        AND t.tgname = 'trg_normalize_knowledge_base_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion runtime de knowledge_base'::text;

  RETURN QUERY
  WITH expected(conname, detail_msg) AS (
    VALUES
      ('ck_kb_estado_nonempty', 'estado no vacío'),
      ('ck_kb_estado_valid_293', 'dominio estado case-insensitive'),
      ('ck_kb_activo_estado_consistency_293', 'consistencia estado/activo')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'knowledge_base'
        AND c.conname = e.conname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  WITH expected(indexname, detail_msg) AS (
    VALUES
      ('idx_kb_scope_activo_categoria_rol_orden_runtime', 'indice principal runtime'),
      ('idx_kb_tenant_estado_ci_runtime_293', 'indice CI tenant+estado'),
      ('idx_kb_global_estado_ci_runtime_293', 'indice CI global+estado'),
      ('ux_kb_scope_categoria_rol_pregunta_activa', 'unicidad de preguntas activas por scope')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = 'knowledge_base'
        AND i.indexname = e.indexname
    ),
    e.detail_msg::text
  FROM expected e;

  RETURN QUERY
  SELECT
    'rls_knowledge_base_enabled_forced'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'knowledge_base'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS enabled+forced en knowledge_base'::text;

  RETURN QUERY
  SELECT
    'rls_knowledge_base_policy_select_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'knowledge_base'
        AND p.policyname = 'knowledge_base_tenant_or_global_select'
    ),
    'policy select global+tenant presente'::text;

  RETURN QUERY
  SELECT
    'rls_knowledge_base_policy_write_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'knowledge_base'
        AND p.policyname = 'knowledge_base_tenant_write'
    ),
    'policy write tenant/superadmin presente'::text;

  RETURN QUERY
  SELECT
    'rpc_buscar_ayuda_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace pn ON pn.oid = pr.pronamespace
      WHERE pn.nspname = 'public'
        AND pr.proname = 'buscar_ayuda'
    ),
    'RPC buscar_ayuda disponible'::text;

  RETURN QUERY
  SELECT
    'rpc_obtener_sugerencias_ayuda_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc pr
      JOIN pg_namespace pn ON pn.oid = pr.pronamespace
      WHERE pn.nspname = 'public'
        AND pr.proname = 'obtener_sugerencias_ayuda'
    ),
    'RPC obtener_sugerencias_ayuda disponible'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.knowledge_base kb
       WHERE (p_tenant_id IS NULL OR kb.tenant_id = p_tenant_id OR kb.tenant_id IS NULL)
         AND kb.estado = 'ACTIVO')
    - (SELECT COUNT(*) FROM public.knowledge_base kb
       WHERE (p_tenant_id IS NULL OR kb.tenant_id = p_tenant_id OR kb.tenant_id IS NULL)
         AND kb.estado = 'activo')
  ) INTO v_delta;
  RETURN QUERY
  SELECT 'knowledge_base_estado_case_insensitive_activo'::text, (v_delta = 0), format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.knowledge_base kb
  WHERE (
      kb.estado IS NULL
      OR lower(kb.estado::text) NOT IN ('activo', 'inactivo')
    )
    AND (
      p_tenant_id IS NULL
      OR kb.tenant_id IS NULL
      OR kb.tenant_id = p_tenant_id
    );
  RETURN QUERY
  SELECT 'knowledge_base_invalid_estado_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.knowledge_base kb
  WHERE (
      kb.activo IS NULL
      OR (kb.activo = true AND lower(kb.estado::text) <> 'activo')
      OR (kb.activo = false AND lower(kb.estado::text) <> 'inactivo')
    )
    AND (
      p_tenant_id IS NULL
      OR kb.tenant_id IS NULL
      OR kb.tenant_id = p_tenant_id
    );
  RETURN QUERY
  SELECT 'knowledge_base_estado_activo_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      COALESCE(kb.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_scope,
      upper(COALESCE(NULLIF(btrim(kb.categoria), ''), 'GENERAL')) AS categoria_norm,
      upper(COALESCE(NULLIF(btrim(kb.rol), ''), '*')) AS rol_norm,
      upper(COALESCE(NULLIF(btrim(kb.pregunta), ''), 'PREGUNTA SIN TITULO')) AS pregunta_norm,
      COUNT(*) AS c
    FROM public.knowledge_base kb
    WHERE lower(COALESCE(kb.estado::text, 'activo')) = 'activo'
      AND (
        p_tenant_id IS NULL
        OR kb.tenant_id IS NULL
        OR kb.tenant_id = p_tenant_id
      )
    GROUP BY
      COALESCE(kb.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
      upper(COALESCE(NULLIF(btrim(kb.categoria), ''), 'GENERAL')),
      upper(COALESCE(NULLIF(btrim(kb.rol), ''), '*')),
      upper(COALESCE(NULLIF(btrim(kb.pregunta), ''), 'PREGUNTA SIN TITULO'))
    HAVING COUNT(*) > 1
  ) dup;
  RETURN QUERY
  SELECT 'knowledge_base_duplicate_active_groups'::text, (v_count = 0), format('groups=%s', v_count)::text;

  SELECT p.qual
  INTO v_policy_expr
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'knowledge_base'
    AND p.policyname = 'knowledge_base_tenant_or_global_select';

  v_policy_expr_norm := lower(regexp_replace(COALESCE(v_policy_expr, ''), '\s+', '', 'g'));

  RETURN QUERY
  SELECT
    'knowledge_base_global_guard'::text,
    v_policy_expr IS NOT NULL
    AND position('tenant_idisnull' IN v_policy_expr_norm) > 0
    AND (
      position('resolve_request_tenant_id()' IN v_policy_expr_norm) > 0
      OR position('app.current_tenant_id()isnotnull' IN v_policy_expr_norm) > 0
    ),
    COALESCE(v_policy_expr, '<missing_policy>');

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_help_knowledge_base_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_help_knowledge_base_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
