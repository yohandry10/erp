-- Habilita RLS y políticas estándar por tenant si la tabla tiene tenant_id
CREATE OR REPLACE FUNCTION public._ensure_rls_if_tenant(p_table regclass)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  fn_tenant_exists boolean;
  v_tbl text;
  has_tenant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'current_tenant_id'
  ) INTO fn_tenant_exists;

  SELECT relname INTO v_tbl FROM pg_class WHERE oid = p_table;
  IF v_tbl IS NULL THEN
    RAISE EXCEPTION 'Tabla no encontrada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = v_tbl AND column_name = 'tenant_id'
  ) INTO has_tenant;

  IF NOT has_tenant THEN
    RAISE NOTICE 'Tabla % no tiene tenant_id, se omite RLS', v_tbl;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_select_tenant' AND tablename = v_tbl) THEN
    EXECUTE format(
      'CREATE POLICY rls_select_tenant ON %s FOR SELECT USING (%s)',
      p_table,
      CASE WHEN fn_tenant_exists THEN 'tenant_id = app.current_tenant_id() OR current_role = ''service_role''' ELSE 'true' END
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_insert_tenant' AND tablename = v_tbl) THEN
    EXECUTE format(
      'CREATE POLICY rls_insert_tenant ON %s FOR INSERT WITH CHECK (%s)',
      p_table,
      CASE WHEN fn_tenant_exists THEN 'tenant_id = app.current_tenant_id() OR current_role = ''service_role''' ELSE 'true' END
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_update_tenant' AND tablename = v_tbl) THEN
    EXECUTE format(
      'CREATE POLICY rls_update_tenant ON %s FOR UPDATE USING (%s)',
      p_table,
      CASE WHEN fn_tenant_exists THEN 'tenant_id = app.current_tenant_id() OR current_role = ''service_role''' ELSE 'true' END
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_delete_tenant' AND tablename = v_tbl) THEN
    EXECUTE format(
      'CREATE POLICY rls_delete_tenant ON %s FOR DELETE USING (%s)',
      p_table,
      CASE WHEN fn_tenant_exists THEN 'tenant_id = app.current_tenant_id() OR current_role = ''service_role''' ELSE 'true' END
    );
  END IF;
END;
$$;

-- Aplicar solo a las que tengan tenant_id
DO $$
BEGIN
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
END;
$$;
