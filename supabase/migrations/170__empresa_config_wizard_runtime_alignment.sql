-- ============================================================================
-- 170__empresa_config_wizard_runtime_alignment.sql
-- Alineacion runtime para configuracion central:
-- empresa_config y wizard_progress.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- empresa_config: columnas runtime faltantes usadas por API/Web/Worker.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.empresa_config
  ADD COLUMN IF NOT EXISTS ultima_validacion timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_validacion_certificado timestamptz,
  ADD COLUMN IF NOT EXISTS errores_configuracion jsonb,
  ADD COLUMN IF NOT EXISTS sitio_web text,
  ADD COLUMN IF NOT EXISTS representante_legal text,
  ADD COLUMN IF NOT EXISTS dni_representante text,
  ADD COLUMN IF NOT EXISTS actividad_economica text,
  ADD COLUMN IF NOT EXISTS redondeo_decimales integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS incluir_igv_en_precio boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS envio_automatico_sunat boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS generar_pdf_automatico boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS enviar_email_cliente boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS validar_ruc_sunat boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS usar_codigos_barra boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS formato_numeros text DEFAULT '#,##0.00',
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS moneda text;

ALTER TABLE IF EXISTS public.empresa_config
  ALTER COLUMN pais TYPE text USING NULLIF(upper(btrim(COALESCE(pais, ''))), ''),
  ALTER COLUMN moneda_defecto TYPE text USING NULLIF(upper(btrim(COALESCE(moneda_defecto, ''))), ''),
  ALTER COLUMN moneda TYPE text USING NULLIF(upper(btrim(COALESCE(moneda, ''))), ''),
  ALTER COLUMN estado TYPE text USING upper(COALESCE(NULLIF(btrim(estado), ''), 'ACTIVO')),
  ALTER COLUMN plan TYPE text USING upper(COALESCE(NULLIF(btrim(plan), ''), 'BASICO')),
  ALTER COLUMN redondeo_decimales TYPE integer USING GREATEST(0, LEAST(6, app.to_int_or_zero(COALESCE(redondeo_decimales::text, '2')))),
  ALTER COLUMN igv_porcentaje TYPE numeric(10,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(igv_porcentaje::text, '18')), 0),
  ALTER COLUMN retencion_tasa TYPE numeric(10,4) USING GREATEST(app.to_numeric_or_zero(COALESCE(retencion_tasa::text, '0')), 0),
  ALTER COLUMN percepcion_tasa TYPE numeric(10,4) USING GREATEST(app.to_numeric_or_zero(COALESCE(percepcion_tasa::text, '0')), 0),
  ALTER COLUMN detraccion_tasa TYPE numeric(10,4) USING GREATEST(app.to_numeric_or_zero(COALESCE(detraccion_tasa::text, '0')), 0),
  ALTER COLUMN retencion_renta_porcentaje TYPE numeric(10,4) USING GREATEST(app.to_numeric_or_zero(COALESCE(retencion_renta_porcentaje::text, '0')), 0),
  ALTER COLUMN umbral_gre_automatico TYPE numeric(14,2) USING GREATEST(app.to_numeric_or_zero(COALESCE(umbral_gre_automatico::text, '700')), 0),
  ALTER COLUMN dias_maximos_rma TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(dias_maximos_rma::text, '30')), 0),
  ALTER COLUMN dias_vencimiento_factura TYPE integer USING GREATEST(app.to_int_or_zero(COALESCE(dias_vencimiento_factura::text, '30')), 0),
  ALTER COLUMN errores_configuracion TYPE jsonb USING (
    CASE
      WHEN errores_configuracion IS NULL THEN NULL
      WHEN jsonb_typeof(errores_configuracion) = 'object' THEN errores_configuracion
      ELSE jsonb_build_object('legacy', errores_configuracion)
    END
  ),
  ALTER COLUMN redondeo_decimales SET DEFAULT 2,
  ALTER COLUMN incluir_igv_en_precio SET DEFAULT true,
  ALTER COLUMN envio_automatico_sunat SET DEFAULT true,
  ALTER COLUMN generar_pdf_automatico SET DEFAULT true,
  ALTER COLUMN enviar_email_cliente SET DEFAULT false,
  ALTER COLUMN validar_ruc_sunat SET DEFAULT true,
  ALTER COLUMN usar_codigos_barra SET DEFAULT true,
  ALTER COLUMN formato_numeros SET DEFAULT '#,##0.00';

