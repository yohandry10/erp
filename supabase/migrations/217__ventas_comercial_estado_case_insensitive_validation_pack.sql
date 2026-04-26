-- ============================================================================
-- 217__ventas_comercial_estado_case_insensitive_validation_pack.sql
-- Pack de validacion runtime para estados case-insensitive en Ventas comercial.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_ventas_comercial_estado_case_insensitive_runtime(
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
  SELECT
    'cotizaciones_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cotizaciones'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'cotizaciones.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'pedidos_venta_estado_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedidos_venta'
        AND c.column_name = 'estado'
        AND c.udt_name = 'citext'
    ),
    'pedidos_venta.estado usa citext'::text;

  RETURN QUERY
  SELECT
    'pedidos_venta_detalle_estado_item_type_citext'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedidos_venta_detalle'
        AND c.column_name = 'estado_item'
        AND c.udt_name = 'citext'
    ),
    'pedidos_venta_detalle.estado_item usa citext'::text;

  RETURN QUERY
  SELECT
    'normalize_cotizaciones_estado_215_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_cotizaciones_estado_215'
    ),
    'helper app.normalize_cotizaciones_estado_215'::text;

  RETURN QUERY
  SELECT
    'normalize_pedidos_venta_estado_215_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_pedidos_venta_estado_215'
    ),
    'helper app.normalize_pedidos_venta_estado_215'::text;

  RETURN QUERY
  SELECT
    'normalize_pedidos_venta_detalle_estado_item_215_exists'::text,
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname = 'normalize_pedidos_venta_detalle_estado_item_215'
    ),
    'helper app.normalize_pedidos_venta_detalle_estado_item_215'::text;

  RETURN QUERY
  SELECT
    'ck_cotizaciones_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_cotizaciones_estado_valid'
        AND conrelid = 'public.cotizaciones'::regclass
    ),
    'constraint de dominio de estado en cotizaciones'::text;

  RETURN QUERY
  SELECT
    'ck_pedidos_venta_estado_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pedidos_venta_estado_valid'
        AND conrelid = 'public.pedidos_venta'::regclass
    ),
    'constraint de dominio de estado en pedidos_venta'::text;

  RETURN QUERY
  SELECT
    'ck_pedidos_venta_requiere_aprobacion_consistency_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pedidos_venta_requiere_aprobacion_consistency'
        AND conrelid = 'public.pedidos_venta'::regclass
    ),
    'consistencia estado/requiere_aprobacion en pedidos_venta'::text;

  RETURN QUERY
  SELECT
    'ck_pedidos_venta_detalle_estado_item_valid_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ck_pedidos_venta_detalle_estado_item_valid'
        AND conrelid = 'public.pedidos_venta_detalle'::regclass
    ),
    'constraint de dominio de estado_item en pedidos_venta_detalle'::text;

  RETURN QUERY
  SELECT
    'idx_cotizaciones_tenant_estado_ci_runtime_215_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cotizaciones'
        AND indexname = 'idx_cotizaciones_tenant_estado_ci_runtime_215'
    ),
    'indice tenant+estado para cotizaciones'::text;

  RETURN QUERY
  SELECT
    'idx_pedidos_venta_tenant_estado_ci_runtime_215_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pedidos_venta'
        AND indexname = 'idx_pedidos_venta_tenant_estado_ci_runtime_215'
    ),
    'indice tenant+estado para pedidos_venta'::text;

  RETURN QUERY
  SELECT
    'idx_pedidos_venta_detalle_tenant_estado_item_ci_runtime_215_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'pedidos_venta_detalle'
        AND indexname = 'idx_pedidos_venta_detalle_tenant_estado_item_ci_runtime_215'
    ),
    'indice tenant+estado_item para pedidos_venta_detalle'::text;

  RETURN QUERY
  SELECT
    'rls_cotizaciones_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizaciones'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cotizaciones'::text;

  RETURN QUERY
  SELECT
    'rls_cotizacion_detalles_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizacion_detalles'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cotizacion_detalles'::text;

  RETURN QUERY
  SELECT
    'rls_pedidos_venta_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pedidos_venta'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedidos_venta'::text;

  RETURN QUERY
  SELECT
    'rls_pedidos_venta_detalle_enabled'::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'pedidos_venta_detalle'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedidos_venta_detalle'::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.cotizaciones t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.estado = 'APROBADA')
    - (SELECT COUNT(*) FROM public.cotizaciones t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.estado = 'aprobada')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'cotizaciones_estado_case_insensitive_aprobada'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT ABS(
      (SELECT COUNT(*) FROM public.pedidos_venta t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.estado = 'PENDIENTE')
    - (SELECT COUNT(*) FROM public.pedidos_venta t
       WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
         AND t.estado = 'pendiente')
  ) INTO v_delta;
  RETURN QUERY
  SELECT
    'pedidos_venta_estado_case_insensitive_pendiente'::text,
    (v_delta = 0),
    format('delta=%s', v_delta)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.cotizaciones t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (
      t.estado IS NULL
      OR lower(t.estado::text) NOT IN ('borrador', 'enviada', 'aprobada', 'rechazada', 'convertida', 'vencida')
    );
  RETURN QUERY
  SELECT
    'cotizaciones_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pedidos_venta t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (
      t.estado IS NULL
      OR lower(t.estado::text) NOT IN (
        'pendiente', 'pendiente_aprobacion', 'confirmado', 'en_preparacion',
        'listo_despacho', 'despacho_parcial', 'listo_facturar',
        'facturado', 'completado', 'completado_con_gre', 'cancelado'
      )
    );
  RETURN QUERY
  SELECT
    'pedidos_venta_invalid_estado_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pedidos_venta_detalle t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND (
      t.estado_item IS NULL
      OR lower(t.estado_item::text) NOT IN ('pendiente', 'parcial', 'despachado', 'facturado')
    );
  RETURN QUERY
  SELECT
    'pedidos_venta_detalle_invalid_estado_item_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.pedidos_venta t
  WHERE (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id)
    AND lower(t.estado::text) = 'pendiente_aprobacion'
    AND COALESCE(t.requiere_aprobacion, false) <> true;
  RETURN QUERY
  SELECT
    'pedidos_venta_estado_aprobacion_consistency_rows'::text,
    (v_count = 0),
    format('rows=%s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_ventas_comercial_estado_case_insensitive_runtime_status_actual AS
SELECT *
FROM public.validar_ventas_comercial_estado_case_insensitive_runtime(app.resolve_request_tenant_id());

COMMIT;
