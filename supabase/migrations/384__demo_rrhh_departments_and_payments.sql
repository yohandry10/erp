-- A demo must expose meaningful data in every RRHH screen. Migration 383
-- created employees, contracts, attendance and payroll, but it left the
-- organizational catalog and the payment queue empty. This additive seed is
-- idempotent, keeps the current payroll payable, and backfills existing demos.

CREATE OR REPLACE FUNCTION app.demo_readiness_report_v2(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  WITH base AS (
    SELECT app.demo_readiness_report(p_tenant_id) AS report
  ), counts AS (
    SELECT
      (SELECT count(*) FROM public.departamentos
       WHERE tenant_id = p_tenant_id AND lower(estado::text) = 'activo') AS departamentos,
      (SELECT count(*) FROM public.pagos_empleados
       WHERE tenant_id = p_tenant_id) AS pagos_rrhh
  )
  SELECT base.report || to_jsonb(counts) || jsonb_build_object(
    'ready',
    COALESCE((base.report->>'ready')::boolean, false)
      AND counts.departamentos >= 2
      AND counts.pagos_rrhh >= 2
  )
  FROM base, counts;
$$;

CREATE OR REPLACE FUNCTION app.hydrate_demo_hr_sample_tx(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_departamento_admin uuid;
  v_departamento_ventas uuid;
  v_report jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant obligatorio para hidratar RRHH demo';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 384));

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresa_config
    WHERE tenant_id = p_tenant_id AND is_demo = true
  ) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa', p_tenant_id;
  END IF;

  INSERT INTO public.departamentos (tenant_id, nombre, codigo, estado, metadata)
  SELECT p_tenant_id, d.nombre, d.codigo, 'ACTIVO',
         jsonb_build_object('source', 'demo_business_seed_v2')
  FROM (VALUES
    ('Administración', 'ADM-DEMO'),
    ('Ventas', 'VTA-DEMO')
  ) AS d(nombre, codigo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.departamentos actual
    WHERE actual.tenant_id = p_tenant_id
      AND upper(btrim(actual.nombre)) = upper(btrim(d.nombre))
      AND lower(actual.estado::text) = 'activo'
  );

  SELECT id INTO v_departamento_admin
  FROM public.departamentos
  WHERE tenant_id = p_tenant_id
    AND upper(btrim(nombre)) = upper('Administración')
    AND lower(estado::text) = 'activo'
  ORDER BY created_at, id
  LIMIT 1;

  SELECT id INTO v_departamento_ventas
  FROM public.departamentos
  WHERE tenant_id = p_tenant_id
    AND upper(btrim(nombre)) = 'VENTAS'
    AND lower(estado::text) = 'activo'
  ORDER BY created_at, id
  LIMIT 1;

  UPDATE public.empleados
  SET id_departamento = v_departamento_admin,
      departamento_id = v_departamento_admin,
      departamento = 'Administración',
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND email = 'mquispe@demo.local'
    AND v_departamento_admin IS NOT NULL;

  UPDATE public.empleados
  SET id_departamento = v_departamento_ventas,
      departamento_id = v_departamento_ventas,
      departamento = 'Ventas',
      updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND email = 'crojas@demo.local'
    AND v_departamento_ventas IS NOT NULL;

  -- The payment queue mirrors the calculated payroll without pretending it
  -- has already been paid. Existing sync triggers populate rrhh_pagos, which
  -- is the compatibility relation currently consumed by the API.
  INSERT INTO public.pagos_empleados (
    tenant_id, nombre, codigo, estado, metadata, planilla_id, empleado_id,
    periodo, fecha_pago, metodo_pago, sueldo_bruto, descuentos, monto_neto,
    usuario_id
  )
  SELECT
    p_tenant_id,
    'Pago demo ' || concat_ws(' ', e.nombres, e.apellidos),
    'PAGO-DEMO-' || upper(left(replace(ep.id::text, '-', ''), 10)),
    'PENDIENTE',
    jsonb_build_object('source', 'demo_business_seed_v2'),
    ep.planilla_id,
    ep.empleado_id,
    p.periodo,
    NULL,
    'transferencia',
    COALESCE(ep.total_ingresos, 0),
    COALESCE(ep.total_descuentos, 0),
    app.to_numeric_or_zero(ep.neto_pagar::text),
    'demo-seed'
  FROM public.empleado_planilla ep
  JOIN public.planillas p
    ON p.id = ep.planilla_id AND p.tenant_id = p_tenant_id
  JOIN public.empleados e
    ON e.id = ep.empleado_id AND e.tenant_id = p_tenant_id
  WHERE ep.tenant_id = p_tenant_id
    AND p.metadata->>'source' = 'demo_business_seed_v1'
    AND NOT EXISTS (
      SELECT 1
      FROM public.pagos_empleados pago
      WHERE pago.tenant_id = p_tenant_id
        AND pago.planilla_id = ep.planilla_id
        AND pago.empleado_id = ep.empleado_id
    );

  v_report := app.demo_readiness_report_v2(p_tenant_id);
  RETURN v_report;
END;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_demo_hr_sample_tx(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  SELECT app.hydrate_demo_hr_sample_tx(p_tenant_id);
$$;

-- Existing commercial demos receive the same complete sample immediately.
DO $$
DECLARE
  demo_tenant record;
BEGIN
  FOR demo_tenant IN
    SELECT DISTINCT tenant_id
    FROM public.empresa_config
    WHERE is_demo = true AND tenant_id IS NOT NULL
  LOOP
    PERFORM app.hydrate_demo_hr_sample_tx(demo_tenant.tenant_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION app.demo_readiness_report_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.hydrate_demo_hr_sample_tx(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) TO service_role;

COMMENT ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) IS
  'Completa de forma idempotente departamentos, asignaciones y pagos pendientes de una demo preparada.';
