-- ============================================================================
-- 154__documentos_operational_validation_pack.sql
-- Pack de validación runtime para documentos operativos.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_documentos_operational_runtime(
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
    'trigger_normalize_documentos_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documentos'
        AND t.tgname = 'trg_normalize_documentos_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en documentos';

  RETURN QUERY
  SELECT
    'trigger_enforce_documentos_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documentos'
        AND t.tgname = 'trg_enforce_documentos_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en documentos';

  RETURN QUERY
  SELECT
    'trigger_normalize_documento_detalles_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_detalles'
        AND t.tgname = 'trg_normalize_documento_detalles_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en documento_detalles';

  RETURN QUERY
  SELECT
    'trigger_enforce_documento_detalles_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_detalles'
        AND t.tgname = 'trg_enforce_documento_detalles_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en documento_detalles';

  RETURN QUERY
  SELECT
    'trigger_normalize_documento_auditoria_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_auditoria'
        AND t.tgname = 'trg_normalize_documento_auditoria_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en documento_auditoria';

  RETURN QUERY
  SELECT
    'trigger_enforce_documento_auditoria_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_auditoria'
        AND t.tgname = 'trg_enforce_documento_auditoria_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en documento_auditoria';

  RETURN QUERY
  SELECT
    'trigger_normalize_documento_archivos_row'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_archivos'
        AND t.tgname = 'trg_normalize_documento_archivos_row'
        AND NOT t.tgisinternal
    ),
    'normalizacion en documento_archivos';

  RETURN QUERY
  SELECT
    'trigger_enforce_documento_archivos_tenant_consistency'::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_archivos'
        AND t.tgname = 'trg_enforce_documento_archivos_tenant_consistency'
        AND NOT t.tgisinternal
    ),
    'consistencia tenant en documento_archivos';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'documentos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 24
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'documentos'
        AND c.column_name IN (
          'tenant_id', 'tipo_documento', 'serie', 'numero', 'pedido_id', 'cliente_id',
          'cotizacion_origen_id', 'fecha_emision', 'fecha_vencimiento', 'estado',
          'estado_sunat', 'moneda', 'tipo_cambio', 'subtotal', 'descuentos',
          'impuesto_igv', 'impuesto_isc', 'otros_impuestos', 'total', 'receptor_numero_doc',
          'receptor_razon_social', 'xml_content', 'cdr_content', 'codigo_hash'
        )
    ),
    'shape runtime de documentos';

  RETURN QUERY
  SELECT
    'documento_detalles_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'documento_detalles'
        AND c.column_name IN (
          'tenant_id', 'documento_id', 'orden', 'producto_id', 'codigo_producto',
          'descripcion', 'unidad_medida', 'cantidad', 'precio_unitario',
          'descuento_unitario', 'valor_venta', 'impuesto_igv', 'impuesto_isc', 'total_item'
        )
    ),
    'shape runtime de documento_detalles';

  RETURN QUERY
  SELECT
    'documento_auditoria_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 6
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'documento_auditoria'
        AND c.column_name IN (
          'tenant_id', 'documento_id', 'accion', 'usuario_id', 'detalles_cambio', 'timestamp'
        )
    ),
    'shape runtime de documento_auditoria';

  RETURN QUERY
  SELECT
    'documento_archivos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'documento_archivos'
        AND c.column_name IN (
          'tenant_id', 'documento_id', 'tipo_archivo', 'nombre_archivo',
          'mime_type', 'size_bytes', 'uploaded_by', 'uploaded_at', 'storage_path'
        )
    ),
    'shape runtime de documento_archivos';

  -- FKs operativas esperadas
  RETURN QUERY
  SELECT 'fk_documentos_pedido_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'documentos_pedido_id_fkey_runtime'
        AND conrelid = 'public.documentos'::regclass
    ),
    'FK documentos -> pedidos_venta';

  RETURN QUERY
  SELECT 'fk_documentos_cliente_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'documentos_cliente_id_fkey_runtime'
        AND conrelid = 'public.documentos'::regclass
    ),
    'FK documentos -> clientes';

  RETURN QUERY
  SELECT 'fk_documento_detalles_documento_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'documento_detalles_documento_id_fkey_runtime'
        AND conrelid = 'public.documento_detalles'::regclass
    ),
    'FK documento_detalles -> documentos';

  RETURN QUERY
  SELECT 'fk_documento_auditoria_documento_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'documento_auditoria_documento_id_fkey_runtime'
        AND conrelid = 'public.documento_auditoria'::regclass
    ),
    'FK documento_auditoria -> documentos';

  RETURN QUERY
  SELECT 'fk_documento_archivos_documento_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'documento_archivos_documento_id_fkey_runtime'
        AND conrelid = 'public.documento_archivos'::regclass
    ),
    'FK documento_archivos -> documentos';

  -- Índices de soporte esperados
  RETURN QUERY
  SELECT 'ux_documentos_tenant_tipo_serie_numero_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'documentos'
        AND indexname = 'ux_documentos_tenant_tipo_serie_numero_runtime'
    ),
    'unicidad de numeracion fiscal por tenant/tipo/serie/numero';

  RETURN QUERY
  SELECT 'ux_documento_detalles_documento_orden_runtime_exists'::text,
    EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'documento_detalles'
        AND indexname = 'ux_documento_detalles_documento_orden_runtime'
    ),
    'unicidad de orden por documento en detalles';

  -- RLS
  RETURN QUERY
  SELECT 'rls_documentos_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documentos'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en documentos';

  RETURN QUERY
  SELECT 'rls_documento_detalles_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_detalles'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en documento_detalles';

  RETURN QUERY
  SELECT 'rls_documento_auditoria_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_auditoria'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en documento_auditoria';

  RETURN QUERY
  SELECT 'rls_documento_archivos_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'documento_archivos'
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en documento_archivos';

  -- Duplicados por scope
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(btrim(tipo_documento)) AS tipo_norm, upper(btrim(serie)) AS serie_norm, upper(btrim(numero)) AS numero_norm, COUNT(*) AS cnt
    FROM public.documentos
    WHERE tenant_id IS NOT NULL
      AND tipo_documento IS NOT NULL AND btrim(tipo_documento) <> ''
      AND serie IS NOT NULL AND btrim(serie) <> ''
      AND numero IS NOT NULL AND btrim(numero) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(btrim(tipo_documento)), upper(btrim(serie)), upper(btrim(numero))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'documentos_duplicate_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT documento_id, orden, COUNT(*) AS cnt
    FROM public.documento_detalles
    WHERE documento_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY documento_id, orden
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY
  SELECT 'documento_detalles_duplicate_orden_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas invalidas por reglas core
  SELECT COUNT(*) INTO v_count
  FROM public.documentos d
  WHERE (
      d.tenant_id IS NULL
      OR d.tipo_documento IS NULL OR btrim(d.tipo_documento) = ''
      OR d.serie IS NULL OR btrim(d.serie) = ''
      OR d.numero IS NULL OR btrim(d.numero) = ''
      OR d.fecha_emision IS NULL
      OR (d.fecha_vencimiento IS NOT NULL AND d.fecha_vencimiento < d.fecha_emision)
      OR d.estado NOT IN ('BORRADOR', 'EMITIDO', 'ENVIADO_SUNAT', 'OBSERVADO', 'RECHAZADO', 'ANULADO')
      OR d.moneda IS NULL OR d.moneda !~ '^[A-Z]{3}$'
      OR d.tipo_cambio <= 0
      OR d.subtotal < 0 OR d.descuentos < 0 OR d.impuesto_igv < 0
      OR d.impuesto_isc < 0 OR d.otros_impuestos < 0 OR d.total < 0
    )
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documentos_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documento_detalles dd
  WHERE (
      dd.tenant_id IS NULL
      OR dd.documento_id IS NULL
      OR dd.orden < 1
      OR dd.descripcion IS NULL OR btrim(dd.descripcion) = ''
      OR dd.cantidad <= 0
      OR dd.precio_unitario < 0
      OR dd.descuento_unitario < 0
      OR dd.valor_venta < 0
      OR dd.impuesto_igv < 0
      OR dd.impuesto_isc < 0
      OR dd.total_item < 0
    )
    AND (p_tenant_id IS NULL OR dd.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_detalles_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documento_auditoria da
  WHERE (
      da.tenant_id IS NULL
      OR da.documento_id IS NULL
      OR da.accion IS NULL OR btrim(da.accion) = ''
      OR da."timestamp" IS NULL
    )
    AND (p_tenant_id IS NULL OR da.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_auditoria_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documento_archivos df
  WHERE (
      df.tenant_id IS NULL
      OR df.documento_id IS NULL
      OR df.tipo_archivo NOT IN ('PDF', 'XML', 'CDR', 'JSON', 'ZIP', 'OTRO')
      OR df.estado NOT IN ('ACTIVO', 'ARCHIVADO', 'ELIMINADO')
      OR df.size_bytes < 0
    )
    AND (p_tenant_id IS NULL OR df.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_archivos_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Mismatch tenant por relaciones
  SELECT COUNT(*) INTO v_count
  FROM public.documento_detalles dd
  JOIN public.documentos d ON d.id = dd.documento_id
  WHERE dd.tenant_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND dd.tenant_id <> d.tenant_id
    AND (p_tenant_id IS NULL OR dd.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_detalles_vs_documentos_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documento_auditoria da
  JOIN public.documentos d ON d.id = da.documento_id
  WHERE da.tenant_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND da.tenant_id <> d.tenant_id
    AND (p_tenant_id IS NULL OR da.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_auditoria_vs_documentos_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documento_archivos df
  JOIN public.documentos d ON d.id = df.documento_id
  WHERE df.tenant_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND df.tenant_id <> d.tenant_id
    AND (p_tenant_id IS NULL OR df.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_archivos_vs_documentos_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documentos d
  JOIN public.clientes c ON c.id = d.cliente_id
  WHERE d.cliente_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND d.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documentos_vs_clientes_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documentos d
  JOIN public.pedidos_venta p ON p.id = d.pedido_id
  WHERE d.pedido_id IS NOT NULL
    AND d.tenant_id IS NOT NULL
    AND p.tenant_id IS NOT NULL
    AND d.tenant_id <> p.tenant_id
    AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documentos_vs_pedidos_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  -- Huérfanos de relaciones clave
  SELECT COUNT(*) INTO v_count
  FROM public.documento_detalles dd
  LEFT JOIN public.documentos d ON d.id = dd.documento_id
  WHERE dd.documento_id IS NOT NULL
    AND d.id IS NULL
    AND (p_tenant_id IS NULL OR dd.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_detalles_orphan_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documento_auditoria da
  LEFT JOIN public.documentos d ON d.id = da.documento_id
  WHERE da.documento_id IS NOT NULL
    AND d.id IS NULL
    AND (p_tenant_id IS NULL OR da.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_auditoria_orphan_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.documento_archivos df
  LEFT JOIN public.documentos d ON d.id = df.documento_id
  WHERE df.documento_id IS NOT NULL
    AND d.id IS NULL
    AND (p_tenant_id IS NULL OR df.tenant_id = p_tenant_id);
  RETURN QUERY
  SELECT 'documento_archivos_orphan_rows'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_documentos_operational_runtime_status_actual AS
SELECT *
FROM public.validar_documentos_operational_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
