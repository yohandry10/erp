-- Seguridad demo: revocar ejecución pública del RPC de creación de tenants demo
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_demo_tenant'
      AND pg_catalog.pg_get_function_arguments(p.oid) = 'p_nombre character varying, p_dias_duracion integer'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.create_demo_tenant(VARCHAR, INTEGER) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.create_demo_tenant(VARCHAR, INTEGER) TO service_role;
  END IF;
END;
$$ LANGUAGE plpgsql;
