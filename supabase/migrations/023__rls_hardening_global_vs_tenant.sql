-- ============================================================================
-- 023__rls_hardening_global_vs_tenant.sql
-- Endurece RLS en tablas mixtas (catalogo global + tenant).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper: políticas para tablas con tenant_id que permiten filas globales
-- (tenant_id IS NULL) visibles solo cuando existe contexto tenant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.apply_global_or_tenant_policy(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_tenant boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = p_schema
      AND table_name = p_table
      AND column_name = 'tenant_id'
  ) INTO v_has_tenant;

  IF NOT v_has_tenant THEN
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', p_schema, p_table);

  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', p_schema, p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_or_global_select ON %I.%I', p_schema, p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_or_global_write ON %I.%I', p_schema, p_table);

  EXECUTE format(
    'CREATE POLICY tenant_or_global_select ON %I.%I
     FOR SELECT
     USING (
       app.is_superadmin()
       OR (
         app.current_tenant_id() IS NOT NULL
         AND (
           tenant_id = app.current_tenant_id()
           OR tenant_id IS NULL
         )
       )
     )',
    p_schema,
    p_table
  );

  EXECUTE format(
    'CREATE POLICY tenant_or_global_write ON %I.%I
     FOR ALL
     USING (
       app.is_superadmin()
       OR (
         app.current_tenant_id() IS NOT NULL
         AND tenant_id = app.current_tenant_id()
       )
     )
     WITH CHECK (
       app.is_superadmin()
       OR (
         app.current_tenant_id() IS NOT NULL
         AND tenant_id = app.current_tenant_id()
       )
     )',
    p_schema,
    p_table
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- Aplicar hardening en catalogos mixtos (global + tenant)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_tables text[] := ARRAY[
    'metodos_pago',
    'notificacion_tipo_roles',
    'tipos_documentos_fiscales',
    'tipos_impuestos',
    'configuracion_fiscal',
    'tipos_cambio',
    'plan_cuentas',
    'plantillas_asientos_ventas'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    PERFORM app.apply_global_or_tenant_policy('public', v_table);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- Indices para consultas por tenant/global en catalogos
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_metodos_pago_tenant_codigo
ON public.metodos_pago (tenant_id, codigo);

CREATE INDEX IF NOT EXISTS idx_notificacion_tipo_roles_tenant_tipo
ON public.notificacion_tipo_roles (tenant_id, codigo);

CREATE INDEX IF NOT EXISTS idx_tipos_documentos_fiscales_tenant_pais_codigo
ON public.tipos_documentos_fiscales (tenant_id, pais_id, codigo);

CREATE INDEX IF NOT EXISTS idx_tipos_impuestos_tenant_pais_codigo
ON public.tipos_impuestos (tenant_id, pais_id, codigo);

CREATE INDEX IF NOT EXISTS idx_configuracion_fiscal_tenant_pais
ON public.configuracion_fiscal (tenant_id, pais_id, activo);

CREATE INDEX IF NOT EXISTS idx_tipos_cambio_tenant_fecha
ON public.tipos_cambio (tenant_id, codigo);

CREATE INDEX IF NOT EXISTS idx_plan_cuentas_tenant_codigo
ON public.plan_cuentas (tenant_id, codigo);

CREATE INDEX IF NOT EXISTS idx_plantillas_asientos_ventas_tenant_pais_tipo
ON public.plantillas_asientos_ventas (tenant_id, pais_id, tipo_documento, activo);

COMMIT;
