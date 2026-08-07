-- Colombia: frontera explícita entre fixtures demo y onboarding real (migración 368).
-- La demo conserva datos sintéticos completos; al promoverla se invalidan las
-- credenciales ficticias y el tenant queda listo para recibir credenciales
-- DIAN/PILA reales sin riesgo de transmitir valores DEMO.

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS dian_ultima_prueba_at timestamptz,
  ADD COLUMN IF NOT EXISTS dian_ultima_prueba_estado text,
  ADD COLUMN IF NOT EXISTS dian_ultima_prueba_detalle jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.empresa_config
  DROP CONSTRAINT IF EXISTS ck_empresa_config_dian_ultima_prueba_estado;
ALTER TABLE public.empresa_config
  ADD CONSTRAINT ck_empresa_config_dian_ultima_prueba_estado
  CHECK (dian_ultima_prueba_estado IS NULL OR dian_ultima_prueba_estado IN (
    'SIMULADA', 'TRANSPORTE_OK', 'INCOMPLETA', 'ERROR'
  ));

ALTER TABLE public.rrhh_configuracion_colombia
  ADD COLUMN IF NOT EXISTS pila_integracion_modo text NOT NULL DEFAULT 'ARCHIVO_OPERADOR',
  ADD COLUMN IF NOT EXISTS pila_operador_codigo text,
  ADD COLUMN IF NOT EXISTS pila_api_url text,
  ADD COLUMN IF NOT EXISTS pila_api_usuario text,
  ADD COLUMN IF NOT EXISTS pila_api_token text,
  ADD COLUMN IF NOT EXISTS pila_ultima_prueba_at timestamptz,
  ADD COLUMN IF NOT EXISTS pila_ultima_prueba_estado text,
  ADD COLUMN IF NOT EXISTS nomina_software_id text,
  ADD COLUMN IF NOT EXISTS nomina_software_pin text,
  ADD COLUMN IF NOT EXISTS nomina_test_set_id text;

ALTER TABLE public.rrhh_configuracion_colombia
  DROP CONSTRAINT IF EXISTS ck_rrhh_co_pila_integracion_modo;
ALTER TABLE public.rrhh_configuracion_colombia
  ADD CONSTRAINT ck_rrhh_co_pila_integracion_modo
  CHECK (pila_integracion_modo IN ('ARCHIVO_OPERADOR', 'API_PROVEEDOR'));

ALTER TABLE public.rrhh_configuracion_colombia
  DROP CONSTRAINT IF EXISTS ck_rrhh_co_pila_prueba_estado;
ALTER TABLE public.rrhh_configuracion_colombia
  ADD CONSTRAINT ck_rrhh_co_pila_prueba_estado
  CHECK (pila_ultima_prueba_estado IS NULL OR pila_ultima_prueba_estado IN (
    'SIMULADA', 'CONFIGURADA', 'INCOMPLETA', 'ERROR'
  ));

UPDATE public.rrhh_configuracion_colombia cfg
SET
  pila_operador_codigo = COALESCE(cfg.pila_operador_codigo, 'SOI'),
  nomina_software_id = COALESCE(cfg.nomina_software_id, 'DEMO-NOMINA-SOFTWARE'),
  nomina_software_pin = COALESCE(cfg.nomina_software_pin, 'DEMO-NOMINA-PIN'),
  nomina_test_set_id = COALESCE(cfg.nomina_test_set_id, 'DEMO-NOMINA-TESTSET'),
  pila_ultima_prueba_estado = COALESCE(cfg.pila_ultima_prueba_estado, 'SIMULADA'),
  pila_ultima_prueba_at = COALESCE(cfg.pila_ultima_prueba_at, now()),
  updated_at = now()
FROM public.empresa_config ec
WHERE ec.tenant_id = cfg.tenant_id
  AND ec.is_demo = true
  AND (upper(COALESCE(ec.pais, '')) = 'CO' OR ec.pais_id = 2);

