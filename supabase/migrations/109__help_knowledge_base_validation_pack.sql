-- ============================================================================
-- 109__help_knowledge_base_validation_pack.sql
-- Pack de validación runtime para knowledge_base y RPC de ayuda.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_help_knowledge_base_runtime(
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
  v_policy_expr text;
  v_policy_expr_norm text;
BEGIN
  RETURN QUERY
  SELECT
    'trigger_normalize_knowledge_base_row'::text,
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
    'normalización de knowledge_base';

  RETURN QUERY
  SELECT
    'knowledge_base_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 12
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'knowledge_base'
        AND c.column_name IN (
          'pregunta',
          'respuesta',
          'pasos',
          'url_modulo',
          'categoria',
          'rol',
          'palabras_clave',
          'orden',
          'activo',
          'idioma',
          'usage_count',
          'last_used_at'
        )
    ),
    'columnas runtime requeridas por help bot';

  RETURN QUERY
  SELECT
    'idx_kb_scope_activo_categoria_rol_orden_runtime_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'knowledge_base'
        AND indexname = 'idx_kb_scope_activo_categoria_rol_orden_runtime'
    ),
    'índice principal para búsqueda/sugerencias';

  RETURN QUERY
  SELECT
    'idx_kb_global_activo_orden_runtime_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'knowledge_base'
        AND indexname = 'idx_kb_global_activo_orden_runtime'
    ),
    'índice de filas globales activas';

  RETURN QUERY
  SELECT
    'idx_kb_tenant_activo_orden_runtime_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'knowledge_base'
        AND indexname = 'idx_kb_tenant_activo_orden_runtime'
    ),
    'índice de filas tenant activas';

  RETURN QUERY
  SELECT
    'ux_kb_scope_categoria_rol_pregunta_activa_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'knowledge_base'
        AND indexname = 'ux_kb_scope_categoria_rol_pregunta_activa'
    ),
    'unicidad operativa de preguntas activas';

  RETURN QUERY
  SELECT
    'rls_knowledge_base_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'knowledge_base'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado y forzado en knowledge_base';

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
    'política de lectura global+tenant';

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
    'política de escritura tenant/superadmin';

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
    'RPC buscar_ayuda disponible';

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
    'RPC obtener_sugerencias_ayuda disponible';

  SELECT COUNT(*)
  INTO v_count
  FROM public.knowledge_base kb
  WHERE (
      kb.pregunta IS NULL
      OR btrim(kb.pregunta) = ''
      OR kb.respuesta IS NULL
      OR btrim(kb.respuesta) = ''
      OR COALESCE(kb.orden, -1) < 0
      OR COALESCE(kb.usage_count, -1) < 0
      OR kb.idioma IS NULL
      OR kb.idioma !~ '^[a-z]{2}(-[a-z]{2})?$'
      OR (kb.url_modulo IS NOT NULL AND left(kb.url_modulo, 1) <> '/')
      OR (kb.pasos IS NOT NULL AND jsonb_typeof(kb.pasos) <> 'array')
      OR (COALESCE(kb.activo, false) = true AND upper(COALESCE(kb.estado, '')) <> 'ACTIVO')
    )
    AND (
      p_tenant_id IS NULL
      OR kb.tenant_id IS NULL
      OR kb.tenant_id = p_tenant_id
    );

  RETURN QUERY
  SELECT
    'knowledge_base_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

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
    WHERE COALESCE(kb.activo, true) = true
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
  SELECT
    'knowledge_base_duplicate_active_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

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
END;
$$;

CREATE OR REPLACE VIEW public.v_help_knowledge_base_runtime_status_actual AS
SELECT *
FROM public.validar_help_knowledge_base_runtime(app.resolve_request_tenant_id());

COMMIT;
