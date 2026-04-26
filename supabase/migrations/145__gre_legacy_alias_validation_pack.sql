-- ============================================================================
-- 145__gre_legacy_alias_validation_pack.sql
-- Pack de validación runtime para alias legacy GRE (gre <-> gre_guias).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_gre_legacy_alias_runtime(
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
    'trigger_normalize_gre_legacy_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre'
        AND t.tgname = 'trg_normalize_gre_legacy_row'
        AND NOT t.tgisinternal
    ),
    'trigger de normalización en gre';

  RETURN QUERY
  SELECT
    'trigger_sync_gre_from_gre_guias'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre_guias'
        AND t.tgname = 'trg_sync_gre_from_gre_guias'
        AND NOT t.tgisinternal
    ),
    'trigger de sync gre_guias -> gre';

  RETURN QUERY
  SELECT
    'trigger_sync_gre_guias_from_gre'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre'
        AND t.tgname = 'trg_sync_gre_guias_from_gre'
        AND NOT t.tgisinternal
    ),
    'trigger de sync gre -> gre_guias';

  RETURN QUERY
  SELECT
    'trigger_enforce_gre_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre'
        AND t.tgname = 'trg_enforce_gre_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en gre';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'gre_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 15
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'gre'
        AND c.column_name IN (
          'tenant_id', 'numero', 'serie', 'correlativo', 'fecha_emision',
          'estado', 'sunat_status', 'idempotency_key', 'retry_count',
          'next_retry_at', 'cpe_relacionado', 'error_message',
          'metadata', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de gre';

  -- FKs
  RETURN QUERY
  SELECT
    'fk_gre_tenant_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'gre_tenant_id_fkey'
        AND conrelid = 'public.gre'::regclass
    ),
    'FK gre -> tenants';

  RETURN QUERY
  SELECT
    'fk_gre_cpe_relacionado_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'gre_cpe_relacionado_fkey'
        AND conrelid = 'public.gre'::regclass
    ),
    'FK gre -> cpe';

  -- Índices esperados
  RETURN QUERY
  SELECT
    'ux_gre_tenant_numero_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'gre'
        AND indexname = 'ux_gre_tenant_numero'
    ),
    'unicidad por tenant + numero';

  RETURN QUERY
  SELECT
    'ux_gre_tenant_idempotency_key_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'gre'
        AND indexname = 'ux_gre_tenant_idempotency_key'
    ),
    'unicidad por tenant + idempotency_key';

  RETURN QUERY
  SELECT
    'idx_gre_tenant_retry_queue_runtime_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'gre'
        AND indexname = 'idx_gre_tenant_retry_queue_runtime'
    ),
    'índice runtime de cola de reintentos legacy';

  -- RLS
  RETURN QUERY
  SELECT
    'rls_gre_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'gre'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en gre';

  -- Duplicados por scope
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(numero) AS numero_norm, COUNT(*) AS cnt
    FROM public.gre
    WHERE tenant_id IS NOT NULL
      AND numero IS NOT NULL
      AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(numero)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'gre_duplicate_numero_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, btrim(idempotency_key) AS key_norm, COUNT(*) AS cnt
    FROM public.gre
    WHERE tenant_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND btrim(idempotency_key) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, btrim(idempotency_key)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'gre_duplicate_idempotency_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas inválidas gre
  SELECT COUNT(*) INTO v_count
  FROM public.gre g
  WHERE (
      g.tenant_id IS NULL
      OR g.numero IS NULL
      OR btrim(g.numero) = ''
      OR g.estado NOT IN ('PENDIENTE_ENVIO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR')
      OR g.sunat_status NOT IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR')
      OR g.retry_count < 0
      OR (g.correlativo IS NOT NULL AND g.correlativo < 1)
    )
    AND (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gre_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Gap de sincronización entre alias y canónico
  SELECT COUNT(*) INTO v_count
  FROM public.gre_guias gg
  LEFT JOIN public.gre g ON g.id = gg.id
  WHERE g.id IS NULL
    AND (p_tenant_id IS NULL OR gg.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gre_guias_missing_in_gre'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.gre g
  LEFT JOIN public.gre_guias gg ON gg.id = g.id
  WHERE gg.id IS NULL
    AND (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gre_missing_in_gre_guias'::text, (v_count = 0), format('rows=%s', v_count);

  -- Mismatch de tenant/número/estado entre alias y canónico
  SELECT COUNT(*) INTO v_count
  FROM public.gre g
  JOIN public.gre_guias gg ON gg.id = g.id
  WHERE (
      COALESCE(g.tenant_id::text, '') <> COALESCE(gg.tenant_id::text, '')
      OR COALESCE(NULLIF(btrim(g.numero), ''), '') <> COALESCE(NULLIF(btrim(gg.numero), ''), '')
      OR COALESCE(g.estado, 'PENDIENTE_ENVIO') <> app.map_gre_guias_to_legacy_estado(gg.estado, gg.sunat_status)
    )
    AND (
      p_tenant_id IS NULL
      OR g.tenant_id = p_tenant_id
      OR gg.tenant_id = p_tenant_id
    );
  RETURN QUERY SELECT 'gre_alias_mapping_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_gre_legacy_alias_runtime_status_actual AS
SELECT *
FROM public.validar_gre_legacy_alias_runtime(app.resolve_request_tenant_id());

COMMIT;

