-- Limite canonico entre bases DEV y PROD.
-- La fila singleton se configura fuera de la migracion para que el mismo
-- artefacto sea promovible sin codificar un project_ref particular.

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.deployment_environment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  environment text NOT NULL DEFAULT 'UNCONFIGURED'
    CHECK (environment IN ('UNCONFIGURED', 'DEV', 'PROD')),
  project_ref text,
  allow_demo_data boolean NOT NULL DEFAULT false,
  configured_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_deployment_environment_project_ref
    CHECK (project_ref IS NULL OR project_ref ~ '^[a-z]{20}$'),
  CONSTRAINT ck_deployment_environment_prod_no_demo
    CHECK (environment <> 'PROD' OR allow_demo_data = false),
  CONSTRAINT ck_deployment_environment_configured
    CHECK (
      environment = 'UNCONFIGURED'
      OR (project_ref IS NOT NULL AND configured_at IS NOT NULL)
    )
);

INSERT INTO app.deployment_environment (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE app.deployment_environment ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.deployment_environment FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.deployment_environment FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE app.deployment_environment TO service_role;

CREATE OR REPLACE FUNCTION app.is_demo_tenant_identity(
  p_codigo text,
  p_nombre text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT
    upper(COALESCE(p_codigo, '')) LIKE 'DEMO-%'
    OR upper(COALESCE(p_codigo, '')) LIKE 'QA-%'
    OR upper(COALESCE(p_nombre, '')) ~ '(^|[^A-Z0-9])(DEMO|QA)([^A-Z0-9]|$)';
$$;

CREATE OR REPLACE FUNCTION app.enforce_tenant_environment_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_environment text;
  v_allow_demo boolean;
BEGIN
  SELECT environment, allow_demo_data
    INTO v_environment, v_allow_demo
  FROM app.deployment_environment
  WHERE singleton = true;

  IF v_environment IS NULL OR v_environment = 'UNCONFIGURED' THEN
    RAISE EXCEPTION 'deployment_environment no esta configurado; se bloquea la escritura de tenants'
      USING ERRCODE = '55000';
  END IF;

  IF v_environment = 'PROD'
     AND NOT v_allow_demo
     AND app.is_demo_tenant_identity(NEW.codigo, NEW.nombre) THEN
    RAISE EXCEPTION 'PROD rechaza tenants con identidad DEMO/QA'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.enforce_empresa_demo_environment_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_environment text;
  v_allow_demo boolean;
BEGIN
  SELECT environment, allow_demo_data
    INTO v_environment, v_allow_demo
  FROM app.deployment_environment
  WHERE singleton = true;

  IF v_environment IS NULL OR v_environment = 'UNCONFIGURED' THEN
    RAISE EXCEPTION 'deployment_environment no esta configurado; se bloquea la escritura de empresa_config'
      USING ERRCODE = '55000';
  END IF;

  IF v_environment = 'PROD' AND NOT v_allow_demo AND COALESCE(NEW.is_demo, false) THEN
    RAISE EXCEPTION 'PROD rechaza empresa_config.is_demo=true'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_environment_boundary ON public.tenants;
CREATE TRIGGER trg_tenants_environment_boundary
BEFORE INSERT OR UPDATE OF codigo, nombre ON public.tenants
FOR EACH ROW EXECUTE FUNCTION app.enforce_tenant_environment_boundary();

DROP TRIGGER IF EXISTS trg_empresa_config_environment_boundary ON public.empresa_config;
CREATE TRIGGER trg_empresa_config_environment_boundary
BEFORE INSERT OR UPDATE OF is_demo ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.enforce_empresa_demo_environment_boundary();

CREATE OR REPLACE FUNCTION public.validar_deployment_environment_runtime(
  p_expected_environment text,
  p_expected_project_ref text
)
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_environment text;
  v_project_ref text;
  v_allow_demo boolean;
  v_demo_tenants bigint;
BEGIN
  SELECT environment, project_ref, allow_demo_data
    INTO v_environment, v_project_ref, v_allow_demo
  FROM app.deployment_environment
  WHERE singleton = true;

  SELECT count(*)
    INTO v_demo_tenants
  FROM public.tenants t
  LEFT JOIN public.empresa_config ec ON ec.tenant_id = t.id
  WHERE COALESCE(ec.is_demo, false)
     OR app.is_demo_tenant_identity(t.codigo, t.nombre);

  RETURN QUERY VALUES
    ('environment_configured', v_environment IN ('DEV', 'PROD'), COALESCE(v_environment, 'MISSING')),
    ('environment_matches', v_environment = upper(p_expected_environment),
      format('actual=%s expected=%s', COALESCE(v_environment, 'MISSING'), upper(p_expected_environment))),
    ('project_ref_matches', v_project_ref = p_expected_project_ref,
      format('actual=%s expected=%s', COALESCE(v_project_ref, 'MISSING'), p_expected_project_ref)),
    ('prod_demo_policy', v_environment <> 'PROD' OR NOT v_allow_demo,
      format('environment=%s allow_demo_data=%s', COALESCE(v_environment, 'MISSING'), COALESCE(v_allow_demo::text, 'MISSING'))),
    ('prod_has_no_demo_tenants', v_environment <> 'PROD' OR v_demo_tenants = 0,
      format('demo_or_qa_tenants=%s', v_demo_tenants));
END;
$$;

REVOKE ALL ON FUNCTION app.is_demo_tenant_identity(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.enforce_tenant_environment_boundary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.enforce_empresa_demo_environment_boundary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validar_deployment_environment_runtime(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_deployment_environment_runtime(text, text) TO service_role;

COMMENT ON TABLE app.deployment_environment IS
  'Marca singleton del entorno fisico. PROD no admite tenants ni empresa_config de demo/QA.';
COMMENT ON FUNCTION public.validar_deployment_environment_runtime(text, text) IS
  'Preflight fail-closed: valida entorno, project_ref y ausencia de datos demo en PROD.';
