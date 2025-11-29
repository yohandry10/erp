-- Habilita RLS en tablas pendientes con tenant_id usando el helper _ensure_rls_if_tenant
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

  IF to_regclass('public.detalle_comunicacion_baja') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.detalle_comunicacion_baja'::regclass);
  END IF;

  IF to_regclass('public.detalle_resumen_diario') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.detalle_resumen_diario'::regclass);
  END IF;

  IF to_regclass('public.producto_precios_sucursal') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.producto_precios_sucursal'::regclass);
  END IF;

  IF to_regclass('public.producto_stock_sucursal') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.producto_stock_sucursal'::regclass);
  END IF;

  IF to_regclass('public.sucursales') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.sucursales'::regclass);
  END IF;

  IF to_regclass('public.pos_numeracion') IS NOT NULL THEN
    PERFORM public._ensure_rls_if_tenant('public.pos_numeracion'::regclass);
  END IF;
END;
$$;
