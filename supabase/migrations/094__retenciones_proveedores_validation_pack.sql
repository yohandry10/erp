-- ============================================================================
-- 094__retenciones_proveedores_validation_pack.sql
-- Pack de validación runtime para retenciones/proveedores.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_retenciones_proveedores_runtime(
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
    'trigger_normalize_proveedores_documentos_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'proveedores'
        AND t.tgname = 'trg_normalize_proveedores_documentos_row'
        AND NOT t.tgisinternal
    ),
    'normalización documental de proveedores';

  RETURN QUERY
  SELECT
    'trigger_normalize_proveedores_cuarta_categoria_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'proveedores_cuarta_categoria'
        AND t.tgname = 'trg_normalize_proveedores_cuarta_categoria_row'
        AND NOT t.tgisinternal
    ),
    'normalización de proveedores cuarta categoría';

  RETURN QUERY
  SELECT
    'trigger_normalize_libro_retenciones_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'libro_retenciones'
        AND t.tgname = 'trg_normalize_libro_retenciones_row'
        AND NOT t.tgisinternal
    ),
    'normalización del libro de retenciones';

  RETURN QUERY
  SELECT
    'trigger_enforce_tenant_libro_retenciones'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'libro_retenciones'
        AND t.tgname = 'trg_enforce_tenant_libro_retenciones'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant de libro_retenciones';

  RETURN QUERY
  SELECT
    'trigger_enforce_tenant_proveedores_cuarta_categoria'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'proveedores_cuarta_categoria'
        AND t.tgname = 'trg_enforce_tenant_proveedores_cuarta_categoria'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant de proveedores cuarta categoría';

  RETURN QUERY
  SELECT
    'fk_libro_retenciones_proveedor_id_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_libro_retenciones_proveedor_id'
        AND conrelid = 'public.libro_retenciones'::regclass
    ),
    'FK libro_retenciones.proveedor_id -> proveedores.id';

  RETURN QUERY
  SELECT
    'fk_proveedores_cuarta_categoria_proveedor_id_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_proveedores_cuarta_categoria_proveedor_id'
        AND conrelid = 'public.proveedores_cuarta_categoria'::regclass
    ),
    'FK proveedores_cuarta_categoria.proveedor_id -> proveedores.id';

  RETURN QUERY
  SELECT
    'ux_libro_retenciones_tenant_numero_correlativo_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'libro_retenciones'
        AND indexname = 'ux_libro_retenciones_tenant_numero_correlativo'
    ),
    'unicidad por tenant+correlativo';

  RETURN QUERY
  SELECT
    'ux_proveedores_tenant_ruc_activo_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'proveedores'
        AND indexname = 'ux_proveedores_tenant_ruc_activo'
    ),
    'unicidad activa de proveedores por tenant+ruc';

  RETURN QUERY
  SELECT
    'ux_proveedores_cuarta_tenant_proveedor_activo_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'proveedores_cuarta_categoria'
        AND indexname = 'ux_proveedores_cuarta_tenant_proveedor_activo'
    ),
    'unicidad activa de cuarta categoría por tenant+proveedor';

  SELECT COUNT(*)
  INTO v_count
  FROM public.proveedores p
  WHERE (
      NULLIF(btrim(COALESCE(p.numero_documento, '')), '') IS NOT NULL
      AND NULLIF(btrim(COALESCE(p.tipo_documento, '')), '') IS NULL
    )
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'proveedores_documento_without_tipo'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.libro_retenciones lr
  WHERE (
      COALESCE(lr.monto_pago, 0) < 0
      OR COALESCE(lr.monto_retencion, 0) < 0
      OR COALESCE(lr.monto_retencion, 0) > COALESCE(lr.monto_pago, 0)
      OR COALESCE(lr.tasa_retencion, 0) < 0
      OR COALESCE(lr.tasa_retencion, 0) > 100
      OR lr.categoria_retencion NOT IN ('CUARTA', 'QUINTA')
    )
    AND (p_tenant_id IS NULL OR lr.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'libro_retenciones_invalid_ranges_or_categoria'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.libro_retenciones lr
  JOIN public.proveedores p ON p.id = lr.proveedor_id
  WHERE lr.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR lr.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'libro_retenciones_tenant_mismatch_vs_proveedor'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.proveedores_cuarta_categoria pc
  JOIN public.proveedores p ON p.id = pc.proveedor_id
  WHERE pc.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id);

  RETURN QUERY
  SELECT
    'proveedores_cuarta_tenant_mismatch_vs_proveedor'::text,
    (v_count = 0),
    format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT p.tenant_id, lower(btrim(p.ruc)) AS ruc_key, COUNT(*) AS c
    FROM public.proveedores p
    WHERE p.tenant_id IS NOT NULL
      AND NULLIF(btrim(COALESCE(p.ruc, '')), '') IS NOT NULL
      AND COALESCE(p.activo, true) = true
      AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id)
    GROUP BY p.tenant_id, lower(btrim(p.ruc))
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_active_proveedores_ruc_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT pc.tenant_id, pc.proveedor_id, COUNT(*) AS c
    FROM public.proveedores_cuarta_categoria pc
    WHERE pc.tenant_id IS NOT NULL
      AND pc.proveedor_id IS NOT NULL
      AND COALESCE(pc.activo, true) = true
      AND (p_tenant_id IS NULL OR pc.tenant_id = p_tenant_id)
    GROUP BY pc.tenant_id, pc.proveedor_id
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_active_proveedores_cuarta_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT lr.tenant_id, upper(btrim(lr.numero_correlativo)) AS correlativo_key, COUNT(*) AS c
    FROM public.libro_retenciones lr
    WHERE lr.tenant_id IS NOT NULL
      AND NULLIF(btrim(COALESCE(lr.numero_correlativo, '')), '') IS NOT NULL
      AND (p_tenant_id IS NULL OR lr.tenant_id = p_tenant_id)
    GROUP BY lr.tenant_id, upper(btrim(lr.numero_correlativo))
    HAVING COUNT(*) > 1
  ) d;

  RETURN QUERY
  SELECT
    'duplicate_libro_retenciones_correlativo_groups'::text,
    (v_count = 0),
    format('groups=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_retenciones_proveedores_runtime_status_actual AS
SELECT *
FROM public.validar_retenciones_proveedores_runtime(app.resolve_request_tenant_id());

COMMIT;