UPDATE public.empresa_config
SET
  dian_url = COALESCE(NULLIF(dian_url, ''), 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc'),
  dian_usuario = COALESCE(NULLIF(dian_usuario, ''), 'DEMO-DIAN-USUARIO'),
  dian_password = COALESCE(NULLIF(dian_password, ''), 'DEMO-DIAN-PASSWORD'),
  dian_software_id = COALESCE(NULLIF(dian_software_id, ''), 'DEMO-SOFTWARE-ID'),
  dian_software_pin = COALESCE(NULLIF(dian_software_pin, ''), '00000'),
  dian_test_set_id = COALESCE(NULLIF(dian_test_set_id, ''), 'DEMO-TEST-SET'),
  dian_ultima_prueba_at = COALESCE(dian_ultima_prueba_at, now()),
  dian_ultima_prueba_estado = 'SIMULADA',
  dian_ultima_prueba_detalle = jsonb_build_object('synthetic_demo', true, 'transmitted', false),
  updated_at = now()
WHERE is_demo = true
  AND (upper(COALESCE(pais, '')) = 'CO' OR pais_id = 2);

CREATE OR REPLACE FUNCTION app.prepare_colombia_real_onboarding(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_is_colombia boolean;
BEGIN
  SELECT upper(COALESCE(pais, '')) = 'CO' OR pais_id = 2
  INTO v_is_colombia
  FROM public.empresa_config
  WHERE tenant_id = p_tenant_id
  LIMIT 1;

  IF NOT COALESCE(v_is_colombia, false) THEN
    RETURN jsonb_build_object('pais', 'NO_CO', 'prepared', false);
  END IF;

  UPDATE public.empresa_config
  SET
    dian_activo = false,
    dian_url = 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
    dian_usuario = NULL,
    dian_password = NULL,
    dian_software_id = NULL,
    dian_software_pin = NULL,
    dian_test_set_id = NULL,
    dian_resolucion_numero = NULL,
    dian_resolucion_prefijo = NULL,
    dian_resolucion_desde = NULL,
    dian_resolucion_hasta = NULL,
    dian_resolucion_fecha_inicio = NULL,
    dian_resolucion_fecha_fin = NULL,
    certificado_pfx = NULL,
    certificado_password = NULL,
    certificado_expira_en = NULL,
    configuracion_completa = false,
    dian_ultima_prueba_at = NULL,
    dian_ultima_prueba_estado = 'INCOMPLETA',
    dian_ultima_prueba_detalle = jsonb_build_object(
      'reason', 'DEMO_PROMOTED_REQUIRES_REAL_CREDENTIALS'
    ),
    updated_at = now()
  WHERE tenant_id = p_tenant_id;

  UPDATE public.rrhh_configuracion_colombia
  SET
    operador_pila = NULL,
    pila_operador_codigo = NULL,
    pila_api_url = NULL,
    pila_api_usuario = NULL,
    pila_api_token = NULL,
    eps_default = NULL,
    fondo_pension_default = NULL,
    arl_default = NULL,
    caja_compensacion_default = NULL,
    configuracion_confirmada = false,
    pila_ultima_prueba_at = NULL,
    pila_ultima_prueba_estado = 'INCOMPLETA',
    nomina_software_id = NULL,
    nomina_software_pin = NULL,
    nomina_test_set_id = NULL,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'synthetic_demo', false,
      'requires_professional_confirmation', true,
      'promoted_from_demo', true
    ),
    updated_at = now()
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'pais', 'CO',
    'prepared', true,
    'dian_ready', false,
    'pila_ready', false
  );
END;
$$;

REVOKE ALL ON FUNCTION app.prepare_colombia_real_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.prepare_colombia_real_onboarding(uuid) TO service_role;

COMMENT ON FUNCTION app.prepare_colombia_real_onboarding(uuid) IS
  'Elimina fixtures secretos DEMO al promover Colombia y abre onboarding DIAN/PILA real fail-closed.';

CREATE OR REPLACE FUNCTION public.validar_rrhh_colombia_readiness(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT jsonb_build_object(
    'pais', 'CO',
    'demo', COALESCE(ec.is_demo, false),
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
      AND cfg.pila_habilitada
      AND cfg.nomina_software_id IS NOT NULL
      AND cfg.nomina_software_pin IS NOT NULL
      AND cfg.nomina_test_set_id IS NOT NULL
      AND (
        cfg.pila_integracion_modo = 'ARCHIVO_OPERADOR'
        OR (
          cfg.pila_integracion_modo = 'API_PROVEEDOR'
          AND cfg.pila_api_url IS NOT NULL
          AND cfg.pila_api_token IS NOT NULL
        )
      ),
    'checks', jsonb_build_object(
      'tenant_colombia', upper(COALESCE(ec.pais, '')) = 'CO',
      'moneda_cop', ec.moneda_defecto = 'COP',
      'configuracion_confirmada', COALESCE(cfg.configuracion_confirmada, false),
      'operador_pila', cfg.operador_pila IS NOT NULL,
      'integracion_pila', cfg.pila_integracion_modo = 'ARCHIVO_OPERADOR'
        OR (cfg.pila_api_url IS NOT NULL AND cfg.pila_api_token IS NOT NULL),
      'eps', cfg.eps_default IS NOT NULL,
      'pension', cfg.fondo_pension_default IS NOT NULL,
      'arl', cfg.arl_default IS NOT NULL AND COALESCE(cfg.arl_tasa, 0) > 0,
      'caja_compensacion', cfg.caja_compensacion_default IS NOT NULL,
      'nomina_electronica', COALESCE(cfg.nomina_electronica_habilitada, false)
        AND cfg.nomina_software_id IS NOT NULL
        AND cfg.nomina_software_pin IS NOT NULL
        AND cfg.nomina_test_set_id IS NOT NULL,
      'pila', COALESCE(cfg.pila_habilitada, false)
    )
  )
  FROM public.empresa_config ec
  LEFT JOIN public.rrhh_configuracion_colombia cfg ON cfg.tenant_id = ec.tenant_id
  WHERE ec.tenant_id = p_tenant_id
  LIMIT 1;
$$;
