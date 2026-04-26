-- ============================================================================
-- 151__compras_cotizaciones_devoluciones_validation_pack.sql
-- Pack de validacion runtime para cotizaciones de compra, aprobaciones y
-- devoluciones a proveedor.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_compras_cotizaciones_devoluciones_runtime(
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
    'trigger_normalize_cotizaciones_compra_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizaciones_compra'
        AND t.tgname = 'trg_normalize_cotizaciones_compra_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en cotizaciones_compra';

  RETURN QUERY
  SELECT
    'trigger_enforce_cotizaciones_compra_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizaciones_compra'
        AND t.tgname = 'trg_enforce_cotizaciones_compra_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en cotizaciones_compra';

  RETURN QUERY
  SELECT
    'trigger_normalize_cotizacion_compra_detalles_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizacion_compra_detalles'
        AND t.tgname = 'trg_normalize_cotizacion_compra_detalles_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en cotizacion_compra_detalles';

  RETURN QUERY
  SELECT
    'trigger_enforce_cotizacion_compra_detalles_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizacion_compra_detalles'
        AND t.tgname = 'trg_enforce_cotizacion_compra_detalles_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en cotizacion_compra_detalles';

  RETURN QUERY
  SELECT
    'trigger_normalize_oc_aprobaciones_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'oc_aprobaciones'
        AND t.tgname = 'trg_normalize_oc_aprobaciones_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en oc_aprobaciones';

  RETURN QUERY
  SELECT
    'trigger_enforce_oc_aprobaciones_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'oc_aprobaciones'
        AND t.tgname = 'trg_enforce_oc_aprobaciones_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en oc_aprobaciones';

  RETURN QUERY
  SELECT
    'trigger_normalize_devoluciones_proveedor_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'devoluciones_proveedor'
        AND t.tgname = 'trg_normalize_devoluciones_proveedor_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en devoluciones_proveedor';

  RETURN QUERY
  SELECT
    'trigger_enforce_devoluciones_proveedor_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'devoluciones_proveedor'
        AND t.tgname = 'trg_enforce_devoluciones_proveedor_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en devoluciones_proveedor';

  RETURN QUERY
  SELECT
    'trigger_normalize_devolucion_items_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'devolucion_items'
        AND t.tgname = 'trg_normalize_devolucion_items_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en devolucion_items';

  RETURN QUERY
  SELECT
    'trigger_enforce_devolucion_items_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'devolucion_items'
        AND t.tgname = 'trg_enforce_devolucion_items_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en devolucion_items';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'cotizaciones_compra_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 15
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cotizaciones_compra'
        AND c.column_name IN (
          'tenant_id', 'numero', 'proveedor_id', 'orden_compra_id', 'cotizacion_id',
          'fecha_cotizacion', 'fecha_vencimiento', 'validez_dias', 'estado',
          'subtotal', 'igv', 'total', 'observaciones', 'created_by', 'updated_by'
        )
    ),
    'shape runtime de cotizaciones_compra';

  RETURN QUERY
  SELECT
    'cotizacion_compra_detalles_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'cotizacion_compra_detalles'
        AND c.column_name IN (
          'tenant_id', 'cotizacion_id', 'orden_compra_id', 'producto_id',
          'descripcion', 'cantidad', 'precio_unitario', 'subtotal'
        )
    ),
    'shape runtime de cotizacion_compra_detalles';

  RETURN QUERY
  SELECT
    'oc_aprobaciones_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'oc_aprobaciones'
        AND c.column_name IN (
          'tenant_id', 'orden_id', 'aprobador_id', 'aprobador_nombre',
          'nivel', 'estado', 'fecha_aprobacion', 'comentarios'
        )
    ),
    'shape runtime de oc_aprobaciones';

  RETURN QUERY
  SELECT
    'devoluciones_proveedor_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'devoluciones_proveedor'
        AND c.column_name IN (
          'tenant_id', 'numero', 'orden_id', 'proveedor_id', 'recepcion_id',
          'fecha_devolucion', 'estado', 'motivo', 'observaciones', 'moneda',
          'subtotal', 'igv', 'total', 'emitido_por'
        )
    ),
    'shape runtime de devoluciones_proveedor';

  RETURN QUERY
  SELECT
    'devolucion_items_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'devolucion_items'
        AND c.column_name IN (
          'tenant_id', 'devolucion_id', 'recepcion_item_id', 'producto_id',
          'descripcion', 'cantidad', 'precio_unitario', 'subtotal',
          'almacen_id', 'lote', 'serie'
        )
    ),
    'shape runtime de devolucion_items';

  -- FKs operativas esperadas
  RETURN QUERY
  SELECT 'fk_cotizaciones_compra_proveedor_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'cotizaciones_compra_proveedor_id_fkey'
        AND conrelid = 'public.cotizaciones_compra'::regclass
    ),
    'FK cotizaciones_compra -> proveedores';

  RETURN QUERY
  SELECT 'fk_cotizacion_compra_detalles_cotizacion_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'cotizacion_compra_detalles_cotizacion_id_fkey_runtime'
        AND conrelid = 'public.cotizacion_compra_detalles'::regclass
    ),
    'FK cotizacion_compra_detalles -> cotizaciones_compra';

  RETURN QUERY
  SELECT 'fk_oc_aprobaciones_orden_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'oc_aprobaciones_orden_id_fkey_runtime'
        AND conrelid = 'public.oc_aprobaciones'::regclass
    ),
    'FK oc_aprobaciones -> ordenes_compra';

  RETURN QUERY
  SELECT 'fk_devoluciones_proveedor_orden_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'devoluciones_proveedor_orden_id_fkey_runtime'
        AND conrelid = 'public.devoluciones_proveedor'::regclass
    ),
    'FK devoluciones_proveedor -> ordenes_compra';

  RETURN QUERY
  SELECT 'fk_devolucion_items_devolucion_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'devolucion_items_devolucion_id_fkey_runtime'
        AND conrelid = 'public.devolucion_items'::regclass
    ),
    'FK devolucion_items -> devoluciones_proveedor';

  -- Indices de soporte esperados
  RETURN QUERY
  SELECT 'ux_cotizaciones_compra_tenant_numero_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'cotizaciones_compra'
        AND indexname = 'ux_cotizaciones_compra_tenant_numero_runtime'
    ),
    'unicidad tenant+numero en cotizaciones_compra';

  RETURN QUERY
  SELECT 'ux_devoluciones_proveedor_tenant_numero_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'devoluciones_proveedor'
        AND indexname = 'ux_devoluciones_proveedor_tenant_numero_runtime'
    ),
    'unicidad tenant+numero en devoluciones_proveedor';

  RETURN QUERY
  SELECT 'ux_oc_aprobaciones_pending_scope_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'oc_aprobaciones'
        AND indexname = 'ux_oc_aprobaciones_pending_scope_runtime'
    ),
    'unicidad pending por scope de aprobacion';

  -- RLS
  RETURN QUERY
  SELECT 'rls_cotizaciones_compra_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizaciones_compra'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cotizaciones_compra';

  RETURN QUERY
  SELECT 'rls_cotizacion_compra_detalles_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'cotizacion_compra_detalles'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en cotizacion_compra_detalles';

  RETURN QUERY
  SELECT 'rls_oc_aprobaciones_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'oc_aprobaciones'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en oc_aprobaciones';

  RETURN QUERY
  SELECT 'rls_devoluciones_proveedor_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'devoluciones_proveedor'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en devoluciones_proveedor';

  RETURN QUERY
  SELECT 'rls_devolucion_items_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'devolucion_items'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en devolucion_items';

  -- Duplicados por scope
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(numero)) AS numero_norm, COUNT(*) AS cnt
    FROM public.cotizaciones_compra
    WHERE tenant_id IS NOT NULL
      AND numero IS NOT NULL
      AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(numero))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'cotizaciones_compra_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(numero)) AS numero_norm, COUNT(*) AS cnt
    FROM public.devoluciones_proveedor
    WHERE tenant_id IS NOT NULL
      AND numero IS NOT NULL
      AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(numero))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'devoluciones_proveedor_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, orden_id, nivel, upper(btrim(aprobador_id)) AS aprobador_norm, COUNT(*) AS cnt
    FROM public.oc_aprobaciones
    WHERE tenant_id IS NOT NULL
      AND orden_id IS NOT NULL
      AND estado = 'PENDIENTE'
      AND aprobador_id IS NOT NULL
      AND btrim(aprobador_id) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, orden_id, nivel, upper(btrim(aprobador_id))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'oc_aprobaciones_pending_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas invalidas por reglas core
  SELECT COUNT(*) INTO v_count
  FROM public.cotizaciones_compra c
  WHERE (
      c.tenant_id IS NULL
      OR c.proveedor_id IS NULL
      OR c.numero IS NULL OR btrim(c.numero) = ''
      OR c.fecha_cotizacion IS NULL
      OR c.fecha_vencimiento IS NULL
      OR c.fecha_vencimiento < c.fecha_cotizacion
      OR c.validez_dias IS NULL OR c.validez_dias < 1
      OR c.estado NOT IN ('BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'VENCIDA')
      OR c.subtotal < 0 OR c.igv < 0 OR c.total < 0
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cotizaciones_compra_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.cotizacion_compra_detalles d
  WHERE (
      d.tenant_id IS NULL
      OR d.cotizacion_id IS NULL
      OR d.producto_id IS NULL
      OR d.descripcion IS NULL OR btrim(d.descripcion) = ''
      OR d.cantidad <= 0
      OR d.precio_unitario < 0
      OR d.subtotal < 0
    )
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cotizacion_compra_detalles_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.oc_aprobaciones oa
  WHERE (
      oa.tenant_id IS NULL
      OR oa.orden_id IS NULL
      OR oa.aprobador_id IS NULL OR btrim(oa.aprobador_id) = ''
      OR oa.nivel < 1
      OR oa.estado NOT IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')
      OR (oa.estado <> 'PENDIENTE' AND oa.fecha_aprobacion IS NULL)
    )
    AND (p_tenant_id IS NULL OR oa.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'oc_aprobaciones_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.devoluciones_proveedor d
  WHERE (
      d.tenant_id IS NULL
      OR d.orden_id IS NULL
      OR d.proveedor_id IS NULL
      OR d.numero IS NULL OR btrim(d.numero) = ''
      OR d.fecha_devolucion IS NULL
      OR d.estado NOT IN ('PENDIENTE', 'EMITIDA', 'ANULADA', 'RECHAZADA')
      OR d.subtotal < 0 OR d.igv < 0 OR d.total < 0
      OR d.moneda IS NULL OR d.moneda !~ '^[A-Z]{3}$'
    )
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'devoluciones_proveedor_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.devolucion_items di
  WHERE (
      di.tenant_id IS NULL
      OR di.devolucion_id IS NULL
      OR di.producto_id IS NULL
      OR di.descripcion IS NULL OR btrim(di.descripcion) = ''
      OR di.cantidad <= 0
      OR di.precio_unitario < 0
      OR di.subtotal < 0
    )
    AND (p_tenant_id IS NULL OR di.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'devolucion_items_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Mismatch tenant por relaciones
  SELECT COUNT(*) INTO v_count
  FROM public.cotizacion_compra_detalles d
  JOIN public.cotizaciones_compra c ON c.id = d.cotizacion_id
  WHERE d.tenant_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND d.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cotizacion_compra_detalles_vs_cotizaciones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.oc_aprobaciones oa
  JOIN public.ordenes_compra oc ON oc.id = oa.orden_id
  WHERE oa.tenant_id IS NOT NULL
    AND oc.tenant_id IS NOT NULL
    AND oa.tenant_id <> oc.tenant_id
    AND (p_tenant_id IS NULL OR oa.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'oc_aprobaciones_vs_ordenes_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.devoluciones_proveedor d
  JOIN public.ordenes_compra oc ON oc.id = d.orden_id
  WHERE d.tenant_id IS NOT NULL
    AND oc.tenant_id IS NOT NULL
    AND d.tenant_id <> oc.tenant_id
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'devoluciones_vs_ordenes_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.devoluciones_proveedor d
  JOIN public.proveedores p ON p.id = d.proveedor_id
  WHERE d.tenant_id IS NOT NULL
    AND p.tenant_id IS NOT NULL
    AND d.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'devoluciones_vs_proveedores_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.devolucion_items di
  JOIN public.devoluciones_proveedor d ON d.id = di.devolucion_id
  WHERE di.tenant_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND di.tenant_id <> d.tenant_id
    AND (p_tenant_id IS NULL OR di.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'devolucion_items_vs_devoluciones_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.devolucion_items di
  JOIN public.recepcion_items ri ON ri.id = di.recepcion_item_id
  WHERE di.recepcion_item_id IS NOT NULL
    AND (
      (di.tenant_id IS NOT NULL AND ri.tenant_id IS NOT NULL AND di.tenant_id <> ri.tenant_id)
      OR (di.producto_id IS NOT NULL AND ri.producto_id IS NOT NULL AND di.producto_id <> ri.producto_id)
    )
    AND (p_tenant_id IS NULL OR di.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'devolucion_items_vs_recepcion_items_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  -- Huerfanos de relaciones clave
  SELECT COUNT(*) INTO v_count
  FROM public.cotizacion_compra_detalles d
  LEFT JOIN public.cotizaciones_compra c ON c.id = d.cotizacion_id
  WHERE d.cotizacion_id IS NOT NULL
    AND c.id IS NULL
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'cotizacion_compra_detalles_orphan_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.oc_aprobaciones oa
  LEFT JOIN public.ordenes_compra oc ON oc.id = oa.orden_id
  WHERE oa.orden_id IS NOT NULL
    AND oc.id IS NULL
    AND (p_tenant_id IS NULL OR oa.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'oc_aprobaciones_orphan_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.devolucion_items di
  LEFT JOIN public.devoluciones_proveedor d ON d.id = di.devolucion_id
  WHERE di.devolucion_id IS NOT NULL
    AND d.id IS NULL
    AND (p_tenant_id IS NULL OR di.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'devolucion_items_orphan_rows'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_compras_cotizaciones_devoluciones_runtime_status_actual AS
SELECT *
FROM public.validar_compras_cotizaciones_devoluciones_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