-- Backfill pais_id/pais/moneda_defecto desde catalogo de paises.
UPDATE public.empresa_config ec
SET pais_id = p.id
FROM public.paises p
WHERE ec.pais_id IS NULL
  AND ec.pais IS NOT NULL
  AND upper(trim(ec.pais)) = upper(p.codigo_iso);

UPDATE public.empresa_config ec
SET pais = upper(p.codigo_iso)
FROM public.paises p
WHERE (ec.pais IS NULL OR btrim(ec.pais) = '')
  AND ec.pais_id IS NOT NULL
  AND ec.pais_id = p.id;

UPDATE public.empresa_config ec
SET moneda_defecto = upper(p.moneda_codigo)
FROM public.paises p
WHERE (ec.moneda_defecto IS NULL OR btrim(ec.moneda_defecto) = '')
  AND (
    (ec.pais_id IS NOT NULL AND ec.pais_id = p.id)
    OR (ec.pais IS NOT NULL AND upper(trim(ec.pais)) = upper(p.codigo_iso))
  );

UPDATE public.empresa_config ec
SET
  nombre = COALESCE(NULLIF(btrim(COALESCE(ec.nombre, '')), ''), NULLIF(btrim(COALESCE(ec.razon_social, '')), ''), NULLIF(btrim(COALESCE(ec.nombre_comercial, '')), '')),
  razon_social = COALESCE(NULLIF(btrim(COALESCE(ec.razon_social, '')), ''), NULLIF(btrim(COALESCE(ec.nombre, '')), ''), NULLIF(btrim(COALESCE(ec.nombre_comercial, '')), '')),
  nombre_comercial = COALESCE(NULLIF(btrim(COALESCE(ec.nombre_comercial, '')), ''), NULLIF(btrim(COALESCE(ec.nombre, '')), ''), NULLIF(btrim(COALESCE(ec.razon_social, '')), '')),
  direccion_fiscal = COALESCE(NULLIF(btrim(COALESCE(ec.direccion_fiscal, '')), ''), NULLIF(btrim(COALESCE(ec.direccion, '')), '')),
  direccion = COALESCE(NULLIF(btrim(COALESCE(ec.direccion, '')), ''), NULLIF(btrim(COALESCE(ec.direccion_fiscal, '')), '')),
  pais = COALESCE(NULLIF(upper(btrim(COALESCE(ec.pais, ''))), ''), 'PE'),
  moneda_defecto = COALESCE(NULLIF(upper(btrim(COALESCE(ec.moneda_defecto, ''))), ''), 'PEN'),
  moneda = COALESCE(NULLIF(upper(btrim(COALESCE(ec.moneda, ''))), ''), NULLIF(upper(btrim(COALESCE(ec.moneda_defecto, ''))), ''), 'PEN'),
  estado = CASE
    WHEN upper(COALESCE(NULLIF(btrim(ec.estado), ''), 'ACTIVO')) IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA')
      THEN upper(COALESCE(NULLIF(btrim(ec.estado), ''), 'ACTIVO'))
    ELSE 'ACTIVO'
  END,
  plan = COALESCE(NULLIF(upper(btrim(COALESCE(ec.plan, ''))), ''), 'BASICO'),
  redondeo_decimales = GREATEST(COALESCE(ec.redondeo_decimales, 2), 0),
  incluir_igv_en_precio = COALESCE(ec.incluir_igv_en_precio, true),
  envio_automatico_sunat = COALESCE(ec.envio_automatico_sunat, true),
  generar_pdf_automatico = COALESCE(ec.generar_pdf_automatico, true),
  enviar_email_cliente = COALESCE(ec.enviar_email_cliente, false),
  validar_ruc_sunat = COALESCE(ec.validar_ruc_sunat, true),
  usar_codigos_barra = COALESCE(ec.usar_codigos_barra, true),
  formato_numeros = COALESCE(NULLIF(btrim(COALESCE(ec.formato_numeros, '')), ''), '#,##0.00'),
  configuracion_completa = COALESCE(ec.configuracion_completa, false),
  igv_porcentaje = GREATEST(COALESCE(ec.igv_porcentaje, 18), 0),
  retencion_tasa = GREATEST(COALESCE(ec.retencion_tasa, 0), 0),
  percepcion_tasa = GREATEST(COALESCE(ec.percepcion_tasa, 0), 0),
  detraccion_tasa = GREATEST(COALESCE(ec.detraccion_tasa, 0), 0),
  retencion_renta_porcentaje = GREATEST(COALESCE(ec.retencion_renta_porcentaje, 0), 0),
  dias_maximos_rma = GREATEST(COALESCE(ec.dias_maximos_rma, 30), 0),
  dias_vencimiento_factura = GREATEST(COALESCE(ec.dias_vencimiento_factura, 30), 0),
  umbral_gre_automatico = GREATEST(COALESCE(ec.umbral_gre_automatico, 700), 0),
  errores_configuracion = CASE
    WHEN ec.errores_configuracion IS NULL THEN NULL
    WHEN jsonb_typeof(ec.errores_configuracion) = 'object' THEN ec.errores_configuracion
    ELSE jsonb_build_object('legacy', ec.errores_configuracion)
  END,
  updated_at = now()
