-- RRHH Argentina: separación normativa por país, configuración patronal,
-- conceptos de liquidación y campos registrales ARCA/LSD.
-- Perú conserva sus tablas, conceptos y cálculos existentes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.normativa_argentina_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  jubilacion_aporte numeric(9,6) NOT NULL DEFAULT 0.11,
  inssjp_aporte numeric(9,6) NOT NULL DEFAULT 0.03,
  obra_social_aporte numeric(9,6) NOT NULL DEFAULT 0.03,
  contribucion_patronal numeric(9,6) NOT NULL DEFAULT 0.18,
  art_tasa numeric(9,6) NOT NULL DEFAULT 0,
  sindicato_aporte_default numeric(9,6) NOT NULL DEFAULT 0,
  seguro_vida_monto numeric(14,2) NOT NULL DEFAULT 0,
  vacaciones_divisor numeric(8,2) NOT NULL DEFAULT 25,
  horas_mensuales numeric(8,2) NOT NULL DEFAULT 200,
  fuente text NOT NULL DEFAULT 'ARCA/LCT',
  activo boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_normativa_argentina_periodo CHECK (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT ck_normativa_argentina_tasas CHECK (
    jubilacion_aporte BETWEEN 0 AND 1
    AND inssjp_aporte BETWEEN 0 AND 1
    AND obra_social_aporte BETWEEN 0 AND 1
    AND contribucion_patronal BETWEEN 0 AND 1
    AND art_tasa BETWEEN 0 AND 1
    AND sindicato_aporte_default BETWEEN 0 AND 1
    AND seguro_vida_monto >= 0
    AND vacaciones_divisor > 0
    AND horas_mensuales > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_normativa_argentina_scope_periodo_active
ON public.normativa_argentina_periodos (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  periodo
)
WHERE activo = true;

INSERT INTO public.normativa_argentina_periodos (
  tenant_id, periodo, jubilacion_aporte, inssjp_aporte, obra_social_aporte,
  contribucion_patronal, art_tasa, sindicato_aporte_default,
  seguro_vida_monto, vacaciones_divisor, horas_mensuales, fuente, metadata
)
SELECT
  NULL,
  format('2026-%s', lpad(mes::text, 2, '0')),
  0.11, 0.03, 0.03, 0.18, 0, 0, 0, 25, 200,
  'ARCA aportes y contribuciones / LCT',
  jsonb_build_object(
    'version', '2026',
    'nota', 'ART, sindicato, seguro de vida y alícuota patronal efectiva se sobreescriben por empleador'
  )
FROM generate_series(1, 12) AS mes
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rrhh_configuracion_argentina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo_empleador text NOT NULL DEFAULT 'GENERAL',
  jurisdiccion_laboral text NOT NULL DEFAULT 'NACIONAL',
  actividad_codigo text,
  convenio_colectivo_codigo text,
  convenio_colectivo_descripcion text,
  categoria_default text,
  art_cuit text,
  art_razon_social text,
  art_tasa numeric(9,6) NOT NULL DEFAULT 0,
  obra_social_codigo_default text,
  sindicato_codigo_default text,
  sindicato_aporte_default numeric(9,6) NOT NULL DEFAULT 0,
  contribucion_patronal numeric(9,6) NOT NULL DEFAULT 0.18,
  seguro_vida_monto numeric(14,2) NOT NULL DEFAULT 0,
  periodo_prueba_max_meses integer NOT NULL DEFAULT 6,
  sistema_indemnizacion text NOT NULL DEFAULT 'LCT_245',
  libro_sueldos_digital_habilitado boolean NOT NULL DEFAULT true,
  simplificacion_registral_habilitada boolean NOT NULL DEFAULT true,
  formulario_931_habilitado boolean NOT NULL DEFAULT true,
  siradig_habilitado boolean NOT NULL DEFAULT true,
  configuracion_confirmada boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_rrhh_ar_tasas CHECK (
    art_tasa BETWEEN 0 AND 1
    AND sindicato_aporte_default BETWEEN 0 AND 1
    AND contribucion_patronal BETWEEN 0 AND 1
    AND seguro_vida_monto >= 0
  ),
  CONSTRAINT ck_rrhh_ar_prueba CHECK (periodo_prueba_max_meses BETWEEN 0 AND 12),
  CONSTRAINT ck_rrhh_ar_indemnizacion CHECK (
    sistema_indemnizacion IN ('LCT_245', 'FONDO_CESE_CCT')
  ),
  CONSTRAINT ck_rrhh_ar_art_cuit CHECK (
    art_cuit IS NULL OR regexp_replace(art_cuit, '[^0-9]', '', 'g') ~ '^[0-9]{11}$'
  )
);

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS cuil text,
  ADD COLUMN IF NOT EXISTS obra_social_codigo text,
  ADD COLUMN IF NOT EXISTS sindicato_codigo text,
  ADD COLUMN IF NOT EXISTS situacion_revista_codigo text,
  ADD COLUMN IF NOT EXISTS modalidad_contratacion_codigo text,
  ADD COLUMN IF NOT EXISTS condicion_codigo text,
  ADD COLUMN IF NOT EXISTS actividad_codigo text,
  ADD COLUMN IF NOT EXISTS zona_codigo text;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS regimen_seguridad_social text,
  ADD COLUMN IF NOT EXISTS convenio_colectivo_codigo text,
  ADD COLUMN IF NOT EXISTS categoria_convenio text,
  ADD COLUMN IF NOT EXISTS modalidad_contratacion_codigo text,
  ADD COLUMN IF NOT EXISTS situacion_revista_codigo text,
  ADD COLUMN IF NOT EXISTS obra_social_codigo text,
  ADD COLUMN IF NOT EXISTS sindicato_codigo text,
  ADD COLUMN IF NOT EXISTS sindicato_aporte_tasa numeric(9,6),
  ADD COLUMN IF NOT EXISTS art_cuit text,
  ADD COLUMN IF NOT EXISTS art_tasa numeric(9,6),
  ADD COLUMN IF NOT EXISTS ganancias_retencion_mensual numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seguro_vida_monto numeric(14,2),
  ADD COLUMN IF NOT EXISTS mejor_remuneracion_normal_habitual numeric(14,2),
  ADD COLUMN IF NOT EXISTS tope_indemnizatorio_convenio numeric(14,2),
  ADD COLUMN IF NOT EXISTS fondo_cese_reemplaza_indemnizacion boolean NOT NULL DEFAULT false;

ALTER TABLE public.planillas
  ADD COLUMN IF NOT EXISTS pais_codigo text,
  ADD COLUMN IF NOT EXISTS moneda text;

ALTER TABLE public.liquidaciones
  ADD COLUMN IF NOT EXISTS pais_codigo text,
  ADD COLUMN IF NOT EXISTS moneda text;

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_documento_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_documento_runtime
  CHECK (tipo_documento IN ('DNI', 'CE', 'PASAPORTE', 'RUC', 'CUIL', 'CUIT', 'OTRO'))
  NOT VALID;
ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_documento_runtime;

ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS ck_contratos_rrhh_ar_tasas;
ALTER TABLE public.contratos
  ADD CONSTRAINT ck_contratos_rrhh_ar_tasas CHECK (
    (sindicato_aporte_tasa IS NULL OR sindicato_aporte_tasa BETWEEN 0 AND 1)
    AND (art_tasa IS NULL OR art_tasa BETWEEN 0 AND 1)
    AND ganancias_retencion_mensual >= 0
    AND (seguro_vida_monto IS NULL OR seguro_vida_monto >= 0)
    AND (mejor_remuneracion_normal_habitual IS NULL OR mejor_remuneracion_normal_habitual >= 0)
    AND (tope_indemnizatorio_convenio IS NULL OR tope_indemnizatorio_convenio >= 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_empleados_tenant_cuil
ON public.empleados (tenant_id, cuil)
WHERE cuil IS NOT NULL AND btrim(cuil) <> '';

CREATE OR REPLACE FUNCTION app.argentina_cuil_valido(p_cuil text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = app, pg_catalog
AS $$
DECLARE
  v_cuil text := regexp_replace(COALESCE(p_cuil, ''), '[^0-9]', '', 'g');
BEGIN
  RETURN length(v_cuil) = 11
    AND substr(v_cuil, 11, 1)::integer =
      app.argentina_cuit_check_digit(substr(v_cuil, 1, 10));
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION app.rrhh_country_defaults_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pais text;
  v_config public.rrhh_configuracion_argentina%ROWTYPE;
BEGIN
  SELECT upper(COALESCE(ec.pais, t.pais, 'PE'))
  INTO v_pais
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE t.id = NEW.tenant_id
  LIMIT 1;

  IF v_pais <> 'AR' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'empleados' THEN
    NEW.cuil := regexp_replace(
      COALESCE(NULLIF(NEW.cuil, ''), NULLIF(NEW.numero_documento, '')),
      '[^0-9]', '', 'g'
    );
    IF NOT app.argentina_cuil_valido(NEW.cuil) THEN
      RAISE EXCEPTION 'CUIL argentino inválido';
    END IF;
    NEW.tipo_documento := 'CUIL';
    NEW.numero_documento := NEW.cuil;
    NEW.nacionalidad := COALESCE(NULLIF(NEW.nacionalidad, ''), 'AR');
    RETURN NEW;
  END IF;

  SELECT * INTO v_config
  FROM public.rrhh_configuracion_argentina
  WHERE tenant_id = NEW.tenant_id;

  NEW.moneda := 'ARS';
  NEW.regimen_pensionario := 'SIN_REGIMEN';
  NEW.regimen_seguridad_social := COALESCE(NULLIF(NEW.regimen_seguridad_social, ''), 'SIPA');
  NEW.convenio_colectivo_codigo := COALESCE(
    NULLIF(NEW.convenio_colectivo_codigo, ''),
    v_config.convenio_colectivo_codigo
  );
  NEW.categoria_convenio := COALESCE(
    NULLIF(NEW.categoria_convenio, ''),
    v_config.categoria_default
  );
  NEW.obra_social_codigo := COALESCE(
    NULLIF(NEW.obra_social_codigo, ''),
    v_config.obra_social_codigo_default
  );
  NEW.sindicato_codigo := COALESCE(
    NULLIF(NEW.sindicato_codigo, ''),
    v_config.sindicato_codigo_default
  );
  NEW.sindicato_aporte_tasa := COALESCE(
    NEW.sindicato_aporte_tasa,
    v_config.sindicato_aporte_default
  );
  NEW.art_cuit := COALESCE(NULLIF(NEW.art_cuit, ''), v_config.art_cuit);
  NEW.art_tasa := COALESCE(NEW.art_tasa, v_config.art_tasa);
  NEW.seguro_vida_monto := COALESCE(NEW.seguro_vida_monto, v_config.seguro_vida_monto);
  NEW.fondo_cese_reemplaza_indemnizacion :=
    COALESCE(NEW.fondo_cese_reemplaza_indemnizacion, false)
    OR v_config.sistema_indemnizacion = 'FONDO_CESE_CCT';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_rrhh_country_defaults_empleados ON public.empleados;
CREATE TRIGGER zz_rrhh_country_defaults_empleados
BEFORE INSERT OR UPDATE ON public.empleados
FOR EACH ROW EXECUTE FUNCTION app.rrhh_country_defaults_row();

DROP TRIGGER IF EXISTS zz_rrhh_country_defaults_contratos ON public.contratos;
CREATE TRIGGER zz_rrhh_country_defaults_contratos
BEFORE INSERT OR UPDATE ON public.contratos
FOR EACH ROW EXECUTE FUNCTION app.rrhh_country_defaults_row();

CREATE OR REPLACE FUNCTION app.seed_rrhh_argentina_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_demo boolean := false;
BEGIN
  SELECT COALESCE(is_demo, false) INTO v_demo
  FROM public.empresa_config
  WHERE tenant_id = p_tenant_id
  LIMIT 1;

  INSERT INTO public.rrhh_configuracion_argentina (
    tenant_id, actividad_codigo, convenio_colectivo_codigo,
    convenio_colectivo_descripcion, categoria_default,
    art_cuit, art_razon_social, art_tasa,
    obra_social_codigo_default, sindicato_codigo_default,
    contribucion_patronal, periodo_prueba_max_meses,
    configuracion_confirmada, metadata
  )
  VALUES (
    p_tenant_id,
    CASE WHEN v_demo THEN '620100' ELSE NULL END,
    CASE WHEN v_demo THEN '130/75' ELSE NULL END,
    CASE WHEN v_demo THEN 'Comercio - configuración sintética de demostración' ELSE NULL END,
    CASE WHEN v_demo THEN 'Administrativo A' ELSE NULL END,
    CASE WHEN v_demo THEN '30712345671' ELSE NULL END,
    CASE WHEN v_demo THEN 'ART DEMO (sin validez legal)' ELSE NULL END,
    CASE WHEN v_demo THEN 0.03 ELSE 0 END,
    CASE WHEN v_demo THEN '126205' ELSE NULL END,
    CASE WHEN v_demo THEN 'FAECYS' ELSE NULL END,
    0.18, 6, v_demo,
    jsonb_build_object(
      'synthetic_demo', v_demo,
      'requires_professional_confirmation', NOT v_demo
    )
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO public.conceptos_planilla (
    tenant_id, codigo, nombre, estado, activo, metadata
  )
  SELECT
    p_tenant_id, source.codigo, source.nombre, 'ACTIVO', true,
    jsonb_build_object('tipo', source.tipo, 'pais', 'AR', 'seed', 'rrhh_argentina_364')
  FROM (
    VALUES
      ('AR001', 'Sueldo básico', 'ingreso'),
      ('AR002', 'Vacaciones', 'ingreso'),
      ('AR003', 'Sueldo anual complementario (SAC)', 'ingreso'),
      ('AR004', 'Horas extras 50%', 'ingreso'),
      ('AR005', 'Horas extras 100%', 'ingreso'),
      ('AR006', 'Adicional remunerativo', 'ingreso'),
      ('AR101', 'Aporte jubilatorio SIPA', 'descuento'),
      ('AR102', 'Aporte INSSJP', 'descuento'),
      ('AR103', 'Aporte de obra social', 'descuento'),
      ('AR104', 'Aporte sindical', 'descuento'),
      ('AR105', 'Retención de Ganancias', 'descuento'),
      ('AR201', 'Contribuciones patronales', 'aporte_empleador'),
      ('AR202', 'Aseguradora de Riesgos del Trabajo (ART)', 'aporte_empleador'),
      ('AR203', 'Seguro colectivo de vida obligatorio', 'aporte_empleador')
  ) AS source(codigo, nombre, tipo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.conceptos_planilla target
    WHERE target.tenant_id = p_tenant_id
      AND target.codigo = source.codigo
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.seed_rrhh_argentina_from_empresa_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF upper(COALESCE(NEW.pais, '')) = 'AR' OR NEW.pais_id = 5 THEN
    PERFORM app.seed_rrhh_argentina_tenant(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_rrhh_argentina_empresa_config ON public.empresa_config;
CREATE TRIGGER trg_seed_rrhh_argentina_empresa_config
AFTER INSERT OR UPDATE OF pais, pais_id ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_rrhh_argentina_from_empresa_config();

SELECT app.seed_rrhh_argentina_tenant(ec.tenant_id)
FROM public.empresa_config ec
WHERE upper(COALESCE(ec.pais, '')) = 'AR' OR ec.pais_id = 5;

UPDATE public.planillas p
SET pais_codigo = 'AR', moneda = 'ARS'
FROM public.empresa_config ec
WHERE ec.tenant_id = p.tenant_id
  AND (upper(COALESCE(ec.pais, '')) = 'AR' OR ec.pais_id = 5)
  AND (p.pais_codigo IS DISTINCT FROM 'AR' OR p.moneda IS DISTINCT FROM 'ARS');

UPDATE public.planillas p
SET pais_codigo = 'PE', moneda = 'PEN'
FROM public.empresa_config ec
WHERE ec.tenant_id = p.tenant_id
  AND NOT (upper(COALESCE(ec.pais, '')) = 'AR' OR ec.pais_id = 5)
  AND (p.pais_codigo IS NULL OR p.moneda IS NULL);

CREATE OR REPLACE FUNCTION public.validar_rrhh_argentina_readiness(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT jsonb_build_object(
    'pais', 'AR',
    'ready',
      ec.tenant_id IS NOT NULL
      AND upper(COALESCE(ec.pais, '')) = 'AR'
      AND ec.moneda_defecto = 'ARS'
      AND cfg.tenant_id IS NOT NULL
      AND cfg.configuracion_confirmada
      AND cfg.convenio_colectivo_codigo IS NOT NULL
      AND cfg.art_tasa > 0
      AND cfg.libro_sueldos_digital_habilitado
      AND cfg.simplificacion_registral_habilitada
      AND cfg.formulario_931_habilitado,
    'checks', jsonb_build_object(
      'tenant_argentina', upper(COALESCE(ec.pais, '')) = 'AR',
      'moneda_ars', ec.moneda_defecto = 'ARS',
      'configuracion_laboral', cfg.tenant_id IS NOT NULL,
      'configuracion_confirmada', COALESCE(cfg.configuracion_confirmada, false),
      'convenio_colectivo', cfg.convenio_colectivo_codigo IS NOT NULL,
      'art_configurada', COALESCE(cfg.art_tasa, 0) > 0,
      'libro_sueldos_digital', COALESCE(cfg.libro_sueldos_digital_habilitado, false),
      'simplificacion_registral', COALESCE(cfg.simplificacion_registral_habilitada, false),
      'formulario_931', COALESCE(cfg.formulario_931_habilitado, false)
    )
  )
  FROM public.empresa_config ec
  LEFT JOIN public.rrhh_configuracion_argentina cfg ON cfg.tenant_id = ec.tenant_id
  WHERE ec.tenant_id = p_tenant_id
  LIMIT 1;
$$;

ALTER TABLE public.normativa_argentina_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normativa_argentina_periodos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS normativa_argentina_tenant_or_global_select
ON public.normativa_argentina_periodos;
CREATE POLICY normativa_argentina_tenant_or_global_select
ON public.normativa_argentina_periodos
FOR SELECT USING (
  app.is_superadmin()
  OR tenant_id IS NULL
  OR tenant_id = app.current_tenant_id()
);
DROP POLICY IF EXISTS normativa_argentina_tenant_write
ON public.normativa_argentina_periodos;
CREATE POLICY normativa_argentina_tenant_write
ON public.normativa_argentina_periodos
FOR ALL USING (
  app.is_superadmin() OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin() OR tenant_id = app.current_tenant_id()
);

SELECT app.apply_tenant_policy('public', 'rrhh_configuracion_argentina');

REVOKE ALL ON FUNCTION app.seed_rrhh_argentina_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.seed_rrhh_argentina_tenant(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.validar_rrhh_argentina_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_rrhh_argentina_readiness(uuid)
TO authenticated, service_role;

COMMENT ON TABLE public.rrhh_configuracion_argentina IS
  'Parámetros del empleador argentino que no pueden inferirse: CCT, ART, obra social, sindicato y modalidad de registración.';
COMMENT ON TABLE public.normativa_argentina_periodos IS
  'Parámetros laborales argentinos versionados por período; los valores contractuales se sobreescriben por tenant.';
COMMENT ON FUNCTION public.validar_rrhh_argentina_readiness(uuid) IS
  'Readiness laboral Argentina: evita declarar operativo un tenant sin CCT, ART, ARS y registración ARCA confirmados.';

COMMIT;
