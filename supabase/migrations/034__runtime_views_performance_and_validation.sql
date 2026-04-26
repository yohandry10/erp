-- ============================================================================
-- 034__runtime_views_performance_and_validation.sql
-- Índices para vistas runtime + validación estructural de vistas críticas.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Índices de performance para consultas reales
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF app.column_exists('productos', 'tenant_id')
     AND app.column_exists('productos', 'activo')
     AND app.column_exists('productos', 'nombre')
     AND app.column_exists('productos', 'created_at') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_productos_pos_runtime ON public.productos (tenant_id, activo, nombre, created_at DESC)';
  END IF;

  IF app.column_exists('recepciones', 'tenant_id')
     AND app.column_exists('recepciones', 'fecha_recepcion')
     AND app.column_exists('recepciones', 'estado') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepciones_runtime_tenant_estado_fecha ON public.recepciones (tenant_id, estado, fecha_recepcion DESC)';
  END IF;

  IF app.column_exists('recepciones', 'tenant_id')
     AND app.column_exists('recepciones', 'orden_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepciones_runtime_tenant_orden ON public.recepciones (tenant_id, orden_id)';
  END IF;

  IF app.column_exists('recepcion_items', 'recepcion_id')
     AND app.column_exists('recepcion_items', 'producto_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepcion_items_runtime_recepcion_producto ON public.recepcion_items (recepcion_id, producto_id)';
  END IF;

  IF app.column_exists('recepcion_items', 'almacen_id')
     AND app.column_exists('recepcion_items', 'ubicacion_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recepcion_items_runtime_almacen_ubicacion ON public.recepcion_items (almacen_id, ubicacion_id)';
  END IF;

  IF app.column_exists('orden_compra_detalles', 'orden_id')
     AND app.column_exists('orden_compra_detalles', 'producto_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orden_compra_detalles_runtime_orden_producto ON public.orden_compra_detalles (orden_id, producto_id)';
  END IF;

  IF app.column_exists('documentos', 'tenant_id')
     AND app.column_exists('documentos', 'tipo_documento')
     AND app.column_exists('documentos', 'fecha_emision') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_documentos_runtime_tenant_tipo_fecha ON public.documentos (tenant_id, tipo_documento, fecha_emision DESC)';
  END IF;

  IF app.column_exists('cpe', 'tenant_id')
     AND app.column_exists('cpe', 'fecha_emision')
     AND app.column_exists('cpe', 'sunat_status') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cpe_runtime_tenant_fecha_status ON public.cpe (tenant_id, fecha_emision DESC, sunat_status)';
  END IF;

  IF app.column_exists('cpe', 'documento_id')
     AND app.column_exists('cpe', 'tenant_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cpe_runtime_documento_tenant ON public.cpe (documento_id, tenant_id)';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- Validación estructural de vistas críticas usadas por runtime
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_vistas_operacionales_core()
RETURNS TABLE (
  view_name text,
  status text,
  missing_columns text[],
  checked_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
WITH expected(view_name, column_name) AS (
  VALUES
    ('vista_pos_productos', 'id'),
    ('vista_pos_productos', 'tenant_id'),
    ('vista_pos_productos', 'codigo'),
    ('vista_pos_productos', 'nombre'),
    ('vista_pos_productos', 'activo'),
    ('vista_pos_productos', 'precio_venta'),
    ('vista_pos_productos', 'stock_actual'),
    ('vista_pos_productos', 'stock_reservado'),
    ('vista_pos_productos', 'stock_disponible'),
    ('vista_pos_productos', 'es_servicio'),

    ('vw_inventario_recepciones', 'recepcion_id'),
    ('vw_inventario_recepciones', 'tenant_id'),
    ('vw_inventario_recepciones', 'numero'),
    ('vw_inventario_recepciones', 'fecha_recepcion'),
    ('vw_inventario_recepciones', 'estado'),
    ('vw_inventario_recepciones', 'orden_id'),
    ('vw_inventario_recepciones', 'proveedor_id'),
    ('vw_inventario_recepciones', 'total_items'),
    ('vw_inventario_recepciones', 'cantidad_total'),
    ('vw_inventario_recepciones', 'valor_total'),
    ('vw_inventario_recepciones', 'moneda'),

    ('vw_kardex_valorizado', 'recepcion_item_id'),
    ('vw_kardex_valorizado', 'tenant_id'),
    ('vw_kardex_valorizado', 'fecha_recepcion'),
    ('vw_kardex_valorizado', 'producto_id'),
    ('vw_kardex_valorizado', 'cantidad_recibida'),
    ('vw_kardex_valorizado', 'costo_unitario'),
    ('vw_kardex_valorizado', 'valor_total'),
    ('vw_kardex_valorizado', 'almacen_id'),
    ('vw_kardex_valorizado', 'moneda_detalle'),

    ('vw_cpe_documentos_auditoria', 'cpe_id'),
    ('vw_cpe_documentos_auditoria', 'tenant_id'),
    ('vw_cpe_documentos_auditoria', 'tipo_documento'),
    ('vw_cpe_documentos_auditoria', 'estado_integridad'),

    ('v_kpis_sunat_multitenant', 'tenant_id'),
    ('v_kpis_sunat_multitenant', 'periodo'),
    ('v_kpis_sunat_multitenant', 'aceptados'),
    ('v_kpis_sunat_multitenant', 'observados'),
    ('v_kpis_sunat_multitenant', 'rechazados'),
    ('v_kpis_sunat_multitenant', 'pendientes'),
    ('v_kpis_sunat_multitenant', 'total')
),
present AS (
  SELECT
    c.table_name AS view_name,
    c.column_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name IN (
      SELECT DISTINCT e.view_name
      FROM expected e
    )
),
missing AS (
  SELECT
    e.view_name,
    e.column_name
  FROM expected e
  LEFT JOIN present p
    ON p.view_name = e.view_name
   AND p.column_name = e.column_name
  WHERE p.column_name IS NULL
),
summary AS (
  SELECT
    v.view_name,
    COUNT(m.column_name)::integer AS missing_count,
    COALESCE(
      ARRAY_AGG(m.column_name ORDER BY m.column_name) FILTER (WHERE m.column_name IS NOT NULL),
      ARRAY[]::text[]
    ) AS missing_columns
  FROM (
    SELECT DISTINCT view_name
    FROM expected
  ) v
  LEFT JOIN missing m ON m.view_name = v.view_name
  GROUP BY v.view_name
)
SELECT
  s.view_name,
  CASE
    WHEN s.missing_count = 0 THEN 'ok'
    ELSE 'missing_columns'
  END AS status,
  s.missing_columns,
  now() AS checked_at
FROM summary s
ORDER BY s.view_name;
$$;

CREATE OR REPLACE VIEW public.v_vistas_operacionales_core_status AS
SELECT *
FROM public.validar_vistas_operacionales_core();

COMMIT;
