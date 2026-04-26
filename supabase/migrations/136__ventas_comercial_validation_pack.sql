-- ============================================================================
-- 136__ventas_comercial_validation_pack.sql
-- Pack de validación runtime para ventas comercial.
-- Tablas: cotizaciones, cotizacion_detalles, pedidos_venta, pedidos_venta_detalle.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_ventas_comercial_runtime(
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
    'trigger_normalize_cotizaciones_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cotizaciones'
        AND t.tgname = 'trg_normalize_cotizaciones_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en cotizaciones';

  RETURN QUERY
  SELECT
    'trigger_enforce_cotizaciones_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cotizaciones'
        AND t.tgname = 'trg_enforce_cotizaciones_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en cotizaciones';

  RETURN QUERY
  SELECT
    'trigger_normalize_cotizacion_detalles_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cotizacion_detalles'
        AND t.tgname = 'trg_normalize_cotizacion_detalles_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en cotizacion_detalles';

  RETURN QUERY
  SELECT
    'trigger_enforce_cotizacion_detalles_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cotizacion_detalles'
        AND t.tgname = 'trg_enforce_cotizacion_detalles_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en cotizacion_detalles';

  RETURN QUERY
  SELECT
    'trigger_normalize_pedidos_venta_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedidos_venta'
        AND t.tgname = 'trg_normalize_pedidos_venta_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en pedidos_venta';

  RETURN QUERY
  SELECT
    'trigger_enforce_pedidos_venta_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedidos_venta'
        AND t.tgname = 'trg_enforce_pedidos_venta_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en pedidos_venta';

  RETURN QUERY
  SELECT
    'trigger_normalize_pedidos_venta_detalle_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedidos_venta_detalle'
        AND t.tgname = 'trg_normalize_pedidos_venta_detalle_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en pedidos_venta_detalle';

  RETURN QUERY
  SELECT
    'trigger_enforce_pedidos_venta_detalle_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedidos_venta_detalle'
        AND t.tgname = 'trg_enforce_pedidos_venta_detalle_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en pedidos_venta_detalle';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'cotizaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 15
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cotizaciones'
        AND c.column_name IN (
          'tenant_id', 'cliente_id', 'numero', 'fecha', 'fecha_cotizacion', 'fecha_vencimiento',
          'estado', 'subtotal', 'igv', 'total', 'moneda', 'probabilidad', 'items', 'pedido_id', 'observaciones'
        )
    ),
    'columnas runtime de cotizaciones';

  RETURN QUERY
  SELECT
    'cotizacion_detalles_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cotizacion_detalles'
        AND c.column_name IN (
          'tenant_id', 'cotizacion_id', 'producto_id', 'descripcion', 'cantidad',
          'precio_unitario', 'descuento_porcentaje', 'descuento_monto', 'orden'
        )
    ),
    'columnas runtime de cotizacion_detalles';

  RETURN QUERY
  SELECT
    'pedidos_venta_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedidos_venta'
        AND c.column_name IN (
          'tenant_id', 'cliente_id', 'cotizacion_id', 'numero', 'fecha', 'fecha_pedido', 'estado',
          'subtotal', 'igv', 'total', 'moneda', 'requiere_aprobacion', 'estado_credito',
          'tracking_estado', 'tracking_actualizado_en', 'tracking_notas'
        )
    ),
    'columnas runtime de pedidos_venta';

  RETURN QUERY
  SELECT
    'pedidos_venta_detalle_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'pedidos_venta_detalle'
        AND c.column_name IN (
          'tenant_id', 'pedido_id', 'producto_id', 'descripcion', 'cantidad',
          'precio_unitario', 'subtotal', 'cantidad_despachada', 'cantidad_facturada', 'estado_item'
        )
    ),
    'columnas runtime de pedidos_venta_detalle';

  -- FKs esperadas para embeds/joins.
  RETURN QUERY
  SELECT 'fk_cotizaciones_cliente_id_fkey_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_cliente_id_fkey' AND conrelid = 'public.cotizaciones'::regclass),
    'FK de cotizaciones a clientes';

  RETURN QUERY
  SELECT 'fk_pedidos_venta_cliente_id_fkey_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_venta_cliente_id_fkey' AND conrelid = 'public.pedidos_venta'::regclass),
    'FK de pedidos_venta a clientes';

  RETURN QUERY
  SELECT 'fk_pedidos_venta_cotizacion_id_fkey_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_venta_cotizacion_id_fkey' AND conrelid = 'public.pedidos_venta'::regclass),
    'FK de pedidos_venta a cotizaciones';

  RETURN QUERY
  SELECT 'fk_cotizacion_detalles_cotizacion_id_fkey_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizacion_detalles_cotizacion_id_fkey' AND conrelid = 'public.cotizacion_detalles'::regclass),
    'FK de cotizacion_detalles a cotizaciones';

  RETURN QUERY
  SELECT 'fk_pedidos_venta_detalle_pedido_id_fkey_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_venta_detalle_pedido_id_fkey' AND conrelid = 'public.pedidos_venta_detalle'::regclass),
    'FK de pedidos_venta_detalle a pedidos_venta';

  -- Índices de soporte.
  RETURN QUERY
  SELECT 'ux_cotizaciones_tenant_numero_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'cotizaciones' AND indexname = 'ux_cotizaciones_tenant_numero'),
    'unicidad tenant+numero en cotizaciones';

  RETURN QUERY
  SELECT 'ux_pedidos_venta_tenant_numero_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pedidos_venta' AND indexname = 'ux_pedidos_venta_tenant_numero'),
    'unicidad tenant+numero en pedidos_venta';

  RETURN QUERY
  SELECT 'ux_cotizacion_detalles_tenant_cotizacion_orden_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'cotizacion_detalles' AND indexname = 'ux_cotizacion_detalles_tenant_cotizacion_orden'),
    'unicidad tenant+cotizacion+orden en cotizacion_detalles';

  -- RLS
  RETURN QUERY
  SELECT 'rls_cotizaciones_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cotizaciones' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cotizaciones';

  RETURN QUERY
  SELECT 'rls_cotizacion_detalles_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'cotizacion_detalles' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cotizacion_detalles';

  RETURN QUERY
  SELECT 'rls_pedidos_venta_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedidos_venta' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedidos_venta';

  RETURN QUERY
  SELECT 'rls_pedidos_venta_detalle_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'pedidos_venta_detalle' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en pedidos_venta_detalle';

  -- Duplicados de scope.
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(numero)), COUNT(*) AS cnt
    FROM public.cotizaciones
    WHERE tenant_id IS NOT NULL AND numero IS NOT NULL AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(numero))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'cotizaciones_duplicate_numero_scope'::text, (v_count = 0), format('duplicates=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(numero)), COUNT(*) AS cnt
    FROM public.pedidos_venta
    WHERE tenant_id IS NOT NULL AND numero IS NOT NULL AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(numero))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'pedidos_venta_duplicate_numero_scope'::text, (v_count = 0), format('duplicates=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, cotizacion_id, orden, COUNT(*) AS cnt
    FROM public.cotizacion_detalles
    WHERE tenant_id IS NOT NULL AND cotizacion_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, cotizacion_id, orden
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'cotizacion_detalles_duplicate_orden_scope'::text, (v_count = 0), format('duplicates=%s', v_count);

  -- Filas inválidas.
  SELECT COUNT(*) INTO v_count
  FROM public.cotizaciones c
  WHERE (
      c.tenant_id IS NULL OR c.cliente_id IS NULL
      OR c.numero IS NULL OR btrim(c.numero) = ''
      OR c.estado NOT IN ('BORRADOR','ENVIADA','APROBADA','RECHAZADA','CONVERTIDA','VENCIDA')
      OR c.subtotal < 0 OR c.igv < 0 OR c.total < 0
      OR c.moneda IS NULL OR c.moneda !~ '^[A-Z]{3}$'
      OR c.items IS NULL OR jsonb_typeof(c.items) <> 'array'
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'cotizaciones_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.pedidos_venta p
  WHERE (
      p.tenant_id IS NULL OR p.cliente_id IS NULL
      OR p.numero IS NULL OR btrim(p.numero) = ''
      OR p.estado NOT IN ('PENDIENTE','PENDIENTE_APROBACION','CONFIRMADO','EN_PREPARACION','LISTO_DESPACHO','DESPACHO_PARCIAL','LISTO_FACTURAR','FACTURADO','COMPLETADO','COMPLETADO_CON_GRE','CANCELADO')
      OR p.subtotal < 0 OR p.igv < 0 OR p.total < 0
      OR p.moneda IS NULL OR p.moneda !~ '^[A-Z]{3}$'
      OR p.tracking_estado IS NULL OR btrim(p.tracking_estado) = ''
    )
    AND (p_tenant_id IS NULL OR p.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedidos_venta_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Mismatches tenant por relaciones.
  SELECT COUNT(*) INTO v_count
  FROM public.cotizacion_detalles cd
  JOIN public.cotizaciones c ON c.id = cd.cotizacion_id
  WHERE cd.tenant_id IS NOT NULL AND c.tenant_id IS NOT NULL AND cd.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR cd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'cotizacion_detalles_vs_cotizaciones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.pedidos_venta_detalle pd
  JOIN public.pedidos_venta p ON p.id = pd.pedido_id
  WHERE pd.tenant_id IS NOT NULL AND p.tenant_id IS NOT NULL AND pd.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR pd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'pedidos_venta_detalle_vs_pedidos_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_ventas_comercial_runtime_status_actual AS
SELECT *
FROM public.validar_ventas_comercial_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