WHERE ec.tenant_id IS NOT NULL;

UPDATE public.empresa_config ec
SET fecha_validacion_certificado = COALESCE(ec.fecha_validacion_certificado, ec.ultima_validacion, ec.updated_at, now()),
    updated_at = now()
WHERE ec.certificado_expira_en IS NOT NULL
  AND ec.fecha_validacion_certificado IS NULL;

CREATE OR REPLACE FUNCTION app.normalize_empresa_config_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pais_id bigint;
  v_pais text;
  v_moneda text;
BEGIN
  NEW.nombre := NULLIF(btrim(COALESCE(NEW.nombre, '')), '');
  NEW.razon_social := NULLIF(btrim(COALESCE(NEW.razon_social, '')), '');
  NEW.nombre_comercial := NULLIF(btrim(COALESCE(NEW.nombre_comercial, '')), '');
  NEW.nombre := COALESCE(NEW.nombre, NEW.razon_social, NEW.nombre_comercial);
  NEW.razon_social := COALESCE(NEW.razon_social, NEW.nombre, NEW.nombre_comercial);
  NEW.nombre_comercial := COALESCE(NEW.nombre_comercial, NEW.nombre, NEW.razon_social);

  NEW.direccion_fiscal := COALESCE(NULLIF(btrim(COALESCE(NEW.direccion_fiscal, '')), ''), NULLIF(btrim(COALESCE(NEW.direccion, '')), ''));
  NEW.direccion := COALESCE(NULLIF(btrim(COALESCE(NEW.direccion, '')), ''), NEW.direccion_fiscal);

  NEW.pais := NULLIF(upper(btrim(COALESCE(NEW.pais, ''))), '');
  NEW.moneda_defecto := NULLIF(upper(btrim(COALESCE(NEW.moneda_defecto, ''))), '');
  NEW.moneda := NULLIF(upper(btrim(COALESCE(NEW.moneda, ''))), '');

  IF NEW.pais_id IS NOT NULL THEN
    SELECT p.id, upper(p.codigo_iso), upper(p.moneda_codigo)
    INTO v_pais_id, v_pais, v_moneda
    FROM public.paises p
    WHERE p.id = NEW.pais_id
    LIMIT 1;
  ELSIF NEW.pais IS NOT NULL THEN
    SELECT p.id, upper(p.codigo_iso), upper(p.moneda_codigo)
    INTO v_pais_id, v_pais, v_moneda
    FROM public.paises p
    WHERE upper(p.codigo_iso) = NEW.pais
    LIMIT 1;
  END IF;

  IF v_pais_id IS NOT NULL THEN
    NEW.pais_id := v_pais_id;
    NEW.pais := COALESCE(NEW.pais, v_pais);
    NEW.moneda_defecto := COALESCE(NEW.moneda_defecto, v_moneda);
  END IF;

  NEW.pais := COALESCE(NEW.pais, 'PE');
  NEW.moneda_defecto := COALESCE(NEW.moneda_defecto, 'PEN');
  NEW.moneda := COALESCE(NEW.moneda, NEW.moneda_defecto);

  NEW.estado := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.estado, '')), ''), 'ACTIVO'));
  IF NEW.estado NOT IN ('ACTIVO', 'INACTIVO', 'SUSPENDIDO', 'PRUEBA') THEN
    NEW.estado := 'ACTIVO';
  END IF;

  NEW.plan := upper(COALESCE(NULLIF(btrim(COALESCE(NEW.plan, '')), ''), 'BASICO'));
  NEW.redondeo_decimales := GREATEST(0, LEAST(COALESCE(NEW.redondeo_decimales, 2), 6));

  NEW.igv_porcentaje := GREATEST(COALESCE(NEW.igv_porcentaje, 18), 0);
  NEW.retencion_tasa := GREATEST(COALESCE(NEW.retencion_tasa, 0), 0);
  NEW.percepcion_tasa := GREATEST(COALESCE(NEW.percepcion_tasa, 0), 0);
  NEW.detraccion_tasa := GREATEST(COALESCE(NEW.detraccion_tasa, 0), 0);
  NEW.retencion_renta_porcentaje := GREATEST(COALESCE(NEW.retencion_renta_porcentaje, 0), 0);

  NEW.dias_maximos_rma := GREATEST(COALESCE(NEW.dias_maximos_rma, 30), 0);
  NEW.dias_vencimiento_factura := GREATEST(COALESCE(NEW.dias_vencimiento_factura, 30), 0);
  NEW.umbral_gre_automatico := GREATEST(COALESCE(NEW.umbral_gre_automatico, 700), 0);

  NEW.configuracion_completa := COALESCE(NEW.configuracion_completa, false);
  NEW.incluir_igv_en_precio := COALESCE(NEW.incluir_igv_en_precio, true);
  NEW.envio_automatico_sunat := COALESCE(NEW.envio_automatico_sunat, true);
  NEW.generar_pdf_automatico := COALESCE(NEW.generar_pdf_automatico, true);
  NEW.enviar_email_cliente := COALESCE(NEW.enviar_email_cliente, false);
  NEW.validar_ruc_sunat := COALESCE(NEW.validar_ruc_sunat, true);
  NEW.usar_codigos_barra := COALESCE(NEW.usar_codigos_barra, true);

  NEW.formato_numeros := COALESCE(NULLIF(btrim(COALESCE(NEW.formato_numeros, '')), ''), '#,##0.00');

  NEW.errores_configuracion := CASE
    WHEN NEW.errores_configuracion IS NULL THEN NULL
    WHEN jsonb_typeof(NEW.errores_configuracion) = 'object' THEN NEW.errores_configuracion
    ELSE jsonb_build_object('legacy', NEW.errores_configuracion)
  END;

  IF NEW.fecha_inicio IS NOT NULL AND NEW.fecha_fin IS NOT NULL AND NEW.fecha_fin < NEW.fecha_inicio THEN
    NEW.fecha_fin := NEW.fecha_inicio;
  END IF;

  IF NEW.certificado_expira_en IS NOT NULL THEN
    NEW.fecha_validacion_certificado := COALESCE(NEW.fecha_validacion_certificado, NEW.ultima_validacion, now());
  END IF;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_empresa_config_row ON public.empresa_config;
