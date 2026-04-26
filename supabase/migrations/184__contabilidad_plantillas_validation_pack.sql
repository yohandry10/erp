-- ============================================================================
-- 184__contabilidad_plantillas_validation_pack.sql
-- Pack de validacion runtime para plantillas contables.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_contabilidad_plantillas_runtime(
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
  -- Triggers normalize.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('plantillas_asientos', 'trg_normalize_plantillas_asientos_row', 'normalizacion plantillas_asientos'),
      ('plantillas_asientos_detalle', 'trg_normalize_plantillas_asientos_detalle_row', 'normalizacion plantillas_asientos_detalle'),
      ('plantillas_asientos_historial', 'trg_normalize_plantillas_asientos_historial_row', 'normalizacion plantillas_asientos_historial'),
      ('plantillas_asientos_ventas', 'trg_normalize_plantillas_asientos_ventas_row', 'normalizacion plantillas_asientos_ventas')
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
    ),
    e.detail::text
  FROM expected e;

  -- Triggers enforce.
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('plantillas_asientos_detalle', 'trg_enforce_plantillas_asientos_detalle_tenant_consistency', 'consistencia tenant detalle'),
      ('plantillas_asientos_historial', 'trg_enforce_plantillas_asientos_historial_tenant_consistency', 'consistencia tenant historial'),
      ('plantillas_asientos_ventas', 'trg_enforce_plantillas_asientos_ventas_scope', 'scope global de plantillas ventas activas')
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
    ),
    e.detail::text
  FROM expected e;

  -- Shape de columnas runtime.
  RETURN QUERY
  SELECT
    'plantillas_asientos_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plantillas_asientos'
        AND column_name IN ('tenant_id', 'nombre', 'codigo', 'descripcion', 'tipo_origen', 'modulo', 'requiere_centro_costo', 'aplica_por_defecto', 'estado', 'activo')
    ),
    'shape runtime plantillas_asientos'::text;

  RETURN QUERY
  SELECT
    'plantillas_asientos_detalle_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 12
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plantillas_asientos_detalle'
        AND column_name IN ('tenant_id', 'plantilla_id', 'orden', 'lado', 'cuenta_codigo', 'tipo_valor', 'valor_base', 'porcentaje', 'formula', 'descripcion', 'estado', 'activo')
    ),
    'shape runtime plantillas_asientos_detalle'::text;

  RETURN QUERY
  SELECT
    'plantillas_asientos_historial_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 10
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plantillas_asientos_historial'
        AND column_name IN ('tenant_id', 'plantilla_id', 'asiento_id', 'periodo', 'fecha_generacion', 'referencia', 'mensaje_error', 'payload', 'usuario_id', 'estado')
    ),
    'shape runtime plantillas_asientos_historial'::text;

  RETURN QUERY
  SELECT
    'plantillas_asientos_ventas_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 12
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'plantillas_asientos_ventas'
        AND column_name IN ('tenant_id', 'pais_id', 'tipo_documento', 'cuenta_debe_codigo', 'cuenta_haber_ventas_codigo', 'cuenta_haber_impuesto_codigo', 'cuenta_debe_retencion_codigo', 'cuenta_haber_percepcion_codigo', 'prioridad', 'moneda', 'estado', 'activo')
    ),
    'shape runtime plantillas_asientos_ventas'::text;

  -- FKs.
  RETURN QUERY
  WITH expected(relname, conname, detail) AS (
    VALUES
      ('plantillas_asientos_detalle', 'plantillas_asientos_detalle_plantilla_id_fkey_runtime', 'FK detalle -> plantilla'),
      ('plantillas_asientos_historial', 'plantillas_asientos_historial_plantilla_id_fkey_runtime', 'FK historial -> plantilla'),
      ('plantillas_asientos_historial', 'plantillas_asientos_historial_asiento_id_fkey_runtime', 'FK historial -> asiento'),
      ('plantillas_asientos_historial', 'plantillas_asientos_historial_usuario_id_fkey_runtime', 'FK historial -> usuario'),
      ('plantillas_asientos_ventas', 'plantillas_asientos_ventas_pais_id_fkey_runtime', 'FK ventas -> paises')
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
    ),
    e.detail::text
  FROM expected e;

  -- Indices/uniqueness.
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('plantillas_asientos', 'idx_plantillas_asientos_tenant_estado_modulo_runtime', 'indice runtime plantillas_asientos'),
      ('plantillas_asientos_detalle', 'idx_plantillas_asientos_detalle_plantilla_orden_runtime', 'indice runtime detalle'),
      ('plantillas_asientos_historial', 'idx_plantillas_asientos_historial_tenant_fecha_runtime', 'indice runtime historial'),
      ('plantillas_asientos_ventas', 'idx_plantillas_asientos_ventas_runtime_lookup', 'indice runtime ventas'),
      ('plantillas_asientos', 'ux_plantillas_asientos_tenant_codigo_activo_runtime', 'unicidad plantillas_asientos'),
      ('plantillas_asientos_detalle', 'ux_plantillas_asientos_detalle_plantilla_orden_activo_runtime', 'unicidad detalle'),
      ('plantillas_asientos_ventas', 'ux_plantillas_asientos_ventas_active_pais_tipo_runtime', 'unicidad ventas por pais+tipo')
  )
  SELECT
    format('index_%s_exists', e.indexname)::text,
    EXISTS (
      SELECT 1
      FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = e.tablename
        AND i.indexname = e.indexname
    ),
    e.detail::text
  FROM expected e;

  -- RLS enabled + forced.
  RETURN QUERY
  WITH expected(table_name) AS (
    VALUES
      ('plantillas_asientos'),
      ('plantillas_asientos_detalle'),
      ('plantillas_asientos_historial'),
      ('plantillas_asientos_ventas')
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
    ),
    format('RLS enabled+forced en %s', e.table_name)::text
  FROM expected e;

  -- Duplicados por scope.
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(btrim(codigo)), COUNT(*)
    FROM public.plantillas_asientos
    WHERE codigo IS NOT NULL
      AND btrim(codigo) <> ''
      AND COALESCE(activo, true) = true
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(btrim(codigo))
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'plantillas_asientos_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT plantilla_id, orden, COUNT(*)
    FROM public.plantillas_asientos_detalle
    WHERE plantilla_id IS NOT NULL
      AND COALESCE(activo, true) = true
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY plantilla_id, orden
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'plantillas_asientos_detalle_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT pais_id, upper(btrim(tipo_documento)), COUNT(*)
    FROM public.plantillas_asientos_ventas
    WHERE pais_id IS NOT NULL
      AND tipo_documento IS NOT NULL
      AND btrim(tipo_documento) <> ''
      AND COALESCE(activo, true) = true
    GROUP BY pais_id, upper(btrim(tipo_documento))
    HAVING COUNT(*) > 1
  ) t;
  RETURN QUERY
  SELECT 'plantillas_asientos_ventas_duplicates_by_scope'::text, (v_count = 0), format('groups=%s', v_count);

  -- Filas invalidas.
  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_detalle d
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND (
      d.tenant_id IS NULL
      OR d.plantilla_id IS NULL
      OR d.orden < 1
      OR d.lado NOT IN ('DEBE', 'HABER')
      OR d.tipo_valor NOT IN ('FIJO', 'PORCENTAJE', 'FORMULA')
      OR d.valor_base < 0
      OR d.porcentaje < 0
      OR d.porcentaje > 1
      OR d.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADA')
      OR (COALESCE(d.activo, true) = true AND (d.cuenta_codigo IS NULL OR btrim(d.cuenta_codigo) = ''))
    );
  RETURN QUERY
  SELECT 'plantillas_asientos_detalle_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_historial h
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND (
      h.tenant_id IS NULL
      OR h.fecha_generacion IS NULL
      OR h.periodo IS NULL
      OR h.periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      OR h.estado NOT IN ('GENERADO', 'ERROR', 'PENDIENTE', 'ANULADO')
    );
  RETURN QUERY
  SELECT 'plantillas_asientos_historial_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_ventas pv
  WHERE
    pv.pais_id IS NULL
    OR pv.tipo_documento IS NULL
    OR btrim(pv.tipo_documento) = ''
    OR pv.prioridad < 1
    OR pv.moneda !~ '^[A-Z]{3}$'
    OR pv.estado NOT IN ('ACTIVO', 'INACTIVO', 'ARCHIVADA')
    OR (
      COALESCE(pv.activo, true) = true
      AND (
        pv.tenant_id IS NOT NULL
        OR pv.cuenta_debe_codigo IS NULL
        OR btrim(pv.cuenta_debe_codigo) = ''
        OR pv.cuenta_haber_ventas_codigo IS NULL
        OR btrim(pv.cuenta_haber_ventas_codigo) = ''
        OR pv.cuenta_haber_impuesto_codigo IS NULL
        OR btrim(pv.cuenta_haber_impuesto_codigo) = ''
      )
    );
  RETURN QUERY
  SELECT 'plantillas_asientos_ventas_invalid_rows'::text, (v_count = 0), format('rows=%s', v_count);

  -- Mismatches tenant por relaciones.
  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_detalle d
  JOIN public.plantillas_asientos p ON p.id = d.plantilla_id
  WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    AND d.tenant_id IS DISTINCT FROM p.tenant_id;
  RETURN QUERY
  SELECT 'plantillas_asientos_detalle_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  SELECT COUNT(*)
  INTO v_count
  FROM public.plantillas_asientos_historial h
  LEFT JOIN public.plantillas_asientos p ON p.id = h.plantilla_id
  LEFT JOIN public.asientos_contables a ON a.id = h.asiento_id
  WHERE (p_tenant_id IS NULL OR h.tenant_id = p_tenant_id)
    AND (
      (p.id IS NOT NULL AND h.tenant_id IS DISTINCT FROM p.tenant_id)
      OR (a.id IS NOT NULL AND h.tenant_id IS DISTINCT FROM a.tenant_id)
    );
  RETURN QUERY
  SELECT 'plantillas_asientos_historial_tenant_mismatch'::text, (v_count = 0), format('rows=%s', v_count);

  -- Disponibilidad de plantilla base PE para flujo CPE.
  RETURN QUERY
  SELECT
    'plantillas_asientos_ventas_seed_pe_01_exists'::text,
    EXISTS (
      SELECT 1
      FROM public.plantillas_asientos_ventas pv
      JOIN public.paises p ON p.id = pv.pais_id
      WHERE upper(p.codigo_iso) IN ('PE', 'PER')
        AND upper(btrim(pv.tipo_documento)) = '01'
        AND COALESCE(pv.activo, true) = true
    ),
    'seed base PE tipo_documento 01 activo';
END;
$$;

CREATE OR REPLACE VIEW public.v_contabilidad_plantillas_runtime_status_actual AS
SELECT *
FROM public.validar_contabilidad_plantillas_runtime(NULL);

COMMIT;
