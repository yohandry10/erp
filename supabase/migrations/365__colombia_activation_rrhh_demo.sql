-- Activación operativa de Colombia: demo CO, nómina/PILA versionada y
-- configuración laboral por tenant. PE y AR conservan sus contratos vigentes.

BEGIN;

UPDATE public.paises
SET nombre = 'Colombia',
    nombre_fiscal = 'DIAN',
    moneda_codigo = 'COP',
    moneda_simbolo = '$',
    activo = true,
    updated_at = now()
WHERE id = 2 OR codigo_iso = 'CO';

CREATE TABLE IF NOT EXISTS public.normativa_colombia_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  periodo text NOT NULL,
  salario_minimo numeric(14,2) NOT NULL,
  auxilio_transporte numeric(14,2) NOT NULL,
  salud_empleado numeric(9,6) NOT NULL DEFAULT 0.04,
  pension_empleado numeric(9,6) NOT NULL DEFAULT 0.04,
  salud_empleador numeric(9,6) NOT NULL DEFAULT 0.085,
  pension_empleador numeric(9,6) NOT NULL DEFAULT 0.12,
  caja_compensacion numeric(9,6) NOT NULL DEFAULT 0.04,
  sena numeric(9,6) NOT NULL DEFAULT 0.02,
  icbf numeric(9,6) NOT NULL DEFAULT 0.03,
  arl_clase_i numeric(9,6) NOT NULL DEFAULT 0.00522,
  prima_servicios_provision numeric(9,6) NOT NULL DEFAULT 0.083333,
  cesantias_provision numeric(9,6) NOT NULL DEFAULT 0.083333,
  intereses_cesantias_provision numeric(9,6) NOT NULL DEFAULT 0.01,
  vacaciones_provision numeric(9,6) NOT NULL DEFAULT 0.041667,
  horas_mensuales numeric(8,2) NOT NULL DEFAULT 230,
  fuente text NOT NULL DEFAULT 'UGPP/CST/DIAN',
  activo boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_normativa_colombia_periodo CHECK (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT ck_normativa_colombia_valores CHECK (
    salario_minimo > 0 AND auxilio_transporte >= 0 AND horas_mensuales > 0
    AND salud_empleado BETWEEN 0 AND 1
    AND pension_empleado BETWEEN 0 AND 1
    AND salud_empleador BETWEEN 0 AND 1
    AND pension_empleador BETWEEN 0 AND 1
    AND caja_compensacion BETWEEN 0 AND 1
    AND sena BETWEEN 0 AND 1
    AND icbf BETWEEN 0 AND 1
    AND arl_clase_i BETWEEN 0 AND 1
    AND prima_servicios_provision BETWEEN 0 AND 1
    AND cesantias_provision BETWEEN 0 AND 1
    AND intereses_cesantias_provision BETWEEN 0 AND 1
    AND vacaciones_provision BETWEEN 0 AND 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_normativa_colombia_scope_periodo_active
ON public.normativa_colombia_periodos (
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  periodo
)
WHERE activo = true;

INSERT INTO public.normativa_colombia_periodos (
  tenant_id, periodo, salario_minimo, auxilio_transporte,
  salud_empleado, pension_empleado, salud_empleador, pension_empleador,
  caja_compensacion, sena, icbf, arl_clase_i,
  prima_servicios_provision, cesantias_provision,
  intereses_cesantias_provision, vacaciones_provision,
  horas_mensuales, fuente, metadata
)
SELECT
  NULL, format('2026-%s', lpad(mes::text, 2, '0')),
  1750905, 249095,
  0.04, 0.04, 0.085, 0.12, 0.04, 0.02, 0.03, 0.00522,
  0.083333, 0.083333, 0.01, 0.041667, 230,
  'Decreto 0159/2026; UGPP; Código Sustantivo del Trabajo',
  jsonb_build_object(
    'version', '2026',
    'nota', 'ARL, exoneraciones, Fondo de Solidaridad y retención se resuelven por empleador y trabajador'
  )
FROM generate_series(1, 12) AS mes
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rrhh_configuracion_colombia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo_aportante text NOT NULL DEFAULT 'EMPLEADOR',
  actividad_economica_ciiu text,
  operador_pila text,
  eps_default text,
  fondo_pension_default text,
  arl_default text,
  arl_clase_riesgo integer NOT NULL DEFAULT 1,
  arl_tasa numeric(9,6) NOT NULL DEFAULT 0.00522,
  caja_compensacion_default text,
  sena_habilitado boolean NOT NULL DEFAULT true,
  icbf_habilitado boolean NOT NULL DEFAULT true,
  exonerado_salud_sena_icbf boolean NOT NULL DEFAULT false,
  nomina_electronica_habilitada boolean NOT NULL DEFAULT true,
  pila_habilitada boolean NOT NULL DEFAULT true,
  salario_minimo numeric(14,2) NOT NULL DEFAULT 1750905,
  auxilio_transporte numeric(14,2) NOT NULL DEFAULT 249095,
  configuracion_confirmada boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_rrhh_co_arl CHECK (
    arl_clase_riesgo BETWEEN 1 AND 5 AND arl_tasa > 0 AND arl_tasa <= 1
  ),
  CONSTRAINT ck_rrhh_co_minimos CHECK (
    salario_minimo > 0 AND auxilio_transporte >= 0
  )
);

ALTER TABLE public.empleados
  ADD COLUMN IF NOT EXISTS eps_codigo text,
  ADD COLUMN IF NOT EXISTS fondo_pension_codigo text,
  ADD COLUMN IF NOT EXISTS arl_codigo text,
  ADD COLUMN IF NOT EXISTS caja_compensacion_codigo text;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS eps_codigo text,
  ADD COLUMN IF NOT EXISTS fondo_pension_codigo text,
  ADD COLUMN IF NOT EXISTS arl_codigo text,
  ADD COLUMN IF NOT EXISTS caja_compensacion_codigo text;

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS ck_empleados_documento_runtime;
ALTER TABLE public.empleados
  ADD CONSTRAINT ck_empleados_documento_runtime
  CHECK (tipo_documento IN (
    'DNI', 'CE', 'PASAPORTE', 'RUC', 'CUIL', 'CUIT', 'CC', 'TI', 'NIT', 'OTRO'
  ))
  NOT VALID;
ALTER TABLE public.empleados VALIDATE CONSTRAINT ck_empleados_documento_runtime;

CREATE OR REPLACE FUNCTION app.seed_rrhh_colombia_tenant(p_tenant_id uuid)
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

  INSERT INTO public.rrhh_configuracion_colombia (
    tenant_id, actividad_economica_ciiu, operador_pila,
    eps_default, fondo_pension_default, arl_default,
    arl_clase_riesgo, arl_tasa, caja_compensacion_default,
    nomina_electronica_habilitada, pila_habilitada,
    configuracion_confirmada, metadata
  )
  VALUES (
    p_tenant_id,
    CASE WHEN v_demo THEN '4711' ELSE NULL END,
    CASE WHEN v_demo THEN 'SOI DEMO' ELSE NULL END,
    CASE WHEN v_demo THEN 'EPS DEMO' ELSE NULL END,
    CASE WHEN v_demo THEN 'COLPENSIONES DEMO' ELSE NULL END,
    CASE WHEN v_demo THEN 'ARL DEMO' ELSE NULL END,
    1, 0.00522,
    CASE WHEN v_demo THEN 'COMPENSAR DEMO' ELSE NULL END,
    true, true, v_demo,
    jsonb_build_object(
      'synthetic_demo', v_demo,
      'requires_professional_confirmation', NOT v_demo
    )
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET configuracion_confirmada =
        public.rrhh_configuracion_colombia.configuracion_confirmada OR EXCLUDED.configuracion_confirmada,
      updated_at = now();

  INSERT INTO public.conceptos_planilla (
    tenant_id, codigo, nombre, estado, activo, metadata
  )
  SELECT
    p_tenant_id, source.codigo, source.nombre, 'ACTIVO', true,
    jsonb_build_object('tipo', source.tipo, 'pais', 'CO', 'seed', 'rrhh_colombia_365')
  FROM (
    VALUES
      ('CO001', 'Salario básico', 'ingreso'),
      ('CO002', 'Auxilio de transporte', 'ingreso'),
      ('CO003', 'Horas extra diurnas', 'ingreso'),
      ('CO004', 'Horas extra nocturnas', 'ingreso'),
      ('CO005', 'Recargo nocturno', 'ingreso'),
      ('CO006', 'Otros devengados', 'ingreso'),
      ('CO101', 'Aporte trabajador a salud', 'descuento'),
      ('CO102', 'Aporte trabajador a pensión', 'descuento'),
      ('CO103', 'Fondo de Solidaridad Pensional', 'descuento'),
      ('CO104', 'Retención en la fuente', 'descuento'),
      ('CO105', 'Otras deducciones', 'descuento'),
      ('CO201', 'Aporte empleador a salud', 'aporte_empleador'),
      ('CO202', 'Aporte empleador a pensión', 'aporte_empleador'),
      ('CO203', 'Riesgos laborales ARL', 'aporte_empleador'),
      ('CO204', 'Caja de compensación familiar', 'aporte_empleador'),
      ('CO205', 'Aporte SENA', 'aporte_empleador'),
      ('CO206', 'Aporte ICBF', 'aporte_empleador'),
      ('CO207', 'Provisión prima de servicios', 'aporte_empleador'),
      ('CO208', 'Provisión cesantías', 'aporte_empleador'),
      ('CO209', 'Provisión intereses de cesantías', 'aporte_empleador'),
      ('CO210', 'Provisión vacaciones', 'aporte_empleador')
  ) AS source(codigo, nombre, tipo)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.conceptos_planilla target
    WHERE target.tenant_id = p_tenant_id AND target.codigo = source.codigo
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.seed_rrhh_colombia_from_empresa_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF upper(COALESCE(NEW.pais, '')) = 'CO' OR NEW.pais_id = 2 THEN
    PERFORM app.seed_rrhh_colombia_tenant(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_rrhh_colombia_empresa_config ON public.empresa_config;
CREATE TRIGGER trg_seed_rrhh_colombia_empresa_config
AFTER INSERT OR UPDATE OF pais, pais_id, is_demo ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_rrhh_colombia_from_empresa_config();

SELECT app.seed_rrhh_colombia_tenant(ec.tenant_id)
FROM public.empresa_config ec
WHERE upper(COALESCE(ec.pais, '')) = 'CO' OR ec.pais_id = 2;

CREATE OR REPLACE FUNCTION app.rrhh_colombia_defaults_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_pais text;
  v_config public.rrhh_configuracion_colombia%ROWTYPE;
BEGIN
  SELECT upper(COALESCE(ec.pais, t.pais, 'PE'))
  INTO v_pais
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE t.id = NEW.tenant_id
  LIMIT 1;
  IF v_pais <> 'CO' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'empleados' THEN
    NEW.tipo_documento := COALESCE(NULLIF(NEW.tipo_documento, ''), 'CC');
    IF NEW.tipo_documento = 'CC' AND NEW.numero_documento !~ '^[0-9]{6,10}$' THEN
      RAISE EXCEPTION 'Cédula de ciudadanía colombiana inválida';
    END IF;
    NEW.nacionalidad := COALESCE(NULLIF(NEW.nacionalidad, ''), 'CO');
    RETURN NEW;
  END IF;

  SELECT * INTO v_config FROM public.rrhh_configuracion_colombia
  WHERE tenant_id = NEW.tenant_id;
  NEW.moneda := 'COP';
  NEW.regimen_pensionario := COALESCE(NULLIF(NEW.regimen_pensionario, ''), 'PENSION_COLOMBIA');
  NEW.regimen_seguridad_social := COALESCE(NULLIF(NEW.regimen_seguridad_social, ''), 'PILA');
  NEW.eps_codigo := COALESCE(NULLIF(NEW.eps_codigo, ''), v_config.eps_default);
  NEW.fondo_pension_codigo := COALESCE(NULLIF(NEW.fondo_pension_codigo, ''), v_config.fondo_pension_default);
  NEW.arl_codigo := COALESCE(NULLIF(NEW.arl_codigo, ''), v_config.arl_default);
  NEW.caja_compensacion_codigo := COALESCE(NULLIF(NEW.caja_compensacion_codigo, ''), v_config.caja_compensacion_default);
  NEW.art_tasa := COALESCE(NEW.art_tasa, v_config.arl_tasa);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_rrhh_colombia_defaults_empleados ON public.empleados;
CREATE TRIGGER zz_rrhh_colombia_defaults_empleados
BEFORE INSERT OR UPDATE ON public.empleados
FOR EACH ROW EXECUTE FUNCTION app.rrhh_colombia_defaults_row();
DROP TRIGGER IF EXISTS zz_rrhh_colombia_defaults_contratos ON public.contratos;
CREATE TRIGGER zz_rrhh_colombia_defaults_contratos
BEFORE INSERT OR UPDATE ON public.contratos
FOR EACH ROW EXECUTE FUNCTION app.rrhh_colombia_defaults_row();

UPDATE public.planillas p
SET pais_codigo = 'CO', moneda = 'COP'
FROM public.empresa_config ec
WHERE ec.tenant_id = p.tenant_id
  AND (upper(COALESCE(ec.pais, '')) = 'CO' OR ec.pais_id = 2)
  AND (p.pais_codigo IS DISTINCT FROM 'CO' OR p.moneda IS DISTINCT FROM 'COP');

CREATE OR REPLACE FUNCTION public.validar_rrhh_colombia_readiness(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT jsonb_build_object(
    'pais', 'CO',
    'ready',
      upper(COALESCE(ec.pais, '')) = 'CO'
      AND ec.moneda_defecto = 'COP'
      AND cfg.configuracion_confirmada
      AND cfg.operador_pila IS NOT NULL
      AND cfg.eps_default IS NOT NULL
      AND cfg.fondo_pension_default IS NOT NULL
      AND cfg.arl_default IS NOT NULL
      AND cfg.arl_tasa > 0
      AND cfg.caja_compensacion_default IS NOT NULL
      AND cfg.nomina_electronica_habilitada
      AND cfg.pila_habilitada,
    'checks', jsonb_build_object(
      'tenant_colombia', upper(COALESCE(ec.pais, '')) = 'CO',
      'moneda_cop', ec.moneda_defecto = 'COP',
      'configuracion_confirmada', COALESCE(cfg.configuracion_confirmada, false),
      'operador_pila', cfg.operador_pila IS NOT NULL,
      'eps', cfg.eps_default IS NOT NULL,
      'pension', cfg.fondo_pension_default IS NOT NULL,
      'arl', cfg.arl_default IS NOT NULL AND COALESCE(cfg.arl_tasa, 0) > 0,
      'caja_compensacion', cfg.caja_compensacion_default IS NOT NULL,
      'nomina_electronica', COALESCE(cfg.nomina_electronica_habilitada, false),
      'pila', COALESCE(cfg.pila_habilitada, false)
    )
  )
  FROM public.empresa_config ec
  LEFT JOIN public.rrhh_configuracion_colombia cfg ON cfg.tenant_id = ec.tenant_id
  WHERE ec.tenant_id = p_tenant_id
  LIMIT 1;
$$;

ALTER TABLE public.normativa_colombia_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normativa_colombia_periodos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS normativa_colombia_tenant_or_global_select
ON public.normativa_colombia_periodos;
CREATE POLICY normativa_colombia_tenant_or_global_select
ON public.normativa_colombia_periodos
FOR SELECT USING (
  app.is_superadmin() OR tenant_id IS NULL OR tenant_id = app.current_tenant_id()
);
DROP POLICY IF EXISTS normativa_colombia_tenant_write
ON public.normativa_colombia_periodos;
CREATE POLICY normativa_colombia_tenant_write
ON public.normativa_colombia_periodos
FOR ALL USING (
  app.is_superadmin() OR tenant_id = app.current_tenant_id()
)
WITH CHECK (
  app.is_superadmin() OR tenant_id = app.current_tenant_id()
);
SELECT app.apply_tenant_policy('public', 'rrhh_configuracion_colombia');

CREATE OR REPLACE FUNCTION app.colombia_nit_check_digit(p_base text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  v_weights integer[] := ARRAY[71,67,59,53,47,43,41,37,29,23,19,17,13,7,3];
  v_reversed text := reverse(p_base);
  v_sum integer := 0;
  v_remainder integer;
  i integer;
BEGIN
  IF p_base !~ '^[0-9]{9,10}$' THEN
    RAISE EXCEPTION 'La base de NIT debe tener 9 o 10 dígitos';
  END IF;
  FOR i IN 1..length(v_reversed) LOOP
    v_sum := v_sum + substr(v_reversed, i, 1)::integer * v_weights[i];
  END LOOP;
  v_remainder := v_sum % 11;
  RETURN CASE WHEN v_remainder IN (0, 1) THEN v_remainder ELSE 11 - v_remainder END;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_demo_tenant(
  p_nombre varchar DEFAULT 'DEMO COMERCIAL S.A.C.',
  p_dias_duracion integer DEFAULT 14,
  p_pais_codigo varchar DEFAULT 'PE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, extensions, pg_temp
AS $$
DECLARE
  v_tenant_id uuid := extensions.gen_random_uuid();
  v_user_id uuid := extensions.gen_random_uuid();
  v_demo_email text;
  v_demo_password text;
  v_expires_at timestamptz;
  v_admin_demo_role_id uuid;
  v_country text := upper(btrim(COALESCE(p_pais_codigo, 'PE')));
  v_pais_id bigint;
  v_currency text;
  v_tax_id text;
  v_base text;
BEGIN
  IF v_country NOT IN ('PE', 'AR', 'CO') THEN
    RAISE EXCEPTION 'País demo no soportado: %. Use PE, AR o CO.', v_country;
  END IF;
  SELECT id, moneda_codigo INTO v_pais_id, v_currency
  FROM public.paises WHERE codigo_iso = v_country AND activo = true;
  IF v_pais_id IS NULL THEN RAISE EXCEPTION 'Catálogo del país % no disponible', v_country; END IF;

  IF v_country = 'AR' THEN
    v_base := '30' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    v_tax_id := v_base || app.argentina_cuit_check_digit(v_base)::text;
  ELSIF v_country = 'CO' THEN
    v_base := '9' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    v_tax_id := v_base || app.colombia_nit_check_digit(v_base)::text;
  ELSE
    v_tax_id := '20' || lpad((random() * 999999999)::int::text, 9, '0');
  END IF;

  v_demo_email := 'demo-' || lower(v_country) || '-' || left(v_tenant_id::text, 8) || '@temp.local';
  v_demo_password := upper(left(md5(random()::text), 8));
  v_expires_at := now() + make_interval(days => GREATEST(COALESCE(p_dias_duracion, 14), 1));

  INSERT INTO public.tenants (
    id, codigo, nombre, descripcion, pais, plan, activo, estado, created_at, updated_at
  ) VALUES (
    v_tenant_id, 'DEMO-' || v_country || '-' || upper(left(v_tenant_id::text, 8)),
    p_nombre, 'Tenant demo autogenerado para ' || v_country,
    v_country, 'demo', true, 'ACTIVO', now(), now()
  );
  INSERT INTO public.empresa_config (
    id, tenant_id, razon_social, nombre_comercial, ruc, pais, pais_id, moneda_defecto,
    tipo_empresa, usar_flujo_logistica,
    is_demo, demo_created_at, demo_expires_at, demo_extended, demo_conversion_attempted,
    estado, plan, created_at, updated_at
  ) VALUES (
    extensions.gen_random_uuid(), v_tenant_id, p_nombre, p_nombre, v_tax_id,
    v_country, v_pais_id, v_currency, 'MICRO', false,
    true, now(), v_expires_at, false, false,
    'PRUEBA', 'BASICO', now(), now()
  );
  INSERT INTO public.usuarios_sistema (
    id, tenant_id, nombre, apellido, email, nombre_usuario,
    password_hash, activo, estado, is_super_admin, is_demo_user, demo_email_temp,
    demo_expires_at, demo_retention_until, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, 'Usuario', 'Demo ' || v_country, v_demo_email, 'demo',
    extensions.crypt(v_demo_password, extensions.gen_salt('bf')),
    true, 'ACTIVO', false, true, v_demo_email, v_expires_at,
    v_expires_at + interval '30 days', now(), now()
  );
  INSERT INTO public.users (
    id, tenant_id, email, nombre, apellido, activo, estado, created_at, updated_at
  ) VALUES (
    v_user_id, v_tenant_id, v_demo_email, 'Usuario', 'Demo ' || v_country,
    true, 'ACTIVO', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  PERFORM app.ensure_demo_admin_rbac_for_tenant(v_tenant_id);
  SELECT id INTO v_admin_demo_role_id FROM public.roles
  WHERE tenant_id = v_tenant_id AND upper(nombre::text) = 'ADMIN_DEMO' LIMIT 1;
  IF v_admin_demo_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (
      id, usuario_sistema_id, role_id, tenant_id, created_at
    ) VALUES (
      extensions.gen_random_uuid(), v_user_id, v_admin_demo_role_id, v_tenant_id, now()
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object(
    'success', true, 'tenant_id', v_tenant_id, 'user_id', v_user_id,
    'email', v_demo_email, 'password', v_demo_password,
    'expires_at', v_expires_at,
    'dias_restantes', GREATEST(COALESCE(p_dias_duracion, 14), 1),
    'pais', v_country, 'pais_id', v_pais_id, 'moneda', v_currency
  );
END;
$$;

REVOKE ALL ON FUNCTION app.seed_rrhh_colombia_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.seed_rrhh_colombia_tenant(uuid) TO service_role;
REVOKE ALL ON FUNCTION app.colombia_nit_check_digit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.colombia_nit_check_digit(text) TO service_role;
REVOKE ALL ON FUNCTION public.validar_rrhh_colombia_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_rrhh_colombia_readiness(uuid)
TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM anon;
REVOKE ALL ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_demo_tenant(varchar, integer, varchar) TO service_role;

COMMENT ON TABLE public.rrhh_configuracion_colombia IS
  'Parámetros por empleador colombiano: PILA, EPS, pensión, ARL, caja, exoneraciones y nómina electrónica.';
COMMENT ON TABLE public.normativa_colombia_periodos IS
  'Normativa colombiana versionada para nómina, seguridad social, parafiscales y prestaciones.';

COMMIT;
