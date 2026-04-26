-- ============================================================================
-- 139__logistica_pedidos_validation_pack.sql
-- Pack de validación runtime para logística de pedidos.
-- Tablas: logistica_eventos, pedido_backorders, pedido_despachos, pedido_gres.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_logistica_pedidos_runtime(
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
    'trigger_normalize_logistica_eventos_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'logistica_eventos'
        AND t.tgname = 'trg_normalize_logistica_eventos_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en logistica_eventos';

  RETURN QUERY
  SELECT
    'trigger_enforce_logistica_eventos_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'logistica_eventos'
        AND t.tgname = 'trg_enforce_logistica_eventos_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en logistica_eventos';

  RETURN QUERY
  SELECT
    'trigger_normalize_pedido_backorders_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_backorders'
        AND t.tgname = 'trg_normalize_pedido_backorders_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en pedido_backorders';

  RETURN QUERY
  SELECT
    'trigger_enforce_pedido_backorders_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_backorders'
        AND t.tgname = 'trg_enforce_pedido_backorders_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en pedido_backorders';

  RETURN QUERY
  SELECT
    'trigger_normalize_pedido_despachos_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_despachos'
        AND t.tgname = 'trg_normalize_pedido_despachos_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en pedido_despachos';

  RETURN QUERY
  SELECT
    'trigger_enforce_pedido_despachos_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_despachos'
        AND t.tgname = 'trg_enforce_pedido_despachos_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en pedido_despachos';

  RETURN QUERY
  SELECT
    'trigger_normalize_pedido_gres_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_gres'
        AND t.tgname = 'trg_normalize_pedido_gres_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en pedido_gres';

  RETURN QUERY
  SELECT
    'trigger_enforce_pedido_gres_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_gres'
        AND t.tgname = 'trg_enforce_pedido_gres_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en pedido_gres';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'logistica_eventos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'logistica_eventos'
        AND c.column_name IN (
          'tenant_id', 'pedido_id', 'tipo', 'datos', 'registrado_por', 'registrado_en', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de logistica_eventos';

  RETURN QUERY
  SELECT
    'pedido_backorders_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 15
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedido_backorders'
        AND c.column_name IN (
          'tenant_id', 'pedido_id', 'detalle_id', 'producto_id',
          'cantidad_comprometida', 'cantidad_despachada', 'cantidad_pendiente',
          'estado', 'notas', 'proxima_fecha_compromiso', 'ultimo_compromiso_en',
          'prioridad', 'almacen_id', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de pedido_backorders';

  RETURN QUERY
  SELECT
    'pedido_despachos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 13
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedido_despachos'
        AND c.column_name IN (
          'tenant_id', 'pedido_id', 'detalle_id', 'producto_id',
          'cantidad', 'registrado_por', 'registrado_en', 'notas',
          'almacen_id', 'ubicacion_id', 'lote', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de pedido_despachos';

  RETURN QUERY
  SELECT
    'pedido_gres_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedido_gres'
        AND c.column_name IN (
          'tenant_id', 'pedido_id', 'gre_id', 'estado', 'notas',
          'creado_por', 'creado_en', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de pedido_gres';

  -- FKs esperadas para embeds/joins.
  RETURN QUERY
  SELECT 'fk_pedido_backorders_detalle_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedido_backorders_detalle_id' AND conrelid = 'public.pedido_backorders'::regclass),
    'FK de pedido_backorders a pedidos_venta_detalle';

  RETURN QUERY
  SELECT 'fk_pedido_despachos_pedido_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_despachos_pedido_id_fkey' AND conrelid = 'public.pedido_despachos'::regclass),
    'FK de pedido_despachos a pedidos_venta';

  RETURN QUERY
  SELECT 'fk_pedido_despachos_detalle_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_despachos_detalle_id_fkey' AND conrelid = 'public.pedido_despachos'::regclass),
    'FK de pedido_despachos a pedidos_venta_detalle';

  RETURN QUERY
  SELECT 'fk_pedido_gres_pedido_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_gres_pedido_id_fkey' AND conrelid = 'public.pedido_gres'::regclass),
    'FK de pedido_gres a pedidos_venta';

  RETURN QUERY
  SELECT 'fk_pedido_gres_gre_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_gres_gre_id_fkey' AND conrelid = 'public.pedido_gres'::regclass),
    'FK de pedido_gres a gre_guias';

  RETURN QUERY
  SELECT 'fk_logistica_eventos_pedido_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'logistica_eventos_pedido_id_fkey' AND conrelid = 'public.logistica_eventos'::regclass),
    'FK de logistica_eventos a pedidos_venta';

  -- Índices de soporte.
  RETURN QUERY
  SELECT 'ux_pedido_backorders_detalle_id_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pedido_backorders' AND indexname = 'ux_pedido_backorders_detalle_id'),
    'unicidad por detalle en pedido_backorders';

  RETURN QUERY
  SELECT 'pedido_gres_unique_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pedido_gres' AND indexname = 'pedido_gres_unique'),
    'unicidad tenant+pedido+gre en pedido_gres';

  RETURN QUERY
  SELECT 'idx_logistica_eventos_tenant_pedido_registrado_runtime_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'logistica_eventos' AND indexname = 'idx_logistica_eventos_tenant_pedido_registrado_runtime'),
    'índice runtime de timeline logístico';

  RETURN QUERY
  SELECT 'idx_pedido_despachos_tenant_pedido_registrado_runtime_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pedido_despachos' AND indexname = 'idx_pedido_despachos_tenant_pedido_registrado_runtime'),
    'índice runtime de despachos';

  RETURN QUERY
  SELECT 'idx_pedido_backorders_tenant_pedido_prioridad_runtime_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pedido_backorders' AND indexname = 'idx_pedido_backorders_tenant_pedido_prioridad_runtime'),
    'índice runtime de backorders';

  -- RLS
  RETURN QUERY
  SELECT 'rls_logistica_eventos_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'logistica_eventos' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en logistica_eventos';

  RETURN QUERY
  SELECT 'rls_pedido_backorders_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_backorders' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedido_backorders';

  RETURN QUERY
  SELECT 'rls_pedido_despachos_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_despachos' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedido_despachos';

  RETURN QUERY
  SELECT 'rls_pedido_gres_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedido_gres' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedido_gres';

  -- Duplicados por scope.
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, pedido_id, gre_id, COUNT(*) AS cnt
    FROM public.pedido_gres
    WHERE tenant_id IS NOT NULL
      AND pedido_id IS NOT NULL
      AND gre_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, pedido_id, gre_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'pedido_gres_duplicate_scope'::text, (v_count = 0), format('duplicates=%s', v_count);

  -- Filas inválidas.
  SELECT COUNT(*) INTO v_count
  FROM public.pedido_backorders pb
  WHERE (
      pb.tenant_id IS NULL
      OR pb.pedido_id IS NULL
      OR pb.detalle_id IS NULL
      OR pb.producto_id IS NULL
      OR pb.estado NOT IN ('PENDIENTE', 'PARCIAL', 'CERRADO')
      OR pb.prioridad < 1 OR pb.prioridad > 5
      OR pb.cantidad_comprometida < 0
      OR pb.cantidad_despachada < 0
      OR pb.cantidad_pendiente < 0
      OR pb.cantidad_despachada > pb.cantidad_comprometida
      OR round((pb.cantidad_comprometida - pb.cantidad_despachada)::numeric, 2) <> round(pb.cantidad_pendiente::numeric, 2)
    )
    AND (p_tenant_id IS NULL OR pb.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedido_backorders_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.pedido_despachos pd
  WHERE (
      pd.tenant_id IS NULL
      OR pd.pedido_id IS NULL
      OR pd.detalle_id IS NULL
      OR pd.producto_id IS NULL
      OR pd.cantidad <= 0
      OR pd.estado NOT IN ('REGISTRADO', 'ANULADO')
    )
    AND (p_tenant_id IS NULL OR pd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedido_despachos_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.pedido_gres pg
  WHERE (
      pg.tenant_id IS NULL
      OR pg.pedido_id IS NULL
      OR pg.gre_id IS NULL
      OR pg.creado_en IS NULL
      OR pg.estado NOT IN ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO')
    )
    AND (p_tenant_id IS NULL OR pg.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedido_gres_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.logistica_eventos le
  WHERE (
      le.tenant_id IS NULL
      OR le.pedido_id IS NULL
      OR le.tipo NOT IN ('PICKING', 'PACKING', 'DESPACHO', 'TRANSITO', 'ENTREGA', 'BACKORDER')
      OR le.datos IS NULL
      OR jsonb_typeof(le.datos) <> 'object'
    )
    AND (p_tenant_id IS NULL OR le.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'logistica_eventos_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Mismatches tenant por relaciones.
  SELECT COUNT(*) INTO v_count
  FROM public.pedido_backorders pb
  JOIN public.pedidos_venta_detalle d ON d.id = pb.detalle_id
  WHERE pb.tenant_id IS NOT NULL AND d.tenant_id IS NOT NULL AND pb.tenant_id <> d.tenant_id
    AND (p_tenant_id IS NULL OR pb.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedido_backorders_vs_detalle_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.pedido_despachos pd
  JOIN public.pedidos_venta_detalle d ON d.id = pd.detalle_id
  WHERE pd.tenant_id IS NOT NULL AND d.tenant_id IS NOT NULL AND pd.tenant_id <> d.tenant_id
    AND (p_tenant_id IS NULL OR pd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedido_despachos_vs_detalle_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.pedido_gres pg
  JOIN public.pedidos_venta p ON p.id = pg.pedido_id
  WHERE pg.tenant_id IS NOT NULL AND p.tenant_id IS NOT NULL AND pg.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR pg.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedido_gres_vs_pedidos_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.pedido_gres pg
  JOIN public.gre_guias g ON g.id = pg.gre_id
  WHERE pg.tenant_id IS NOT NULL AND g.tenant_id IS NOT NULL AND pg.tenant_id <> g.tenant_id
    AND (p_tenant_id IS NULL OR pg.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedido_gres_vs_gre_guias_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.logistica_eventos le
  JOIN public.pedidos_venta p ON p.id = le.pedido_id
  WHERE le.tenant_id IS NOT NULL AND p.tenant_id IS NOT NULL AND le.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR le.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'logistica_eventos_vs_pedidos_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_logistica_pedidos_runtime_status_actual AS
SELECT *
FROM public.validar_logistica_pedidos_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
