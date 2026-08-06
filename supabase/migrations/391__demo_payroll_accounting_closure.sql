-- A calculated demo payroll must be visible in accounting. Previous demo
-- readiness only required two generic entries (sale and purchase), allowing
-- RRHH to look populated while its payroll had no accrual journal entry.

CREATE OR REPLACE FUNCTION app.ensure_demo_payroll_accrual(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_planilla public.planillas%ROWTYPE;
  v_asiento_id uuid;
  v_cuenta_621 uuid;
  v_cuenta_627 uuid;
  v_cuenta_403 uuid;
  v_cuenta_407 uuid;
  v_cuenta_411 uuid;
  v_total_debe numeric(14,2);
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant obligatorio para asiento demo de planilla';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 391));

  IF NOT EXISTS (
    SELECT 1 FROM public.empresa_config
    WHERE tenant_id = p_tenant_id AND is_demo = true
  ) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa', p_tenant_id;
  END IF;

  SELECT * INTO v_planilla
  FROM public.planillas
  WHERE tenant_id = p_tenant_id
    AND metadata->>'source' = 'demo_business_seed_v1'
  ORDER BY created_at, id
  LIMIT 1;

  IF v_planilla.id IS NULL THEN
    -- Hay demos antiguas/incompletas previas al contrato transaccional 383.
    -- No deben bloquear la migración global; el reporte v3 seguirá en ready=false.
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.asientos_contables
    WHERE tenant_id = p_tenant_id
      AND (source_event_id = v_planilla.id OR referencia = 'PLANILLA-' || v_planilla.id::text)
  ) THEN
    UPDATE public.planillas
    SET asientos_generados = true, fecha_asientos = COALESCE(fecha_asientos, now())
    WHERE id = v_planilla.id AND tenant_id = p_tenant_id;
    RETURN;
  END IF;

  SELECT id INTO v_cuenta_621 FROM public.plan_cuentas
  WHERE tenant_id=p_tenant_id AND codigo='621' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_627 FROM public.plan_cuentas
  WHERE tenant_id=p_tenant_id AND codigo='627' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_403 FROM public.plan_cuentas
  WHERE tenant_id=p_tenant_id AND codigo='403' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_407 FROM public.plan_cuentas
  WHERE tenant_id=p_tenant_id AND codigo='407' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_411 FROM public.plan_cuentas
  WHERE tenant_id=p_tenant_id AND codigo='411' AND activo=true ORDER BY created_at,id LIMIT 1;

  IF v_cuenta_621 IS NULL OR v_cuenta_627 IS NULL OR v_cuenta_403 IS NULL OR
     v_cuenta_407 IS NULL OR v_cuenta_411 IS NULL THEN
    RAISE EXCEPTION 'Plan PCGE incompleto para asiento de planilla del tenant %', p_tenant_id;
  END IF;

  IF round(COALESCE(v_planilla.total_ingresos,0),2) <> round(COALESCE(v_planilla.total_descuentos,0) + COALESCE(v_planilla.total_neto,0),2) THEN
    RAISE EXCEPTION 'Planilla demo descuadrada para tenant %: ingresos %, descuentos %, neto %',
      p_tenant_id, v_planilla.total_ingresos, v_planilla.total_descuentos, v_planilla.total_neto;
  END IF;

  v_total_debe := round(COALESCE(v_planilla.total_ingresos,0) + COALESCE(v_planilla.total_aportes,0),2);
  v_asiento_id := gen_random_uuid();

  INSERT INTO public.asientos_contables (
    id, tenant_id, fecha, tipo_asiento, concepto, descripcion, origen,
    referencia, total_debe, total_haber, estado, source_event_id, metadata
  ) VALUES (
    v_asiento_id, p_tenant_id, current_date, 'PLANILLA',
    'Planilla de sueldos ' || v_planilla.periodo,
    'Devengo de remuneraciones y aportes de la planilla demo', 'RRHH',
    'PLANILLA-' || v_planilla.id::text, v_total_debe, v_total_debe,
    'CONFIRMADO', v_planilla.id,
    jsonb_build_object('source','demo_business_seed_v3','planilla_id',v_planilla.id)
  );

  INSERT INTO public.detalle_asientos
    (tenant_id, asiento_id, cuenta_id, debe, haber, concepto, fecha, metadata)
  VALUES
    (p_tenant_id,v_asiento_id,v_cuenta_621,COALESCE(v_planilla.total_ingresos,0),0,'Remuneraciones',current_date,'{"source":"demo_business_seed_v3"}'),
    (p_tenant_id,v_asiento_id,v_cuenta_627,COALESCE(v_planilla.total_aportes,0),0,'Aportes patronales',current_date,'{"source":"demo_business_seed_v3"}'),
    (p_tenant_id,v_asiento_id,v_cuenta_403,0,COALESCE(v_planilla.total_descuentos,0),'Retenciones por pagar',current_date,'{"source":"demo_business_seed_v3"}'),
    (p_tenant_id,v_asiento_id,v_cuenta_407,0,COALESCE(v_planilla.total_aportes,0),'Aportes patronales por pagar',current_date,'{"source":"demo_business_seed_v3"}'),
    (p_tenant_id,v_asiento_id,v_cuenta_411,0,COALESCE(v_planilla.total_neto,0),'Remuneraciones por pagar',current_date,'{"source":"demo_business_seed_v3"}');

  UPDATE public.planillas
  SET asientos_generados = true, fecha_asientos = now(), updated_at = now()
  WHERE id = v_planilla.id AND tenant_id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.demo_readiness_report_v3(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
  WITH base AS (
    SELECT app.demo_readiness_report_v2(p_tenant_id) AS report
  ), payroll AS (
    SELECT count(*) AS payroll_asientos
    FROM public.asientos_contables ac
    JOIN public.planillas p
      ON p.tenant_id=ac.tenant_id AND (ac.source_event_id=p.id OR ac.referencia='PLANILLA-' || p.id::text)
    WHERE ac.tenant_id=p_tenant_id AND ac.tipo_asiento='PLANILLA' AND ac.origen='RRHH'
  )
  SELECT base.report || to_jsonb(payroll) || jsonb_build_object(
    'ready', COALESCE((base.report->>'ready')::boolean,false) AND payroll.payroll_asientos >= 1
  ) FROM base,payroll;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_demo_hr_sample_tx(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
BEGIN
  PERFORM app.hydrate_demo_hr_sample_tx(p_tenant_id);
  PERFORM app.ensure_demo_payroll_accrual(p_tenant_id);
  RETURN app.demo_readiness_report_v3(p_tenant_id);
END;
$$;

DO $$
DECLARE demo_tenant record;
BEGIN
  FOR demo_tenant IN
    SELECT DISTINCT tenant_id FROM public.empresa_config
    WHERE is_demo=true AND tenant_id IS NOT NULL
  LOOP
    PERFORM app.ensure_demo_payroll_accrual(demo_tenant.tenant_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION app.ensure_demo_payroll_accrual(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.demo_readiness_report_v3(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) TO service_role;

COMMENT ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) IS
  'Completa RRHH demo y exige un asiento de devengo de planilla balanceado antes de declarar la demo lista.';
