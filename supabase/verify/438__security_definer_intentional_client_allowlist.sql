\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_unexpected integer;
  v_allowlisted integer;
  v_bad_views text;
  v_view_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_view_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND c.relname IN (
      'v_security_definer_inventory',
      'v_security_definer_risk_summary'
    );

  IF v_view_count <> 2 THEN
    RAISE EXCEPTION 'Faltan vistas SECURITY DEFINER de diagnóstico: %/2', v_view_count;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_bad_views
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'v_security_definer_inventory',
      'v_security_definer_risk_summary'
    )
    AND (
      NOT coalesce(c.reloptions, ARRAY[]::text[])
        @> ARRAY['security_invoker=true']
      OR has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'SELECT')
      OR NOT has_table_privilege('service_role', c.oid, 'SELECT')
      OR EXISTS (
        SELECT 1
        FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'SELECT'
      )
    );

  IF v_bad_views IS NOT NULL THEN
    RAISE EXCEPTION 'Vistas SECURITY DEFINER sin security_invoker/ACL esperado: %', v_bad_views;
  END IF;

  SELECT count(*)::integer
    INTO v_unexpected
  FROM public.v_security_definer_inventory
  WHERE execute_public
     OR COALESCE(execute_anon, false)
     OR COALESCE(execute_authenticated, false)
     OR risk_level = 'CRITICAL';

  IF v_unexpected <> 0 THEN
    RAISE EXCEPTION 'Persisten % funciones SECURITY DEFINER con riesgo inesperado', v_unexpected;
  END IF;

  SELECT count(*)::integer
    INTO v_allowlisted
  FROM public.v_security_definer_inventory
  WHERE allowed_client_execute
    AND (
      raw_execute_public
      OR COALESCE(raw_execute_anon, false)
      OR COALESCE(raw_execute_authenticated, false)
    );

  IF v_allowlisted <> 2 THEN
    RAISE EXCEPTION 'Allowlist SECURITY DEFINER inesperado: % funciones', v_allowlisted;
  END IF;
END;
$$;

-- security_invoker no debe volver las vistas inutilizables para su único
-- consumidor autorizado; la vista resumen también depende de la de inventario.
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM count(*) FROM public.v_security_definer_inventory;
  PERFORM count(*) FROM public.v_security_definer_risk_summary;
END;
$$;
RESET ROLE;

-- Un overload con el mismo nombre no pertenece al allowlist: la identidad
-- autorizada incluye esquema y tipos de argumentos.
CREATE FUNCTION app.hoy_tenant(text)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT current_date;
$$;
REVOKE ALL ON FUNCTION app.hoy_tenant(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.hoy_tenant(text) TO authenticated;

DO $$
DECLARE
  v_overload record;
BEGIN
  SELECT allowed_client_execute, raw_execute_authenticated, risk_level
    INTO v_overload
  FROM public.v_security_definer_inventory
  WHERE function_signature = to_regprocedure('app.hoy_tenant(text)')::text;

  IF NOT FOUND
     OR v_overload.allowed_client_execute
     OR v_overload.raw_execute_authenticated IS NOT TRUE
     OR v_overload.risk_level IS DISTINCT FROM 'CRITICAL' THEN
    RAISE EXCEPTION 'El overload app.hoy_tenant(text) fue allowlisted: %', row_to_json(v_overload);
  END IF;
END;
$$;

ROLLBACK;
