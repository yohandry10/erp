-- Habilita RLS y políticas por tenant en plan_cuentas y detalle_asientos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_ensure_rls_if_tenant'
  ) THEN
    RAISE NOTICE '_ensure_rls_if_tenant no existe; ejecute primero la migración 112__rls_pos_tables.sql';
    RETURN;
  END IF;

  IF to_regclass('public.plan_cuentas') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.plan_cuentas'::regclass);
  END IF;

  IF to_regclass('public.detalle_asientos') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.detalle_asientos'::regclass);
  END IF;
END;
$$;