CREATE TRIGGER trg_normalize_empresa_config_row
BEFORE INSERT OR UPDATE ON public.empresa_config
FOR EACH ROW
EXECUTE FUNCTION app.normalize_empresa_config_row();

CREATE INDEX IF NOT EXISTS idx_empresa_config_tenant_estado_plan_runtime
ON public.empresa_config (tenant_id, estado, plan);

CREATE INDEX IF NOT EXISTS idx_empresa_config_pais_runtime
ON public.empresa_config (pais, pais_id);

CREATE INDEX IF NOT EXISTS idx_empresa_config_certificado_expira_runtime
ON public.empresa_config (certificado_expira_en);

CREATE INDEX IF NOT EXISTS idx_empresa_config_ultima_validacion_runtime
ON public.empresa_config (ultima_validacion DESC);

-- ----------------------------------------------------------------------------
-- wizard_progress: normalizacion runtime del flujo de wizard.
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.wizard_progress
  ALTER COLUMN paso_actual TYPE integer USING LEAST(GREATEST(app.to_int_or_zero(COALESCE(paso_actual::text, '1')), 1), 7),
  ALTER COLUMN pasos_completados SET DEFAULT '{}'::integer[],
  ALTER COLUMN configuracion_temporal SET DEFAULT '{}'::jsonb,
  ALTER COLUMN paso_actual SET DEFAULT 1,
  ALTER COLUMN completado SET DEFAULT false;

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
  created_at = COALESCE(wp.created_at, now()),
  updated_at = now()
