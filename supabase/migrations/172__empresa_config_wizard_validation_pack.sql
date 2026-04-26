-- ============================================================================
-- 172__empresa_config_wizard_validation_pack.sql
-- Pack de validacion runtime para empresa_config y wizard_progress.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_empresa_config_wizard_runtime(
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
  -- Triggers normalize esperados
  RETURN QUERY
  WITH expected(table_name, trigger_name, detail) AS (
    VALUES
      ('empresa_config', 'trg_normalize_empresa_config_row', 'normalizacion en empresa_config'),
      ('wizard_progress', 'trg_normalize_wizard_progress_row', 'normalizacion en wizard_progress')
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

  -- Columnas runtime esperadas
  RETURN QUERY
  SELECT
    'empresa_config_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 20
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'empresa_config'
        AND c.column_name IN (
          'tenant_id', 'pais_id', 'pais', 'moneda_defecto', 'moneda',
          'ultima_validacion', 'fecha_validacion_certificado', 'errores_configuracion',
          'redondeo_decimales', 'incluir_igv_en_precio', 'envio_automatico_sunat',
          'generar_pdf_automatico', 'enviar_email_cliente', 'validar_ruc_sunat',
          'usar_codigos_barra', 'formato_numeros', 'sitio_web', 'representante_legal',
          'dni_representante', 'actividad_economica'
        )
    ),
    'columnas runtime de empresa_config';

  RETURN QUERY
  SELECT
    'wizard_progress_runtime_columns_present'::text,
    (
      SELECT COUNT(*) = 7
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'wizard_progress'
        AND c.column_name IN (
          'tenant_id', 'paso_actual', 'pasos_completados', 'configuracion_temporal',
          'completado', 'completado_at', 'updated_at'
        )
    ),
    'columnas runtime de wizard_progress';

  -- Constraints esperadas
  RETURN QUERY
  WITH expected(conname, relname, detail) AS (
    VALUES
      ('ck_empresa_config_estado_runtime', 'empresa_config', 'estado valido en empresa_config'),
      ('ck_empresa_config_country_currency_runtime', 'empresa_config', 'pais/moneda validos en empresa_config'),
      ('ck_empresa_config_financial_runtime', 'empresa_config', 'rangos financieros en empresa_config'),
      ('ck_empresa_config_dates_runtime', 'empresa_config', 'reglas de fechas en empresa_config'),
      ('ck_empresa_config_demo_runtime', 'empresa_config', 'reglas de demo en empresa_config'),
      ('ck_wizard_progress_step_runtime', 'wizard_progress', 'rango de paso_actual en wizard_progress'),
      ('ck_wizard_progress_steps_array_runtime', 'wizard_progress', 'array de pasos validos en wizard_progress'),
      ('ck_wizard_progress_temporal_runtime', 'wizard_progress', 'json de configuracion temporal en wizard_progress'),
      ('ck_wizard_progress_completed_runtime', 'wizard_progress', 'consistencia completado/completado_at en wizard_progress')
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

  -- Indices esperados
  RETURN QUERY
  WITH expected(tablename, indexname, detail) AS (
    VALUES
      ('empresa_config', 'idx_empresa_config_tenant_estado_plan_runtime', 'indice tenant/estado/plan empresa_config'),
      ('empresa_config', 'idx_empresa_config_pais_runtime', 'indice pais empresa_config'),
      ('empresa_config', 'idx_empresa_config_certificado_expira_runtime', 'indice certificado_expira_en empresa_config'),
      ('empresa_config', 'idx_empresa_config_ultima_validacion_runtime', 'indice ultima_validacion empresa_config'),
      ('empresa_config', 'idx_empresa_config_ruc_pais_runtime', 'indice ruc+pais empresa_config'),
      ('empresa_config', 'idx_empresa_config_email_runtime', 'indice email empresa_config'),
      ('wizard_progress', 'idx_wizard_progress_tenant_completado_updated_runtime', 'indice tenant/completado wizard_progress'),
      ('wizard_progress', 'idx_wizard_progress_paso_actual_updated_runtime', 'indice paso_actual wizard_progress')
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

  -- Politicas RLS esperadas
  RETURN QUERY
  SELECT
    'empresa_config_rls_tenant_isolation_present'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'empresa_config'
        AND p.policyname = 'tenant_isolation'
    ),
    'policy tenant_isolation en empresa_config';

  RETURN QUERY
  SELECT
    'wizard_progress_rls_tenant_isolation_present'::text,
    EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'wizard_progress'
        AND p.policyname = 'tenant_isolation'
    ),
    'policy tenant_isolation en wizard_progress';

  -- Filas invalidas en empresa_config
  SELECT COUNT(*)
  INTO v_count
  FROM public.empresa_config ec
  WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
    AND (
      ec.pais_id IS NULL
      OR ec.pais !~ '^[A-Z]{2}$'
      OR ec.moneda_defecto !~ '^[A-Z]{3}$'
      OR ec.estado NOT IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA')
      OR ec.redondeo_decimales < 0
      OR ec.redondeo_decimales > 6
      OR ec.igv_porcentaje < 0
      OR ec.igv_porcentaje > 100
      OR ec.retencion_tasa < 0
      OR ec.retencion_tasa > 100
      OR ec.percepcion_tasa < 0
      OR ec.percepcion_tasa > 100
      OR ec.detraccion_tasa < 0
      OR ec.detraccion_tasa > 100
      OR ec.retencion_renta_porcentaje < 0
      OR ec.retencion_renta_porcentaje > 100
      OR ec.umbral_gre_automatico < 0
      OR ec.dias_maximos_rma < 0
      OR ec.dias_vencimiento_factura < 0
      OR (ec.fecha_inicio IS NOT NULL AND ec.fecha_fin IS NOT NULL AND ec.fecha_fin < ec.fecha_inicio)
      OR (ec.dian_resolucion_desde IS NOT NULL AND ec.dian_resolucion_hasta IS NOT NULL AND ec.dian_resolucion_hasta < ec.dian_resolucion_desde)
      OR (ec.dian_resolucion_fecha_inicio IS NOT NULL AND ec.dian_resolucion_fecha_fin IS NOT NULL AND ec.dian_resolucion_fecha_fin < ec.dian_resolucion_fecha_inicio)
      OR (ec.is_demo = false AND (COALESCE(ec.demo_extended, false) = true OR ec.demo_expires_at IS NOT NULL))
    );
  RETURN QUERY SELECT 'empresa_config_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  -- Consistencia pais/currency contra catalogo
  SELECT COUNT(*)
  INTO v_count
  FROM public.empresa_config ec
  JOIN public.paises p ON p.id = ec.pais_id
  WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
    AND (
      upper(ec.pais) <> upper(p.codigo_iso)
      OR upper(ec.moneda_defecto) <> upper(p.moneda_codigo)
    );
  RETURN QUERY SELECT 'empresa_config_pais_moneda_mismatch'::text, v_count = 0, format('mismatches: %s', v_count)::text;

  -- Duplicados operativos en empresa_config
  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT lower(btrim(ec.email)) AS email_norm
    FROM public.empresa_config ec
    WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
      AND ec.email IS NOT NULL
      AND btrim(ec.email) <> ''
    GROUP BY lower(btrim(ec.email))
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'empresa_config_duplicate_email_scope'::text, v_count = 0, format('grupos duplicados: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM (
    SELECT upper(btrim(ec.ruc)) AS ruc_norm, ec.pais
    FROM public.empresa_config ec
    WHERE (p_tenant_id IS NULL OR ec.tenant_id = p_tenant_id)
      AND ec.ruc IS NOT NULL
      AND btrim(ec.ruc) <> ''
      AND ec.pais IS NOT NULL
    GROUP BY upper(btrim(ec.ruc)), ec.pais
    HAVING COUNT(*) > 1
  ) d;
  RETURN QUERY SELECT 'empresa_config_duplicate_ruc_pais_scope'::text, v_count = 0, format('grupos duplicados: %s', v_count)::text;

  -- Filas invalidas en wizard_progress
  SELECT COUNT(*)
  INTO v_count
  FROM public.wizard_progress wp
  WHERE (p_tenant_id IS NULL OR wp.tenant_id = p_tenant_id)
    AND (
      wp.paso_actual < 1
      OR wp.paso_actual > 7
      OR NOT (wp.pasos_completados <@ ARRAY[1,2,3,4,5,6,7]::integer[])
      OR jsonb_typeof(wp.configuracion_temporal) <> 'object'
      OR (wp.completado = false AND wp.completado_at IS NOT NULL)
      OR (wp.completado = true AND wp.completado_at IS NULL)
    );
  RETURN QUERY SELECT 'wizard_progress_invalid_rows'::text, v_count = 0, format('filas invalidas: %s', v_count)::text;

  -- Huerfanos y mismatch de wizard
  SELECT COUNT(*)
  INTO v_count
  FROM public.wizard_progress wp
  LEFT JOIN public.tenants t ON t.id = wp.tenant_id
  WHERE (p_tenant_id IS NULL OR wp.tenant_id = p_tenant_id)
    AND t.id IS NULL;
  RETURN QUERY SELECT 'wizard_progress_orphans_tenant'::text, v_count = 0, format('huerfanos: %s', v_count)::text;

  SELECT COUNT(*)
  INTO v_count
  FROM public.wizard_progress wp
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = wp.tenant_id
  WHERE (p_tenant_id IS NULL OR wp.tenant_id = p_tenant_id)
    AND ec.tenant_id IS NULL;
  RETURN QUERY SELECT 'wizard_progress_without_empresa_config'::text, v_count = 0, format('filas sin empresa_config: %s', v_count)::text;

  RETURN;
END;
$$;

CREATE OR REPLACE VIEW public.v_empresa_config_wizard_runtime_status_actual AS
SELECT *
FROM public.validar_empresa_config_wizard_runtime(app.current_tenant_id());

COMMIT;
