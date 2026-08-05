-- Corrige una instalación parcialmente migrada donde sobrevivió el índice
-- global de permisos creado en 001. Desde 018, permisos es un catálogo por
-- tenant; mantener la unicidad global hace que sólo el primer tenant pueda
-- recibir RBAC y rompe el segundo alta/demo con SQLSTATE 23505.

BEGIN;

SET LOCAL search_path = public, app, pg_temp;

LOCK TABLE public.permisos IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.permisos p
    GROUP BY p.tenant_id, lower(p.modulo), lower(p.recurso), lower(p.accion)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'No se puede reparar la unicidad de permisos: existen duplicados dentro de un mismo tenant'
      USING ERRCODE = '23505';
  END IF;
END;
$preflight$;

DROP INDEX IF EXISTS public.ux_permisos_modulo_recurso_accion;

CREATE UNIQUE INDEX IF NOT EXISTS ux_permisos_tenant_modulo_recurso_accion
ON public.permisos (tenant_id, lower(modulo), lower(recurso), lower(accion))
WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_permisos_global_modulo_recurso_accion
ON public.permisos (lower(modulo), lower(recurso), lower(accion))
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_permisos_tenant_activo
ON public.permisos (tenant_id, activo);

-- 378 permitió que una prueba gratuita viva en PROD cuando el interruptor
-- allow_demo_data está encendido. El validador de 346 conservó la regla vieja
-- y reportaba PROD inválido precisamente cuando el interruptor estaba activo.
CREATE OR REPLACE FUNCTION public.validar_deployment_environment_runtime(
  p_expected_environment text,
  p_expected_project_ref text
)
RETURNS TABLE(check_name text, ok boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $validator$
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
    ('environment_configured', v_environment IN ('DEV', 'PROD'),
      COALESCE(v_environment, 'MISSING')),
    ('environment_matches', v_environment = upper(p_expected_environment),
      format('actual=%s expected=%s', COALESCE(v_environment, 'MISSING'), upper(p_expected_environment))),
    ('project_ref_matches', v_project_ref = p_expected_project_ref,
      format('actual=%s expected=%s', COALESCE(v_project_ref, 'MISSING'), p_expected_project_ref)),
    ('demo_policy_explicit', v_allow_demo IS NOT NULL,
      format('environment=%s allow_demo_data=%s', COALESCE(v_environment, 'MISSING'), COALESCE(v_allow_demo::text, 'MISSING'))),
    ('demo_tenants_match_policy', v_environment <> 'PROD' OR v_allow_demo OR v_demo_tenants = 0,
      format('environment=%s allow_demo_data=%s demo_or_qa_tenants=%s',
        COALESCE(v_environment, 'MISSING'), COALESCE(v_allow_demo::text, 'MISSING'), v_demo_tenants));
END;
$validator$;

REVOKE ALL ON FUNCTION public.validar_deployment_environment_runtime(text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validar_deployment_environment_runtime(text, text)
TO service_role;

COMMENT ON FUNCTION public.validar_deployment_environment_runtime(text, text) IS
  'Preflight fail-closed: valida entorno, project_ref y coherencia entre la política demo y los tenants existentes.';

COMMIT;
