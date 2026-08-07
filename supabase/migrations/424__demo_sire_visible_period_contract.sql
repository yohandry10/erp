-- The SIRE page filters by YYYY-MM. The demo sample used YYYYMM, so metrics
-- counted it while the visible list appeared empty.

CREATE OR REPLACE FUNCTION app.normalize_demo_sire_visible_period(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,app,pg_temp
AS $$
DECLARE v_periodo text:=to_char(current_date,'YYYY-MM');
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,395));
  IF NOT EXISTS (SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND is_demo=true) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa',p_tenant_id;
  END IF;

  UPDATE public.sire_files
  SET periodo=v_periodo,
      period=v_periodo,
      nombre='RVIE demo '||v_periodo,
      updated_at=now(),
      metadata=COALESCE(metadata,'{}')||'{"visible_period_contract":"YYYY-MM"}'::jsonb
  WHERE tenant_id=p_tenant_id
    AND metadata->>'source'='demo_business_seed_v6'
    AND (periodo<>v_periodo OR period<>v_periodo);
END;
$$;

CREATE OR REPLACE FUNCTION app.demo_readiness_report_v7(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,app,pg_temp AS $$
  WITH base AS (SELECT app.demo_readiness_report_v6(p_tenant_id) report), visible AS (
    SELECT count(*) AS sire_periodo_visible FROM public.sire_files
    WHERE tenant_id=p_tenant_id AND periodo=to_char(current_date,'YYYY-MM')
      AND period=to_char(current_date,'YYYY-MM')
  )
  SELECT base.report||to_jsonb(visible)||jsonb_build_object(
    'ready',COALESCE((base.report->>'ready')::boolean,false) AND sire_periodo_visible>=1
  ) FROM base,visible;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_demo_hr_sample_tx(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,app,pg_temp AS $$
BEGIN
  PERFORM app.hydrate_demo_hr_sample_tx(p_tenant_id);
  PERFORM app.ensure_demo_payroll_accrual(p_tenant_id);
  PERFORM app.ensure_demo_control_samples(p_tenant_id);
  PERFORM app.ensure_demo_operational_accounting(p_tenant_id);
  PERFORM app.ensure_demo_procurement_sire_samples(p_tenant_id);
  PERFORM app.normalize_demo_sire_visible_period(p_tenant_id);
  RETURN app.demo_readiness_report_v7(p_tenant_id);
END;
$$;

DO $$ DECLARE demo_tenant record; BEGIN
  FOR demo_tenant IN SELECT DISTINCT tenant_id FROM public.empresa_config WHERE is_demo=true AND tenant_id IS NOT NULL
  LOOP PERFORM app.normalize_demo_sire_visible_period(demo_tenant.tenant_id); END LOOP;
END $$;

REVOKE ALL ON FUNCTION app.normalize_demo_sire_visible_period(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.demo_readiness_report_v7(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) TO service_role;
