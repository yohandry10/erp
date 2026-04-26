-- ============================================================================
-- 106__demo_conversion_validation_pack.sql
-- Pack de validación runtime para demo_conversiones_pendientes.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_demo_conversion_runtime(
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
    'trigger_normalize_demo_conversiones_pendientes_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'demo_conversiones_pendientes'
        AND t.tgname = 'trg_normalize_demo_conversiones_pendientes_row'
        AND NOT t.tgisinternal
    ),
    'normalización de conversiones demo';

  RETURN QUERY
  SELECT
    'demo_conversion_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'demo_conversiones_pendientes'
        AND c.column_name IN (
          'email',
          'password_hash',
          'razon_social',
          'ruc',
          'plan_id',
          'periodo',
          'stripe_session_id',
          'monto',
          'completed_at',
          'failed_at',
          'processing_attempts'
        )
    ),
    'columnas runtime usadas por DemoService';

  RETURN QUERY
  SELECT
    'ux_demo_conv_stripe_session_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'demo_conversiones_pendientes'
        AND indexname = 'ux_demo_conv_stripe_session'
    ),
    'idempotencia por stripe_session_id';

  RETURN QUERY
  SELECT
    'ux_demo_conv_tenant_pending_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'demo_conversiones_pendientes'
        AND indexname = 'ux_demo_conv_tenant_pending'
    ),
    'solo una conversión pendiente por tenant';

  RETURN QUERY
  SELECT
    'rls_demo_conversiones_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'demo_conversiones_pendientes'
        AND c.relrowsecurity = true
    ),
    'RLS habilitado en demo_conversiones_pendientes';

  RETURN QUERY
  SELECT
    'rls_demo_conversiones_policy_superadmin_only'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'demo_conversiones_pendientes'
        AND p.policyname = 'demo_conversiones_superadmin_only'
    ),
    'política explícita de acceso superadmin';

  SELECT COUNT(*)
  INTO v_count
  FROM public.demo_conversiones_pendientes d
  WHERE (
      d.plan_id NOT IN ('basico', 'profesional', 'enterprise')
      OR d.periodo NOT IN ('mensual', 'anual')
      OR d.estado NOT IN ('PENDIENTE', 'COMPLETADA', 'FALLIDA', 'CANCELADA', 'EXPIRADA')
      OR COALESCE(d.monto, -1) < 0
      OR COALESCE(d.processing_attempts, -1) < 0
      OR (d.email IS NOT NULL AND (position('@' in d.email) <= 1 OR position('.' in split_part(d.email, '@', 2)) <= 1))
      OR (d.ruc IS NOT NULL AND d.ruc !~ '^[0-9]{11}$')
      OR (d.completed_at IS NOT NULL AND d.completed_at < d.created_at)
      OR (d.failed_at IS NOT NULL AND d.failed_at < d.created_at)
      OR (d.estado = 'COMPLETADA' AND d.completed_at IS NULL)
      OR (d.estado = 'PENDIENTE' AND d.stripe_session_id IS NULL)
    )
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'demo_conversion_invalid_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      upper(d.stripe_session_id) AS session_norm,
      COUNT(*) AS c
    FROM public.demo_conversiones_pendientes d
    WHERE d.stripe_session_id IS NOT NULL
      AND btrim(d.stripe_session_id) <> ''
      AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    GROUP BY upper(d.stripe_session_id)
    HAVING COUNT(*) > 1
  ) dup;

  RETURN QUERY
  SELECT
    'duplicate_demo_conversion_session_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT
      d.tenant_id,
      COUNT(*) AS c
    FROM public.demo_conversiones_pendientes d
    WHERE d.estado = 'PENDIENTE'
      AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    GROUP BY d.tenant_id
    HAVING COUNT(*) > 1
  ) dup;

  RETURN QUERY
  SELECT
    'duplicate_demo_conversion_pending_by_tenant_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_demo_conversion_runtime_status_actual AS
SELECT *
FROM public.validar_demo_conversion_runtime(app.resolve_request_tenant_id());

COMMIT;
