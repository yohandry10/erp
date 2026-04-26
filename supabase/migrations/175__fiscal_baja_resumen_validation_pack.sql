-- ============================================================================
-- 175__fiscal_baja_resumen_validation_pack.sql
-- Pack de validacion runtime para flujo SUNAT RA/RC.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_fiscal_baja_resumen_runtime(
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
  -- Triggers normalize
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('comunicaciones_baja', 'trg_normalize_comunicaciones_baja_row', 'normalizacion comunicaciones_baja'),
      ('detalle_comunicacion_baja', 'trg_normalize_detalle_comunicacion_baja_row', 'normalizacion detalle_comunicacion_baja'),
      ('resumenes_diarios', 'trg_normalize_resumenes_diarios_row', 'normalizacion resumenes_diarios'),
      ('detalle_resumen_diario', 'trg_normalize_detalle_resumen_diario_row', 'normalizacion detalle_resumen_diario'),
      ('validaciones_sunat', 'trg_normalize_validaciones_sunat_row', 'normalizacion validaciones_sunat')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Triggers enforce tenant
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('detalle_comunicacion_baja', 'trg_enforce_detalle_comunicacion_baja_tenant_consistency', 'consistencia tenant detalle_comunicacion_baja'),
      ('detalle_resumen_diario', 'trg_enforce_detalle_resumen_diario_tenant_consistency', 'consistencia tenant detalle_resumen_diario'),
      ('validaciones_sunat', 'trg_enforce_validaciones_sunat_tenant_consistency', 'consistencia tenant validaciones_sunat')
  )
  SELECT
    format('trigger_%s_exists', e.trigger_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND t.tgname = e.trigger_name
        AND NOT t.tgisinternal
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Columnas runtime
  RETURN QUERY
  SELECT
    'comunicaciones_baja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 13
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'comunicaciones_baja'
        AND c.column_name IN (
          'tenant_id', 'numero_comunicacion', 'fecha_generacion', 'fecha_comunicacion',
          'comprobantes_ids', 'cantidad_comprobantes', 'estado', 'ticket_sunat',
          'codigo_respuesta', 'descripcion_respuesta', 'hash_xml', 'motivo_baja', 'intentos_envio'
        )
    ),
    'columnas runtime de comunicaciones_baja';

  RETURN QUERY
  SELECT
    'detalle_comunicacion_baja_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 8
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'detalle_comunicacion_baja'
        AND c.column_name IN (
          'tenant_id', 'comunicacion_id', 'cpe_id', 'tipo_documento',
          'serie', 'numero', 'motivo_baja', 'orden'
        )
    ),
    'columnas runtime de detalle_comunicacion_baja';

  RETURN QUERY
  SELECT
    'resumenes_diarios_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 14
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'resumenes_diarios'
        AND c.column_name IN (
          'tenant_id', 'numero_resumen', 'fecha_generacion', 'fecha_referencia',
          'comprobantes_ids', 'cantidad_comprobantes', 'total_gravadas', 'total_exoneradas',
          'total_inafectas', 'total_igv', 'total_general', 'estado', 'ticket_sunat', 'intentos_envio'
        )
    ),
    'columnas runtime de resumenes_diarios';

  RETURN QUERY
  SELECT
    'detalle_resumen_diario_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 12
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'detalle_resumen_diario'
        AND c.column_name IN (
          'tenant_id', 'resumen_id', 'cpe_id', 'tipo_documento',
          'serie', 'numero', 'tipo_operacion', 'total_gravadas',
          'total_exoneradas', 'total_inafectas', 'total_igv', 'total'
        )
    ),
    'columnas runtime de detalle_resumen_diario';

  RETURN QUERY
  SELECT
    'validaciones_sunat_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 12
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'validaciones_sunat'
        AND c.column_name IN (
          'tenant_id', 'cpe_id', 'documento_id', 'tipo_validacion',
          'ruc_consultado', 'codigo_respuesta', 'descripcion_respuesta',
          'request_payload', 'response_payload', 'validado_en', 'fuente', 'severidad'
        )
    ),
    'columnas runtime de validaciones_sunat';

  -- FKs esperadas
  RETURN QUERY
  WITH expected(conname, relname, detail) AS (
    VALUES
      ('detalle_comunicacion_baja_comunicacion_id_fkey', 'detalle_comunicacion_baja', 'FK detalle_comunicacion_baja -> comunicaciones_baja'),
      ('detalle_comunicacion_baja_cpe_id_fkey', 'detalle_comunicacion_baja', 'FK detalle_comunicacion_baja -> cpe'),
      ('detalle_resumen_diario_resumen_id_fkey', 'detalle_resumen_diario', 'FK detalle_resumen_diario -> resumenes_diarios'),
      ('detalle_resumen_diario_cpe_id_fkey', 'detalle_resumen_diario', 'FK detalle_resumen_diario -> cpe'),
      ('validaciones_sunat_cpe_id_fkey', 'validaciones_sunat', 'FK validaciones_sunat -> cpe'),
      ('validaciones_sunat_documento_id_fkey', 'validaciones_sunat', 'FK validaciones_sunat -> documentos')
  )
  SELECT
    format('fk_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Indices esperados
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('comunicaciones_baja', 'idx_comunicaciones_baja_tenant_estado_fecha_runtime', 'indice runtime comunicaciones_baja'),
      ('resumenes_diarios', 'idx_resumenes_diarios_tenant_estado_fecha_runtime', 'indice runtime resumenes_diarios'),
      ('detalle_comunicacion_baja', 'idx_detalle_comunicacion_baja_tenant_comunicacion_runtime', 'indice runtime detalle_comunicacion_baja'),
      ('detalle_resumen_diario', 'idx_detalle_resumen_diario_tenant_resumen_runtime', 'indice runtime detalle_resumen_diario'),
      ('validaciones_sunat', 'idx_validaciones_sunat_tenant_tipo_validado_runtime', 'indice runtime validaciones_sunat'),
      ('detalle_comunicacion_baja', 'ux_detalle_comunicacion_baja_tenant_comunicacion_cpe', 'unicidad detalle_comunicacion_baja por scope'),
      ('detalle_resumen_diario', 'ux_detalle_resumen_diario_tenant_resumen_cpe', 'unicidad detalle_resumen_diario por scope')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- Constraints esperadas
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('comunicaciones_baja', 'ck_comunicaciones_baja_estado_runtime', 'constraint estado comunicaciones_baja'),
      ('comunicaciones_baja', 'ck_comunicaciones_baja_numero_runtime', 'constraint numero comunicaciones_baja'),
      ('resumenes_diarios', 'ck_resumenes_diarios_estado_runtime', 'constraint estado resumenes_diarios'),
      ('resumenes_diarios', 'ck_resumenes_diarios_numero_runtime', 'constraint numero resumenes_diarios'),
      ('detalle_comunicacion_baja', 'ck_detalle_comunicacion_baja_tipo_runtime', 'constraint tipo detalle_comunicacion_baja'),
      ('detalle_resumen_diario', 'ck_detalle_resumen_diario_tipo_runtime', 'constraint tipo detalle_resumen_diario'),
      ('validaciones_sunat', 'ck_validaciones_sunat_estado_runtime', 'constraint estado validaciones_sunat')
  )
  SELECT
    format('constraint_%s_exists', e.conname)::text,
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = e.relname
        AND c.conname = e.conname
    ) AS ok,
    e.detail::text
  FROM expected e;

  -- RLS enabled+forced
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('comunicaciones_baja'),
      ('detalle_comunicacion_baja'),
      ('resumenes_diarios'),
      ('detalle_resumen_diario'),
      ('validaciones_sunat')
  )
  SELECT
    format('rls_%s_enabled_forced', e.table_name)::text,
    EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = e.table_name
        AND c.relrowsecurity = true
        AND c.relforcerowsecurity = true
    ) AS ok,
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  -- Duplicados por scope
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, comunicacion_id, cpe_id, COUNT(*) AS cnt
    FROM public.detalle_comunicacion_baja
    WHERE tenant_id IS NOT NULL
      AND comunicacion_id IS NOT NULL
      AND cpe_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, comunicacion_id, cpe_id
    HAVING COUNT(*) > 1
  ) t;

  RETURN QUERY
  SELECT
    'detalle_comunicacion_baja_duplicates_by_scope'::text,
    v_count = 0,
    format('duplicados por tenant+comunicacion+cpe: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT tenant_id, resumen_id, cpe_id, COUNT(*) AS cnt
    FROM public.detalle_resumen_diario
    WHERE tenant_id IS NOT NULL
      AND resumen_id IS NOT NULL
      AND cpe_id IS NOT NULL
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY tenant_id, resumen_id, cpe_id
    HAVING COUNT(*) > 1
  ) t;

  RETURN QUERY
  SELECT
    'detalle_resumen_diario_duplicates_by_scope'::text,
    v_count = 0,
    format('duplicados por tenant+resumen+cpe: %s', v_count)::text;

  -- Huérfanos y mismatch tenant
  SELECT COUNT(*)
  INTO v_count
  FROM public.detalle_comunicacion_baja d
  LEFT JOIN public.comunicaciones_baja cb ON cb.id = d.comunicacion_id
  LEFT JOIN public.cpe c ON c.id = d.cpe_id
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.comunicacion_id IS NULL OR cb.id IS NULL
      OR d.cpe_id IS NULL OR c.id IS NULL
      OR d.tenant_id IS NULL
      OR (cb.tenant_id IS NOT NULL AND d.tenant_id <> cb.tenant_id)
      OR (c.tenant_id IS NOT NULL AND d.tenant_id <> c.tenant_id)
    );

  RETURN QUERY
  SELECT
    'detalle_comunicacion_baja_orphan_or_tenant_mismatch'::text,
    v_count = 0,
    format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.detalle_resumen_diario d
  LEFT JOIN public.resumenes_diarios r ON r.id = d.resumen_id
  LEFT JOIN public.cpe c ON c.id = d.cpe_id
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.resumen_id IS NULL OR r.id IS NULL
      OR d.cpe_id IS NULL OR c.id IS NULL
      OR d.tenant_id IS NULL
      OR (r.tenant_id IS NOT NULL AND d.tenant_id <> r.tenant_id)
      OR (c.tenant_id IS NOT NULL AND d.tenant_id <> c.tenant_id)
    );

  RETURN QUERY
  SELECT
    'detalle_resumen_diario_orphan_or_tenant_mismatch'::text,
    v_count = 0,
    format('filas invalidas: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.validaciones_sunat v
  LEFT JOIN public.cpe c ON c.id = v.cpe_id
  LEFT JOIN public.documentos d ON d.id = v.documento_id
  WHERE (p_tenant_id IS NULL OR v.tenant_id = p_tenant_id)
    AND (
      v.tenant_id IS NULL
      OR (v.cpe_id IS NOT NULL AND c.id IS NULL)
      OR (v.documento_id IS NOT NULL AND d.id IS NULL)
      OR (c.tenant_id IS NOT NULL AND v.tenant_id <> c.tenant_id)
      OR (d.tenant_id IS NOT NULL AND v.tenant_id <> d.tenant_id)
      OR v.estado NOT IN ('PENDIENTE', 'VALIDO', 'INVALIDO', 'ERROR', 'VENCIDO')
      OR v.tipo_validacion NOT IN ('CERTIFICADO', 'RUC', 'CPE', 'GRE', 'SIRE', 'OTRO')
    );

  RETURN QUERY
  SELECT
    'validaciones_sunat_orphan_or_tenant_mismatch'::text,
    v_count = 0,
    format('filas invalidas: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_fiscal_baja_resumen_runtime_status_actual AS
SELECT *
FROM public.validar_fiscal_baja_resumen_runtime(app.current_tenant_id());

COMMIT;
