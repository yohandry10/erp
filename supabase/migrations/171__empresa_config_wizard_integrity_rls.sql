-- ============================================================================
-- 171__empresa_config_wizard_integrity_rls.sql
-- Integridad, constraints y hardening RLS para empresa_config y wizard_progress.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Backfill defensivo para cumplir integridad.
-- ----------------------------------------------------------------------------
UPDATE public.empresa_config ec
SET pais_id = p.id
FROM public.paises p
WHERE ec.pais_id IS NULL
  AND ec.pais IS NOT NULL
  AND upper(trim(ec.pais)) = upper(p.codigo_iso);

UPDATE public.empresa_config ec
SET pais_id = p.id
FROM public.paises p
WHERE ec.pais_id IS NULL
  AND upper(p.codigo_iso) = 'PE';

UPDATE public.empresa_config ec
SET pais = upper(p.codigo_iso)
FROM public.paises p
WHERE ec.pais_id = p.id
  AND (ec.pais IS NULL OR btrim(ec.pais) = '');

UPDATE public.empresa_config ec
SET moneda_defecto = upper(p.moneda_codigo)
FROM public.paises p
WHERE ec.pais_id = p.id
  AND (ec.moneda_defecto IS NULL OR btrim(ec.moneda_defecto) = '');

UPDATE public.empresa_config ec
SET
  pais = COALESCE(NULLIF(upper(btrim(COALESCE(ec.pais, ''))), ''), 'PE'),
  moneda_defecto = COALESCE(NULLIF(upper(btrim(COALESCE(ec.moneda_defecto, ''))), ''), 'PEN'),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(ec.moneda, ''))), ''), COALESCE(NULLIF(upper(btrim(COALESCE(ec.moneda_defecto, ''))), ''), 'PEN')),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(ec.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA')
      THEN upper(COALESCE(NULLIF(btrim(ec.estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  plan = COALESCE(NULLIF(upper(btrim(COALESCE(ec.plan, ''))), ''), 'BASICO'),
  redondeo_decimales = GREATEST(0, LEAST(COALESCE(ec.redondeo_decimales, 2), 6)),
  incluir_igv_en_precio = COALESCE(ec.incluir_igv_en_precio, true),
  envio_automatico_sunat = COALESCE(ec.envio_automatico_sunat, true),
  generar_pdf_automatico = COALESCE(ec.generar_pdf_automatico, true),
  validar_ruc_sunat = COALESCE(ec.validar_ruc_sunat, true),
  usar_codigos_barra = COALESCE(ec.usar_codigos_barra, true),
  enviar_email_cliente = COALESCE(ec.enviar_email_cliente, false),
  configuracion_completa = COALESCE(ec.configuracion_completa, false),
  igv_porcentaje = GREATEST(COALESCE(ec.igv_porcentaje, 18), 0),
  retencion_tasa = GREATEST(COALESCE(ec.retencion_tasa, 0), 0),
  percepcion_tasa = GREATEST(COALESCE(ec.percepcion_tasa, 0), 0),
  detraccion_tasa = GREATEST(COALESCE(ec.detraccion_tasa, 0), 0),
  retencion_renta_porcentaje = GREATEST(COALESCE(ec.retencion_renta_porcentaje, 0), 0),
  dias_maximos_rma = GREATEST(COALESCE(ec.dias_maximos_rma, 30), 0),
  dias_vencimiento_factura = GREATEST(COALESCE(ec.dias_vencimiento_factura, 30), 0),
  umbral_gre_automatico = GREATEST(COALESCE(ec.umbral_gre_automatico, 700), 0),
  formato_numeros = COALESCE(NULLIF(btrim(COALESCE(ec.formato_numeros, '')), ''), '#,##0.00'),
  updated_at = now()
WHERE ec.tenant_id IS NOT NULL;

UPDATE public.wizard_progress wp
SET
  paso_actual = CASE
    WHEN COALESCE(wp.completado, false) THEN 7
    ELSE LEAST(GREATEST(COALESCE(wp.paso_actual, 1), 1), 7)
  END,
  pasos_completados = CASE
    WHEN COALESCE(wp.completado, false) THEN (
      SELECT COALESCE(array_agg(DISTINCT s ORDER BY s), ARRAY[7]::integer[])
      FROM unnest(array_cat(COALESCE(wp.pasos_completados, '{}'::integer[]), ARRAY[7]::integer[])) AS s
      WHERE s BETWEEN 1 AND 7
    )
    ELSE (
      SELECT COALESCE(array_agg(DISTINCT s ORDER BY s), '{}'::integer[])
      FROM unnest(COALESCE(wp.pasos_completados, '{}'::integer[])) AS s
      WHERE s BETWEEN 1 AND 7
    )
  END,
  configuracion_temporal = CASE
    WHEN wp.configuracion_temporal IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(wp.configuracion_temporal) = 'object' THEN wp.configuracion_temporal
    ELSE '{}'::jsonb
  END,
  completado = COALESCE(wp.completado, false),
  completado_at = CASE
    WHEN COALESCE(wp.completado, false) THEN COALESCE(wp.completado_at, wp.updated_at, now())
    ELSE NULL
  END,
  updated_at = now()
WHERE wp.tenant_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Integridad estructural.
-- ----------------------------------------------------------------------------
SELECT app.add_fk_if_possible('empresa_config', 'pais_id', 'paises', 'id', 'empresa_config_pais_id_fkey');

ALTER TABLE public.empresa_config
  ALTER COLUMN pais_id SET NOT NULL,
  ALTER COLUMN pais SET NOT NULL,
  ALTER COLUMN moneda_defecto SET NOT NULL,
  ALTER COLUMN estado SET NOT NULL,
  ALTER COLUMN plan SET NOT NULL,
  ALTER COLUMN configuracion_completa SET NOT NULL,
  ALTER COLUMN redondeo_decimales SET NOT NULL,
  ALTER COLUMN incluir_igv_en_precio SET NOT NULL,
  ALTER COLUMN envio_automatico_sunat SET NOT NULL,
  ALTER COLUMN generar_pdf_automatico SET NOT NULL,
  ALTER COLUMN validar_ruc_sunat SET NOT NULL,
  ALTER COLUMN usar_codigos_barra SET NOT NULL,
  ALTER COLUMN formato_numeros SET NOT NULL;

ALTER TABLE public.empresa_config DROP CONSTRAINT IF EXISTS ck_empresa_config_estado_runtime;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_estado_runtime
  CHECK (estado IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA'));

ALTER TABLE public.empresa_config DROP CONSTRAINT IF EXISTS ck_empresa_config_country_currency_runtime;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_country_currency_runtime
  CHECK (
    pais ~ '^[A-Z]{2}$'
    AND moneda_defecto ~ '^[A-Z]{3}$'
    AND (moneda IS NULL OR moneda ~ '^[A-Z]{3}$')
  );

ALTER TABLE public.empresa_config DROP CONSTRAINT IF EXISTS ck_empresa_config_financial_runtime;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_financial_runtime
  CHECK (
    redondeo_decimales BETWEEN 0 AND 6
    AND igv_porcentaje >= 0 AND igv_porcentaje <= 100
    AND retencion_tasa >= 0 AND retencion_tasa <= 100
    AND percepcion_tasa >= 0 AND percepcion_tasa <= 100
    AND detraccion_tasa >= 0 AND detraccion_tasa <= 100
    AND retencion_renta_porcentaje >= 0 AND retencion_renta_porcentaje <= 100
    AND umbral_gre_automatico >= 0
    AND dias_maximos_rma >= 0
    AND dias_vencimiento_factura >= 0
  );

ALTER TABLE public.empresa_config DROP CONSTRAINT IF EXISTS ck_empresa_config_dates_runtime;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_dates_runtime
  CHECK (
    (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
    AND (dian_resolucion_desde IS NULL OR dian_resolucion_hasta IS NULL OR dian_resolucion_hasta >= dian_resolucion_desde)
    AND (dian_resolucion_fecha_inicio IS NULL OR dian_resolucion_fecha_fin IS NULL OR dian_resolucion_fecha_fin >= dian_resolucion_fecha_inicio)
  );

ALTER TABLE public.empresa_config DROP CONSTRAINT IF EXISTS ck_empresa_config_demo_runtime;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_demo_runtime
  CHECK (
    (is_demo = true)
    OR (COALESCE(demo_extended, false) = false AND demo_expires_at IS NULL)
  );

ALTER TABLE public.wizard_progress DROP CONSTRAINT IF EXISTS ck_wizard_progress_step_runtime;
ALTER TABLE public.wizard_progress
  ADD CONSTRAINT ck_wizard_progress_step_runtime
  CHECK (paso_actual BETWEEN 1 AND 7);

ALTER TABLE public.wizard_progress DROP CONSTRAINT IF EXISTS ck_wizard_progress_steps_array_runtime;
ALTER TABLE public.wizard_progress
  ADD CONSTRAINT ck_wizard_progress_steps_array_runtime
  CHECK (pasos_completados <@ ARRAY[1,2,3,4,5,6,7]::integer[]);

ALTER TABLE public.wizard_progress DROP CONSTRAINT IF EXISTS ck_wizard_progress_temporal_runtime;
ALTER TABLE public.wizard_progress
  ADD CONSTRAINT ck_wizard_progress_temporal_runtime
  CHECK (jsonb_typeof(configuracion_temporal) = 'object');

ALTER TABLE public.wizard_progress DROP CONSTRAINT IF EXISTS ck_wizard_progress_completed_runtime;
ALTER TABLE public.wizard_progress
  ADD CONSTRAINT ck_wizard_progress_completed_runtime
  CHECK (
    (completado = false AND completado_at IS NULL)
    OR (completado = true AND completado_at IS NOT NULL)
  );

ALTER TABLE public.empresa_config VALIDATE CONSTRAINT ck_empresa_config_estado_runtime;
ALTER TABLE public.empresa_config VALIDATE CONSTRAINT ck_empresa_config_country_currency_runtime;
ALTER TABLE public.empresa_config VALIDATE CONSTRAINT ck_empresa_config_financial_runtime;
ALTER TABLE public.empresa_config VALIDATE CONSTRAINT ck_empresa_config_dates_runtime;
ALTER TABLE public.empresa_config VALIDATE CONSTRAINT ck_empresa_config_demo_runtime;

ALTER TABLE public.wizard_progress VALIDATE CONSTRAINT ck_wizard_progress_step_runtime;
ALTER TABLE public.wizard_progress VALIDATE CONSTRAINT ck_wizard_progress_steps_array_runtime;
ALTER TABLE public.wizard_progress VALIDATE CONSTRAINT ck_wizard_progress_temporal_runtime;
ALTER TABLE public.wizard_progress VALIDATE CONSTRAINT ck_wizard_progress_completed_runtime;

CREATE INDEX IF NOT EXISTS idx_empresa_config_ruc_pais_runtime
ON public.empresa_config (upper(btrim(ruc)), pais)
WHERE ruc IS NOT NULL AND btrim(ruc) <> '';

CREATE INDEX IF NOT EXISTS idx_empresa_config_email_runtime
ON public.empresa_config (lower(btrim(email)))
WHERE email IS NOT NULL AND btrim(email) <> '';

-- ----------------------------------------------------------------------------
-- Hardening RLS explicito.
-- ----------------------------------------------------------------------------
SELECT app.apply_tenant_policy('public', 'empresa_config');
SELECT app.apply_tenant_policy('public', 'wizard_progress');

COMMIT;