WHERE wp.tenant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.normalize_wizard_progress_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  NEW.paso_actual := LEAST(GREATEST(COALESCE(NEW.paso_actual, 1), 1), 7);

  SELECT COALESCE(array_agg(DISTINCT s ORDER BY s), '{}'::integer[])
  INTO NEW.pasos_completados
  FROM unnest(COALESCE(NEW.pasos_completados, '{}'::integer[])) AS s
  WHERE s BETWEEN 1 AND 7;

  IF COALESCE(NEW.completado, false) THEN
    NEW.paso_actual := 7;
    SELECT COALESCE(array_agg(DISTINCT s ORDER BY s), ARRAY[7]::integer[])
    INTO NEW.pasos_completados
    FROM unnest(array_cat(COALESCE(NEW.pasos_completados, '{}'::integer[]), ARRAY[7]::integer[])) AS s
    WHERE s BETWEEN 1 AND 7;
    NEW.completado_at := COALESCE(NEW.completado_at, now());
  ELSE
    NEW.completado := false;
    NEW.completado_at := NULL;
  END IF;

  NEW.configuracion_temporal := CASE
    WHEN NEW.configuracion_temporal IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(NEW.configuracion_temporal) = 'object' THEN NEW.configuracion_temporal
    ELSE '{}'::jsonb
  END;

  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_wizard_progress_row ON public.wizard_progress;
CREATE TRIGGER trg_normalize_wizard_progress_row
BEFORE INSERT OR UPDATE ON public.wizard_progress
FOR EACH ROW
EXECUTE FUNCTION app.normalize_wizard_progress_row();

CREATE INDEX IF NOT EXISTS idx_wizard_progress_tenant_completado_updated_runtime
ON public.wizard_progress (tenant_id, completado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wizard_progress_paso_actual_updated_runtime
ON public.wizard_progress (paso_actual, updated_at DESC);

COMMIT;
