-- ============================================================================
-- 142__fiscal_gre_sire_validation_pack.sql
-- Pack de validación runtime para GRE/SIRE.
-- Tablas: gre_guias, gre_detalles, sire_files, sire_registros_detalle.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_fiscal_gre_sire_runtime(
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
  -- Triggers de normalización
  RETURN QUERY
  SELECT
    'trigger_normalize_gre_guias_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'gre_guias'
        AND t.tgname = 'trg_normalize_gre_guias_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en gre_guias';

  RETURN QUERY
  SELECT
    'trigger_normalize_gre_detalles_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'gre_detalles'
        AND t.tgname = 'trg_normalize_gre_detalles_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en gre_detalles';

  RETURN QUERY
  SELECT
    'trigger_normalize_sire_files_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'sire_files'
        AND t.tgname = 'trg_normalize_sire_files_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en sire_files';

  RETURN QUERY
  SELECT
    'trigger_normalize_sire_registros_detalle_row'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'sire_registros_detalle'
        AND t.tgname = 'trg_normalize_sire_registros_detalle_row' AND NOT t.tgisinternal
    ),
    'trigger de normalización en sire_registros_detalle';

  -- Triggers de consistencia tenant
  RETURN QUERY
  SELECT
    'trigger_enforce_gre_guias_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'gre_guias'
        AND t.tgname = 'trg_enforce_gre_guias_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en gre_guias';

  RETURN QUERY
  SELECT
    'trigger_enforce_gre_detalles_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'gre_detalles'
        AND t.tgname = 'trg_enforce_gre_detalles_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en gre_detalles';

  RETURN QUERY
  SELECT
    'trigger_enforce_sire_files_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'sire_files'
        AND t.tgname = 'trg_enforce_sire_files_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en sire_files';

  RETURN QUERY
  SELECT
    'trigger_enforce_sire_registros_detalle_tenant_consistency'::text,
    EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'sire_registros_detalle'
        AND t.tgname = 'trg_enforce_sire_registros_detalle_tenant_consistency' AND NOT t.tgisinternal
    ),
    'trigger de consistencia tenant en sire_registros_detalle';

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'gre_guias_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'gre_guias'
        AND c.column_name IN (
          'tenant_id', 'numero', 'serie', 'correlativo', 'estado', 'sunat_status',
          'idempotency_key', 'cpe_relacionado', 'event_id', 'fecha_traslado',
          'peso_total', 'retry_count', 'next_retry_at', 'datos_adicionales',
          'created_at', 'updated_at'
        )
    ),
    'columnas runtime de gre_guias';

  RETURN QUERY
  SELECT
    'gre_detalles_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 9
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'gre_detalles'
        AND c.column_name IN (
          'tenant_id', 'gre_id', 'descripcion', 'cantidad', 'unidad_medida',
          'peso', 'producto_id', 'created_at', 'updated_at'
        )
    ),
    'columnas runtime de gre_detalles';

  RETURN QUERY
  SELECT
    'sire_files_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 16
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'sire_files'
        AND c.column_name IN (
          'tenant_id', 'periodo', 'period', 'tipo', 'estado', 'status',
          'filename', 'file_path', 'file_size', 'total_registros',
          'error_message', 'request_summary', 'response_summary',
          'created_at', 'updated_at', 'completed_at'
        )
    ),
    'columnas runtime de sire_files';

  RETURN QUERY
  SELECT
    'sire_registros_detalle_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 11
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'sire_registros_detalle'
        AND c.column_name IN (
          'tenant_id', 'reporte_id', 'cpe_id', 'tipo_documento', 'serie',
          'numero', 'total', 'fecha_registro', 'es_credito',
          'created_at', 'updated_at'
        )
    ),
    'columnas runtime de sire_registros_detalle';

  -- FKs esperadas
  RETURN QUERY
  SELECT 'fk_gre_detalles_gre_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gre_detalles_gre_id_fkey' AND conrelid = 'public.gre_detalles'::regclass),
    'FK gre_detalles -> gre_guias';

  RETURN QUERY
  SELECT 'fk_gre_guias_cpe_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gre_guias_cpe_relacionado_fkey' AND conrelid = 'public.gre_guias'::regclass),
    'FK gre_guias -> cpe';

  RETURN QUERY
  SELECT 'fk_sire_registros_detalle_reporte_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sire_registros_detalle_reporte_id_fkey' AND conrelid = 'public.sire_registros_detalle'::regclass),
    'FK sire_registros_detalle -> sire_files';

  RETURN QUERY
  SELECT 'fk_sire_registros_detalle_cpe_exists'::text,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sire_registros_detalle_cpe_id_fkey' AND conrelid = 'public.sire_registros_detalle'::regclass),
    'FK sire_registros_detalle -> cpe';

  -- Índices esperados
  RETURN QUERY
  SELECT 'ux_gre_guias_tenant_idempotency_key_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'gre_guias' AND indexname = 'ux_gre_guias_tenant_idempotency_key'),
    'unicidad por tenant + idempotency_key';

  RETURN QUERY
  SELECT 'ux_gre_guias_tenant_serie_correlativo_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'gre_guias' AND indexname = 'ux_gre_guias_tenant_serie_correlativo'),
    'unicidad por tenant + serie + correlativo';

  RETURN QUERY
  SELECT 'ux_sire_files_tenant_periodo_tipo_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'sire_files' AND indexname = 'ux_sire_files_tenant_periodo_tipo'),
    'unicidad por tenant + periodo + tipo';

  RETURN QUERY
  SELECT 'ux_sire_registros_detalle_tenant_cpe_exists'::text,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'sire_registros_detalle' AND indexname = 'ux_sire_registros_detalle_tenant_cpe'),
    'unicidad por tenant + cpe_id';

  -- RLS habilitado y forzado
  RETURN QUERY
  SELECT 'rls_gre_guias_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'gre_guias' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en gre_guias';

  RETURN QUERY
  SELECT 'rls_gre_detalles_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'gre_detalles' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en gre_detalles';

  RETURN QUERY
  SELECT 'rls_sire_files_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'sire_files' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en sire_files';

  RETURN QUERY
  SELECT 'rls_sire_registros_detalle_enabled'::text,
    EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'sire_registros_detalle' AND c.relrowsecurity = true AND c.relforcerowsecurity = true
    ),
    'RLS habilitado/forzado en sire_registros_detalle';

  -- Duplicados por scope
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, btrim(idempotency_key) AS idempotency_key_norm, COUNT(*) AS cnt
    FROM public.gre_guias
    WHERE tenant_id IS NOT NULL
      AND idempotency_key IS NOT NULL
      AND btrim(idempotency_key) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, btrim(idempotency_key)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'gre_guias_duplicate_idempotency_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(serie) AS serie_norm, correlativo, COUNT(*) AS cnt
    FROM public.gre_guias
    WHERE tenant_id IS NOT NULL
      AND serie IS NOT NULL
      AND btrim(serie) <> ''
      AND correlativo IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(serie), correlativo
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'gre_guias_duplicate_serie_correlativo_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, upper(periodo) AS periodo_norm, upper(tipo) AS tipo_norm, COUNT(*) AS cnt
    FROM public.sire_files
    WHERE tenant_id IS NOT NULL
      AND periodo IS NOT NULL
      AND btrim(periodo) <> ''
      AND tipo IS NOT NULL
      AND btrim(tipo) <> ''
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, upper(periodo), upper(tipo)
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'sire_files_duplicate_periodo_tipo_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT tenant_id, cpe_id, COUNT(*) AS cnt
    FROM public.sire_registros_detalle
    WHERE tenant_id IS NOT NULL
      AND cpe_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, cpe_id
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'sire_registros_detalle_duplicate_cpe_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas inválidas
  SELECT COUNT(*) INTO v_count
  FROM public.gre_guias g
  WHERE (
      g.tenant_id IS NULL
      OR g.numero IS NULL OR btrim(g.numero) = ''
      OR g.estado NOT IN ('BORRADOR', 'FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'ANULADO', 'ERROR')
      OR g.sunat_status NOT IN ('NOT_SENT', 'READY', 'SENDING', 'ACCEPTED', 'REJECTED', 'ERROR')
      OR g.base_imponible < 0 OR g.igv < 0 OR g.total < 0 OR g.peso_total < 0
      OR g.retry_count < 0
      OR (g.anio IS NOT NULL AND g.anio !~ '^[0-9]{4}$')
      OR (g.mes IS NOT NULL AND g.mes !~ '^(0[1-9]|1[0-2])$')
    )
    AND (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gre_guias_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.gre_detalles gd
  WHERE (
      gd.tenant_id IS NULL
      OR gd.gre_id IS NULL
      OR gd.descripcion IS NULL OR btrim(gd.descripcion) = ''
      OR gd.cantidad <= 0
      OR (gd.peso IS NOT NULL AND gd.peso < 0)
      OR gd.estado NOT IN ('ACTIVO', 'INACTIVO')
    )
    AND (p_tenant_id IS NULL OR gd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gre_detalles_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.sire_files sf
  WHERE (
      sf.tenant_id IS NULL
      OR sf.periodo IS NULL OR btrim(sf.periodo) = ''
      OR sf.period IS NULL OR btrim(sf.period) = ''
      OR sf.periodo <> sf.period
      OR sf.tipo IS NULL OR btrim(sf.tipo) = ''
      OR sf.estado NOT IN ('GENERANDO', 'GENERADO', 'ENVIADO', 'PENDIENTE', 'ERROR', 'ANULADO')
      OR sf.status NOT IN ('RUNNING', 'COMPLETED', 'SENT', 'PENDING', 'ERROR', 'CANCELLED')
      OR sf.file_size < 0
      OR sf.total_registros < 0
    )
    AND (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'sire_files_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.sire_registros_detalle srd
  WHERE (
      srd.tenant_id IS NULL
      OR srd.reporte_id IS NULL
      OR srd.tipo_documento IS NULL OR btrim(srd.tipo_documento) = ''
      OR srd.serie IS NULL OR btrim(srd.serie) = ''
      OR srd.numero IS NULL OR btrim(srd.numero) = ''
      OR srd.total < 0
      OR srd.fecha_registro IS NULL
      OR srd.estado NOT IN ('REGISTRADO', 'ANULADO')
    )
    AND (p_tenant_id IS NULL OR srd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'sire_registros_detalle_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Consistencia tenant por relaciones
  SELECT COUNT(*) INTO v_count
  FROM public.gre_detalles gd
  JOIN public.gre_guias g ON g.id = gd.gre_id
  WHERE gd.tenant_id IS NOT NULL
    AND g.tenant_id IS NOT NULL
    AND gd.tenant_id <> g.tenant_id
    AND (p_tenant_id IS NULL OR gd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gre_detalles_vs_gre_guias_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.gre_guias g
  JOIN public.cpe c ON c.id = g.cpe_relacionado
  WHERE g.tenant_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND g.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR g.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'gre_guias_vs_cpe_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.sire_registros_detalle srd
  JOIN public.sire_files sf ON sf.id = srd.reporte_id
  WHERE srd.tenant_id IS NOT NULL
    AND sf.tenant_id IS NOT NULL
    AND srd.tenant_id <> sf.tenant_id
    AND (p_tenant_id IS NULL OR srd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'sire_registros_detalle_vs_sire_files_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*) INTO v_count
  FROM public.sire_registros_detalle srd
  JOIN public.cpe c ON c.id = srd.cpe_id
  WHERE srd.tenant_id IS NOT NULL
    AND c.tenant_id IS NOT NULL
    AND srd.tenant_id <> c.tenant_id
    AND (p_tenant_id IS NULL OR srd.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'sire_registros_detalle_vs_cpe_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  -- Consistencia alias status/estado y period/periodo
  SELECT COUNT(*) INTO v_count
  FROM public.sire_files sf
  WHERE (
      sf.periodo IS DISTINCT FROM sf.period
      OR (sf.estado = 'GENERANDO' AND sf.status <> 'RUNNING')
      OR (sf.estado = 'GENERADO' AND sf.status <> 'COMPLETED')
      OR (sf.estado = 'ENVIADO' AND sf.status <> 'SENT')
      OR (sf.estado = 'PENDIENTE' AND sf.status <> 'PENDING')
      OR (sf.estado = 'ERROR' AND sf.status <> 'ERROR')
      OR (sf.estado = 'ANULADO' AND sf.status <> 'CANCELLED')
    )
    AND (p_tenant_id IS NULL OR sf.tenant_id = p_tenant_id);
  RETURN QUERY SELECT 'sire_files_alias_sync_gap'::text, (v_count = 0), format('rows=%s', v_count);
END;
$$;

CREATE OR REPLACE VIEW public.v_fiscal_gre_sire_runtime_status_actual AS
SELECT *
FROM public.validar_fiscal_gre_sire_runtime(
  COALESCE(app.resolve_request_tenant_id(), app.current_tenant_id())
);

COMMIT;
