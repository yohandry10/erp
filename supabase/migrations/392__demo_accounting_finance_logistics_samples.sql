-- Complete the demo surfaces that were still empty after the business seed:
-- accounting periods/cost centers/budgets, bank reconciliation, fixed assets
-- and a non-fiscal GRE draft linked to the existing demo CPE.

CREATE OR REPLACE FUNCTION app.ensure_demo_control_samples(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_periodo_id uuid;
  v_cc_admin uuid;
  v_cc_ventas uuid;
  v_cuenta_621 uuid;
  v_cuenta_20 uuid;
  v_banco public.cuentas_bancarias%ROWTYPE;
  v_cpe_id uuid;
  v_cliente_nombre text;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,392));

  IF NOT EXISTS (SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND is_demo=true) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa',p_tenant_id;
  END IF;

  INSERT INTO public.periodos_contables
    (tenant_id,nombre,codigo,anio,mes,estado,metadata)
  SELECT p_tenant_id,'Periodo demo '||to_char(current_date,'YYYY-MM'),
    'PER-DEMO-'||to_char(current_date,'YYYYMM'),
    extract(year from current_date)::int,extract(month from current_date)::int,
    'ABIERTO','{"source":"demo_business_seed_v4"}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.periodos_contables
    WHERE tenant_id=p_tenant_id AND anio=extract(year from current_date)::int
      AND mes=extract(month from current_date)::int
  );

  SELECT id INTO v_periodo_id FROM public.periodos_contables
  WHERE tenant_id=p_tenant_id AND anio=extract(year from current_date)::int
    AND mes=extract(month from current_date)::int
  ORDER BY created_at,id LIMIT 1;

  INSERT INTO public.centros_costo
    (tenant_id,nombre,codigo,descripcion,estado,activo,metadata)
  SELECT p_tenant_id,x.nombre,x.codigo,x.descripcion,'ACTIVO',true,
    '{"source":"demo_business_seed_v4"}'::jsonb
  FROM (VALUES
    ('Administración','CC-ADM','Operaciones administrativas y RRHH'),
    ('Ventas','CC-VTA','Operación comercial y atención al cliente')
  ) x(nombre,codigo,descripcion)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.centros_costo cc
    WHERE cc.tenant_id=p_tenant_id AND cc.codigo=x.codigo
  );

  SELECT id INTO v_cc_admin FROM public.centros_costo
  WHERE tenant_id=p_tenant_id AND codigo='CC-ADM' ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cc_ventas FROM public.centros_costo
  WHERE tenant_id=p_tenant_id AND codigo='CC-VTA' ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_621 FROM public.plan_cuentas
  WHERE tenant_id=p_tenant_id AND codigo='621' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_20 FROM public.plan_cuentas
  WHERE tenant_id=p_tenant_id AND codigo='20' AND activo=true ORDER BY created_at,id LIMIT 1;

  -- The payroll expense belongs to Administration so budget execution can be
  -- traced back to a real journal line instead of a fabricated dashboard value.
  UPDATE public.detalle_asientos da
  SET centro_costo_id=v_cc_admin,updated_at=now()
  FROM public.asientos_contables ac
  WHERE da.asiento_id=ac.id AND ac.tenant_id=p_tenant_id
    AND ac.tipo_asiento='PLANILLA' AND da.cuenta_id IN (v_cuenta_621)
    AND da.centro_costo_id IS NULL AND v_cc_admin IS NOT NULL;

  IF v_periodo_id IS NOT NULL AND v_cc_admin IS NOT NULL AND v_cuenta_621 IS NOT NULL THEN
    INSERT INTO public.presupuestos
      (tenant_id,nombre,codigo,centro_costo_id,cuenta_id,periodo_contable_id,
       monto_presupuestado,monto_ejecutado,monto_comprometido,monto_disponible,
       porcentaje_ejecutado,estado,notas,metadata)
    SELECT p_tenant_id,'Presupuesto RRHH demo','PRES-RRHH-DEMO',v_cc_admin,v_cuenta_621,v_periodo_id,
      15000,5813,0,9187,38.753333,'ACTIVO','Control mensual de remuneraciones demo',
      '{"source":"demo_business_seed_v4"}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.presupuestos WHERE tenant_id=p_tenant_id
        AND centro_costo_id=v_cc_admin AND cuenta_id=v_cuenta_621
        AND periodo_contable_id=v_periodo_id
    );
  END IF;

  IF v_periodo_id IS NOT NULL AND v_cc_ventas IS NOT NULL AND v_cuenta_20 IS NOT NULL THEN
    INSERT INTO public.presupuestos
      (tenant_id,nombre,codigo,centro_costo_id,cuenta_id,periodo_contable_id,
       monto_presupuestado,monto_ejecutado,monto_comprometido,monto_disponible,
       porcentaje_ejecutado,estado,notas,metadata)
    SELECT p_tenant_id,'Presupuesto compras demo','PRES-COMP-DEMO',v_cc_ventas,v_cuenta_20,v_periodo_id,
      5000,100,354,4546,2,'ACTIVO','Compras y abastecimiento demo',
      '{"source":"demo_business_seed_v4"}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.presupuestos WHERE tenant_id=p_tenant_id
        AND centro_costo_id=v_cc_ventas AND cuenta_id=v_cuenta_20
        AND periodo_contable_id=v_periodo_id
    );
  END IF;

  INSERT INTO public.activos_fijos
    (tenant_id,nombre,codigo,descripcion,fecha_adquisicion,valor_adquisicion,
     depreciacion_acumulada,vida_util,centro_costo_id,moneda,estado,activo,metadata)
  SELECT p_tenant_id,'Laptop administrativa demo','AF-DEMO-001',
    'Equipo de cómputo para operaciones administrativas',current_date-interval '6 months',
    3500,350,4,v_cc_admin,'PEN','ACTIVO',true,'{"source":"demo_business_seed_v4"}'::jsonb
  WHERE v_cc_admin IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.activos_fijos WHERE tenant_id=p_tenant_id AND codigo='AF-DEMO-001'
  );

  SELECT * INTO v_banco FROM public.cuentas_bancarias
  WHERE tenant_id=p_tenant_id AND activo=true ORDER BY created_at,id LIMIT 1;

  IF v_banco.id IS NOT NULL THEN
    INSERT INTO public.movimientos_bancarios
      (tenant_id,nombre,codigo,cuenta_bancaria_id,fecha,tipo,monto,descripcion,
       referencia,saldo_anterior,saldo_nuevo,saldo,conciliado,estado,activo,metadata)
    SELECT p_tenant_id,'Saldo inicial demo','MOV-BAN-DEMO-001',v_banco.id,current_date,
      'ABONO',COALESCE(v_banco.saldo_actual,v_banco.saldo,50000),
      'Saldo de apertura para pruebas de tesorería y conciliación','APERTURA-DEMO',
      0,COALESCE(v_banco.saldo_actual,v_banco.saldo,50000),
      COALESCE(v_banco.saldo_actual,v_banco.saldo,50000),false,'ACTIVO',true,
      '{"source":"demo_business_seed_v4"}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.movimientos_bancarios
      WHERE tenant_id=p_tenant_id AND codigo='MOV-BAN-DEMO-001'
    );

    INSERT INTO public.conciliaciones_bancarias
      (tenant_id,nombre,codigo,cuenta_bancaria_id,banco,numero_cuenta,periodo,
       moneda,saldo_banco,saldo_libro,saldo_actual,diferencia,fecha_desde,fecha_hasta,
       estado,observaciones,metadata)
    SELECT p_tenant_id,'Conciliación demo '||to_char(current_date,'YYYY-MM'),
      'CONC-DEMO-'||to_char(current_date,'YYYYMM'),v_banco.id,v_banco.banco,
      v_banco.numero_cuenta,to_char(current_date,'YYYY-MM'),COALESCE(v_banco.moneda,'PEN'),
      COALESCE(v_banco.saldo_actual,v_banco.saldo,50000),
      COALESCE(v_banco.saldo_actual,v_banco.saldo,50000),
      COALESCE(v_banco.saldo_actual,v_banco.saldo,50000),0,
      date_trunc('month',current_date)::date,
      (date_trunc('month',current_date)+interval '1 month - 1 day')::date,
      'ABIERTA','Conciliación bancaria de ejemplo preparada para practicar el cierre',
      '{"source":"demo_business_seed_v4"}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.conciliaciones_bancarias
      WHERE tenant_id=p_tenant_id AND codigo='CONC-DEMO-'||to_char(current_date,'YYYYMM')
    );
  END IF;

  SELECT cpe.id,COALESCE(c.razon_social,c.nombre,'Cliente demo')
  INTO v_cpe_id,v_cliente_nombre
  FROM public.cpe cpe
  LEFT JOIN public.clientes c ON c.id=cpe.cliente_id AND c.tenant_id=cpe.tenant_id
  WHERE cpe.tenant_id=p_tenant_id ORDER BY cpe.created_at,cpe.id LIMIT 1;

  IF v_cpe_id IS NOT NULL THEN
    INSERT INTO public.gre_guias
      (tenant_id,nombre,codigo,numero,serie,correlativo,estado,destinatario,
       direccion_destino,fecha_emision,fecha_traslado,modalidad,motivo,peso_total,
       observaciones,cpe_relacionado,idempotency_key,sunat_status,metadata)
    SELECT p_tenant_id,'GRE demo T001-00000001','GRE-DEMO-001','T001-00000001','T001',1,
      'BORRADOR',v_cliente_nombre,'Av. Cliente Demo 456, Lima',current_date,current_date+1,
      'TRANSPORTE_PRIVADO','VENTA',12.5,'Guía de prueba; no enviada a SUNAT',v_cpe_id,
      'demo-gre-'||p_tenant_id,'NOT_SENT','{"source":"demo_business_seed_v4"}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.gre_guias WHERE tenant_id=p_tenant_id AND codigo='GRE-DEMO-001'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.demo_readiness_report_v4(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,app,pg_temp AS $$
  WITH base AS (SELECT app.demo_readiness_report_v3(p_tenant_id) report), counts AS (
    SELECT
      (SELECT count(*) FROM public.periodos_contables WHERE tenant_id=p_tenant_id) periodos,
      (SELECT count(*) FROM public.centros_costo WHERE tenant_id=p_tenant_id AND activo=true) centros_costo,
      (SELECT count(*) FROM public.presupuestos WHERE tenant_id=p_tenant_id) presupuestos,
      (SELECT count(*) FROM public.movimientos_bancarios WHERE tenant_id=p_tenant_id) movimientos_bancarios,
      (SELECT count(*) FROM public.conciliaciones_bancarias WHERE tenant_id=p_tenant_id) conciliaciones,
      (SELECT count(*) FROM public.activos_fijos WHERE tenant_id=p_tenant_id AND activo=true) activos_fijos,
      (SELECT count(*) FROM public.gre_guias WHERE tenant_id=p_tenant_id) gre_guias
  )
  SELECT base.report||to_jsonb(counts)||jsonb_build_object(
    'ready',COALESCE((base.report->>'ready')::boolean,false)
      AND periodos>=1 AND centros_costo>=2 AND presupuestos>=2
      AND movimientos_bancarios>=1 AND conciliaciones>=1 AND activos_fijos>=1 AND gre_guias>=1
  ) FROM base,counts;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_demo_hr_sample_tx(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,app,pg_temp AS $$
BEGIN
  PERFORM app.hydrate_demo_hr_sample_tx(p_tenant_id);
  PERFORM app.ensure_demo_payroll_accrual(p_tenant_id);
  PERFORM app.ensure_demo_control_samples(p_tenant_id);
  RETURN app.demo_readiness_report_v4(p_tenant_id);
END;
$$;

DO $$ DECLARE demo_tenant record; BEGIN
  FOR demo_tenant IN SELECT DISTINCT tenant_id FROM public.empresa_config
    WHERE is_demo=true AND tenant_id IS NOT NULL
  LOOP
    PERFORM app.ensure_demo_control_samples(demo_tenant.tenant_id);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION app.ensure_demo_control_samples(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.demo_readiness_report_v4(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) TO service_role;
