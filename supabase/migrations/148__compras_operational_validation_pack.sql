-- ============================================================================
-- 148__compras_operational_validation_pack.sql
-- Pack de validación runtime para compras operativo + alias legacy compras.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_compras_operational_runtime(
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
  SELECT 'trigger_normalize_compras_legacy_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'compras'
        AND t.tgname = 'trg_normalize_compras_legacy_row' AND NOT t.tgisinternal
    ),
    'normalización alias compras';

  RETURN QUERY
  SELECT 'trigger_sync_compras_from_ordenes_compra'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'ordenes_compra'
        AND t.tgname = 'trg_sync_compras_from_ordenes_compra' AND NOT t.tgisinternal
    ),
    'sync canónico -> alias';

  RETURN QUERY
  SELECT 'trigger_sync_ordenes_compra_from_compras'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'compras'
        AND t.tgname = 'trg_sync_ordenes_compra_from_compras' AND NOT t.tgisinternal
    ),
    'sync alias -> canónico';

  RETURN QUERY
  SELECT 'trigger_enforce_ordenes_compra_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'ordenes_compra'
        AND t.tgname = 'trg_enforce_ordenes_compra_tenant_consistency' AND NOT t.tgisinternal
    ),
    'consistencia tenant ordenes_compra';

  RETURN QUERY
  SELECT 'trigger_enforce_orden_compra_detalles_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'orden_compra_detalles'
        AND t.tgname = 'trg_enforce_orden_compra_detalles_tenant_consistency' AND NOT t.tgisinternal
    ),
    'consistencia tenant orden_compra_detalles';

  RETURN QUERY
  SELECT 'trigger_enforce_recepciones_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'recepciones'
        AND t.tgname = 'trg_enforce_recepciones_tenant_consistency' AND NOT t.tgisinternal
    ),
    'consistencia tenant recepciones';

  RETURN QUERY
  SELECT 'trigger_enforce_recepcion_items_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'recepcion_items'
        AND t.tgname = 'trg_enforce_recepcion_items_tenant_consistency' AND NOT t.tgisinternal
    ),
    'consistencia tenant recepcion_items';

  -- Columnas runtime
  RETURN QUERY
  SELECT
    'ordenes_compra_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 17
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'ordenes_compra'
        AND c.column_name IN (
          'tenant_id', 'numero', 'numero_orden', 'proveedor_id',
          'fecha', 'fecha_orden', 'fecha_entrega_esperada', 'estado',
          'subtotal', 'igv', 'total', 'moneda',
          'cotizacion_id', 'dias_credito', 'almacen_destino_id',
          'items', 'created_by'
        )
    ),
    'shape operativo de ordenes_compra';

  RETURN QUERY
  SELECT
    'compras_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'compras'
        AND c.column_name IN (
          'tenant_id', 'proveedor_id', 'fecha', 'tipo_documento',
          'numero_documento', 'estado', 'subtotal', 'igv', 'total', 'moneda'
        )
    ),
    'shape runtime de alias compras';

  RETURN QUERY
  SELECT
    'orden_compra_detalles_cantidad_pendiente_present'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'orden_compra_detalles'
        AND c.column_name = 'cantidad_pendiente'
    ),
    'columna runtime para detalle de orden';

  RETURN QUERY
  SELECT
    'recepciones_numero_text_present'::text,
    EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'recepciones'
        AND c.column_name = 'numero'
        AND c.data_type = 'text'
    ),
    'numero textual para patrón REC-YYYY-####';

  -- Relaciones FK mínimas
  RETURN QUERY
  SELECT 'fk_ordenes_compra_proveedores_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class ref ON ref.oid = con.confrelid
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
        AND rel.relname = 'ordenes_compra'
        AND ref.relname = 'proveedores'
    ),
    'FK de ordenes_compra a proveedores';

  RETURN QUERY
  SELECT 'fk_compras_proveedores_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class ref ON ref.oid = con.confrelid
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
        AND rel.relname = 'compras'
        AND ref.relname = 'proveedores'
    ),
    'FK de compras a proveedores';

  RETURN QUERY
  SELECT 'fk_recepcion_items_recepcion_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_class ref ON ref.oid = con.confrelid
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
        AND rel.relname = 'recepcion_items'
        AND ref.relname = 'recepciones'
    ),
    'FK de recepcion_items a recepciones';

  -- Índices
  RETURN QUERY
  SELECT 'ux_ordenes_compra_tenant_numero_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'ordenes_compra'
        AND indexname = 'ux_ordenes_compra_tenant_numero_runtime'
    ),
    'unicidad tenant+numero ordenes_compra';

  RETURN QUERY
  SELECT 'ux_compras_tenant_numero_documento_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'compras'
        AND indexname = 'ux_compras_tenant_numero_documento_runtime'
    ),
    'unicidad tenant+numero_documento compras';

  -- RLS
  RETURN QUERY
  SELECT 'rls_ordenes_compra_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'ordenes_compra'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en ordenes_compra';

  RETURN QUERY
  SELECT 'rls_compras_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'compras'
        AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en compras';

  -- Duplicados por scope
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(numero) AS numero_norm, COUNT(*) AS cnt
    FROM public.ordenes_compra
    WHERE tenant_id IS NOT NULL
      AND numero IS NOT NULL
      AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(numero)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'ordenes_compra_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(numero_documento) AS numero_norm, COUNT(*) AS cnt
    FROM public.compras
    WHERE tenant_id IS NOT NULL
      AND numero_documento IS NOT NULL
      AND btrim(numero_documento) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(numero_documento)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'compras_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas inválidas
  SELECT COUNT(*) INTO v_count
  FROM public.ordenes_compra oc
  WHERE (
      oc.tenant_id IS NULL
      OR oc.numero IS NULL OR btrim(oc.numero) = ''
      OR oc.estado NOT IN ('BORRADOR','PENDIENTE','APROBACION','APROBADA','PARCIAL','RECIBIDA','ANULADA','RECHAZADA','ENTREGADO','ENTREGADA')
      OR oc.subtotal < 0 OR oc.igv < 0 OR oc.total < 0
      OR oc.dias_credito < 0
    )
    AND (p_tenant_id IS NULL OR oc.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'ordenes_compra_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.compras c
  WHERE (
      c.tenant_id IS NULL
      OR c.fecha IS NULL
      OR c.numero_documento IS NULL OR btrim(c.numero_documento) = ''
      OR c.estado NOT IN ('PENDIENTE','ENTREGADA','ANULADA')
      OR c.subtotal < 0 OR c.igv < 0 OR c.total < 0
    )
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'compras_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Consistencia tenant en tablas hijas
  SELECT COUNT(*) INTO v_count
  FROM public.orden_compra_detalles d
  WHERE d.tenant_id IS NULL
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'orden_compra_detalles_tenant_null'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.recepcion_items ri
  WHERE ri.tenant_id IS NULL
    AND (p_tenant_id IS NULL OR ri.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'recepcion_items_tenant_null'::text, (v_count = 0), format('rows=%s', v_count);

  -- Gap y mismatch alias/canónico
  SELECT COUNT(*) INTO v_count
  FROM public.ordenes_compra oc
  LEFT JOIN public.compras c ON c.id = oc.id
  WHERE c.id IS NULL
    AND (p_tenant_id IS NULL OR oc.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'ordenes_compra_missing_in_compras'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.compras c
  LEFT JOIN public.ordenes_compra oc ON oc.id = c.id
  WHERE oc.id IS NULL
    AND (p_tenant_id IS NULL OR c.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'compras_missing_in_ordenes_compra'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.compras c
  JOIN public.ordenes_compra oc ON oc.id = c.id
  WHERE (
      COALESCE(c.tenant_id::text, '') <> COALESCE(oc.tenant_id::text, '')
      OR COALESCE(NULLIF(btrim(c.numero_documento), ''), '') <> COALESCE(NULLIF(btrim(oc.numero), ''), '')
      OR c.estado <> app.map_ordenes_compra_to_compras_estado(oc.estado)
    )
    AND (
      p_tenant_id IS NULL
      OR c.tenant_id = p_tenant_id
      OR oc.tenant_id = p_tenant_id
    );
  RETURN QUERY SELECT 'compras_ordenes_alias_mismatch_rows'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_compras_operational_runtime_status_actual AS
SELECT *
FROM public.validar_compras_operational_runtime(app.resolve_request_tenant_id());

COMMIT;
