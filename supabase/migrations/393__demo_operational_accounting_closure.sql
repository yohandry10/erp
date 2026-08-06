-- Make every seeded commercial operation visible in accounting using the same
-- structure as the runtime generators: revenue/base + IGV + cost of sales for
-- sales, and inventory + IGV credit for purchases.

CREATE OR REPLACE FUNCTION app.ensure_demo_operational_accounting(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,app,pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_pos public.ventas_pos%ROWTYPE;
  v_cpe public.cpe%ROWTYPE;
  v_recepcion public.recepciones%ROWTYPE;
  v_asiento_pos uuid;
  v_asiento_venta uuid;
  v_asiento_compra uuid;
  v_cuenta_10 uuid;
  v_cuenta_12 uuid;
  v_cuenta_20 uuid;
  v_cuenta_40 uuid;
  v_cuenta_42 uuid;
  v_cuenta_69 uuid;
  v_cuenta_70 uuid;
  v_costo_pos numeric(14,2);
  v_costo_cpe numeric(14,2);
  v_costo_compra numeric(14,2);
  v_numero integer;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,393));

  IF NOT EXISTS (SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND is_demo=true) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa',p_tenant_id;
  END IF;

  SELECT id INTO v_user_id FROM public.users
  WHERE tenant_id=p_tenant_id ORDER BY created_at,id LIMIT 1;
  SELECT * INTO v_pos FROM public.ventas_pos
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1'
  ORDER BY created_at,id LIMIT 1;
  SELECT * INTO v_cpe FROM public.cpe
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1'
  ORDER BY created_at,id LIMIT 1;
  SELECT * INTO v_recepcion FROM public.recepciones
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1'
  ORDER BY created_at,id LIMIT 1;

  -- Old demos without the transactional business sample are deliberately left
  -- unmodified; readiness v5 remains false for them.
  IF v_pos.id IS NULL OR v_cpe.id IS NULL OR v_recepcion.id IS NULL THEN RETURN; END IF;

  -- The old demo seed omitted account 69 even though the runtime sale
  -- generator requires it whenever inventory has a cost of sale.
  INSERT INTO public.plan_cuentas
    (tenant_id,codigo,nombre,tipo,tipo_cuenta,nivel,acepta_movimiento,activo,estado,metadata)
  SELECT p_tenant_id,'69','Costo de ventas','GASTO','GASTO',2,true,true,'ACTIVO',
    '{"source":"demo_business_seed_v5"}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='69' AND activo=true
  );

  SELECT id INTO v_cuenta_10 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='10' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_12 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='12' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_20 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='20' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_40 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='40' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_42 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='42' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_69 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='69' AND activo=true ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_cuenta_70 FROM public.plan_cuentas WHERE tenant_id=p_tenant_id AND codigo='70' AND activo=true ORDER BY created_at,id LIMIT 1;

  IF v_cuenta_10 IS NULL OR v_cuenta_12 IS NULL OR v_cuenta_20 IS NULL OR
     v_cuenta_40 IS NULL OR v_cuenta_42 IS NULL OR v_cuenta_69 IS NULL OR v_cuenta_70 IS NULL THEN
    -- Legacy demos predating the complete PCGE seed must not block a global
    -- migration. Newly hydrated demos do have this contract and readiness v5
    -- will reject them if any required account is absent.
    RETURN;
  END IF;

  SELECT round(COALESCE(sum(COALESCE(NULLIF(metadata->>'valor_total','')::numeric,
    cantidad*COALESCE(NULLIF(metadata->>'costo_unitario','')::numeric,0))),0),2)
  INTO v_costo_pos FROM public.movimientos_inventario
  WHERE tenant_id=p_tenant_id AND referencia_tipo='VENTA_POS' AND referencia_id=v_pos.id AND tipo='SALIDA';

  SELECT round(COALESCE(sum(COALESCE(NULLIF(metadata->>'valor_total','')::numeric,
    cantidad*COALESCE(NULLIF(metadata->>'costo_unitario','')::numeric,0))),0),2)
  INTO v_costo_cpe FROM public.movimientos_inventario
  WHERE tenant_id=p_tenant_id AND referencia_tipo='CPE' AND referencia_id=v_cpe.id AND tipo='SALIDA';

  SELECT round(COALESCE(sum(COALESCE(NULLIF(metadata->>'valor_total','')::numeric,
    cantidad*COALESCE(NULLIF(metadata->>'costo_unitario','')::numeric,0))),0),2)
  INTO v_costo_compra FROM public.movimientos_inventario
  WHERE tenant_id=p_tenant_id AND referencia_tipo='RECEPCION_COMPRA' AND referencia_id=v_recepcion.id AND tipo='ENTRADA';

  IF v_costo_pos <= 0 OR v_costo_cpe <= 0 OR v_costo_compra <= 0 THEN
    RAISE EXCEPTION 'Valorización incompleta (POS %, CPE %, compra %) para tenant %',v_costo_pos,v_costo_cpe,v_costo_compra,p_tenant_id;
  END IF;

  SELECT id INTO v_asiento_venta FROM public.asientos_contables
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1' AND tipo_asiento='VENTA'
  ORDER BY created_at,id LIMIT 1;
  SELECT id INTO v_asiento_compra FROM public.asientos_contables
  WHERE tenant_id=p_tenant_id AND metadata->>'source'='demo_business_seed_v1' AND tipo_asiento='COMPRA'
  ORDER BY created_at,id LIMIT 1;

  IF v_asiento_venta IS NULL OR v_asiento_compra IS NULL THEN
    RAISE EXCEPTION 'Asientos base de venta/compra demo ausentes para tenant %',p_tenant_id;
  END IF;

  DELETE FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id IN (v_asiento_venta,v_asiento_compra);

  INSERT INTO public.detalle_asientos (tenant_id,asiento_id,cuenta_id,debe,haber,concepto,fecha,metadata) VALUES
    (p_tenant_id,v_asiento_venta,v_cuenta_12,v_cpe.total,0,'Clientes - Venta a crédito',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_69,v_costo_cpe,0,'Costo de ventas',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_70,0,v_cpe.total_gravadas,'Ventas',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_40,0,v_cpe.total_igv,'IGV por pagar',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_venta,v_cuenta_20,0,v_costo_cpe,'Mercaderías',v_cpe.fecha_emision,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_compra,v_cuenta_20,v_costo_compra,0,'Mercaderías',v_recepcion.fecha_recepcion,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_compra,v_cuenta_40,118-v_costo_compra,0,'IGV crédito fiscal',v_recepcion.fecha_recepcion,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_compra,v_cuenta_42,0,118,'Proveedores',v_recepcion.fecha_recepcion,'{"source":"demo_business_seed_v5"}');

  UPDATE public.asientos_contables SET
    referencia=v_cpe.serie||'-'||lpad(v_cpe.numero::text,8,'0'),
    total_debe=round(v_cpe.total+v_costo_cpe,2),total_haber=round(v_cpe.total+v_costo_cpe,2),
    source_event_id=COALESCE(source_event_id,v_cpe.id),updated_at=now(),
    metadata=COALESCE(metadata,'{}')||'{"accounting_contract":"runtime-sale-v1"}'::jsonb
  WHERE id=v_asiento_venta AND tenant_id=p_tenant_id;

  UPDATE public.asientos_contables SET
    referencia=v_recepcion.id::text,total_debe=118,total_haber=118,
    source_event_id=COALESCE(source_event_id,v_recepcion.id),updated_at=now(),
    metadata=COALESCE(metadata,'{}')||'{"accounting_contract":"runtime-purchase-v1"}'::jsonb
  WHERE id=v_asiento_compra AND tenant_id=p_tenant_id;

  SELECT id INTO v_asiento_pos FROM public.asientos_contables
  WHERE tenant_id=p_tenant_id AND (source_event_id=v_pos.id OR referencia=v_pos.numero_ticket)
  ORDER BY created_at,id LIMIT 1;

  IF v_asiento_pos IS NULL THEN
    SELECT COALESCE(max(numero_asiento),0)+1 INTO v_numero FROM public.asientos_contables WHERE tenant_id=p_tenant_id;
    v_asiento_pos:=gen_random_uuid();
    INSERT INTO public.asientos_contables
      (id,tenant_id,numero_asiento,fecha,tipo_asiento,concepto,descripcion,origen,referencia,
       total_debe,total_haber,estado,usuario_id,source_event_id,metadata)
    VALUES (v_asiento_pos,p_tenant_id,v_numero,v_pos.fecha,'VENTA','Venta POS '||v_pos.numero_ticket,
      'Venta al contado con costo de mercadería','POS',v_pos.numero_ticket,
      round(v_pos.total+v_costo_pos,2),round(v_pos.total+v_costo_pos,2),'CONFIRMADO',
      COALESCE(v_pos.usuario_id,v_user_id),v_pos.id,
      '{"source":"demo_business_seed_v5","accounting_contract":"runtime-sale-v1"}'::jsonb);
  ELSE
    DELETE FROM public.detalle_asientos WHERE tenant_id=p_tenant_id AND asiento_id=v_asiento_pos;
    UPDATE public.asientos_contables SET total_debe=round(v_pos.total+v_costo_pos,2),
      total_haber=round(v_pos.total+v_costo_pos,2),updated_at=now() WHERE id=v_asiento_pos;
  END IF;

  INSERT INTO public.detalle_asientos (tenant_id,asiento_id,cuenta_id,debe,haber,concepto,fecha,metadata) VALUES
    (p_tenant_id,v_asiento_pos,v_cuenta_10,v_pos.total,0,'Caja - Cobro contado',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_69,v_costo_pos,0,'Costo de ventas',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_70,0,v_pos.subtotal,'Ventas',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_40,0,v_pos.impuestos,'IGV por pagar',v_pos.fecha,'{"source":"demo_business_seed_v5"}'),
    (p_tenant_id,v_asiento_pos,v_cuenta_20,0,v_costo_pos,'Mercaderías',v_pos.fecha,'{"source":"demo_business_seed_v5"}');

  IF EXISTS (
    SELECT 1 FROM public.asientos_contables a
    WHERE a.tenant_id=p_tenant_id AND a.id IN (v_asiento_pos,v_asiento_venta,v_asiento_compra)
      AND abs(COALESCE(a.total_debe,0)-COALESCE(a.total_haber,0))>=0.01
  ) THEN RAISE EXCEPTION 'Cierre contable demo desbalanceado para tenant %',p_tenant_id; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.demo_readiness_report_v5(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,app,pg_temp AS $$
  WITH base AS (SELECT app.demo_readiness_report_v4(p_tenant_id) report), checks AS (
    SELECT
      count(*) FILTER (WHERE a.origen='POS') AS pos_asientos,
      count(*) FILTER (WHERE a.metadata->>'accounting_contract'='runtime-sale-v1') AS venta_asientos_runtime,
      count(*) FILTER (WHERE a.metadata->>'accounting_contract'='runtime-purchase-v1') AS compra_asientos_runtime,
      count(*) FILTER (WHERE abs(COALESCE(a.total_debe,0)-COALESCE(a.total_haber,0))>=0.01) AS desbalanceados
    FROM public.asientos_contables a WHERE a.tenant_id=p_tenant_id
  )
  SELECT base.report||to_jsonb(checks)||jsonb_build_object(
    'ready',COALESCE((base.report->>'ready')::boolean,false) AND pos_asientos>=1
      AND venta_asientos_runtime>=2 AND compra_asientos_runtime>=1 AND desbalanceados=0
  ) FROM base,checks;
$$;

CREATE OR REPLACE FUNCTION public.hydrate_demo_hr_sample_tx(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,app,pg_temp AS $$
BEGIN
  PERFORM app.hydrate_demo_hr_sample_tx(p_tenant_id);
  PERFORM app.ensure_demo_payroll_accrual(p_tenant_id);
  PERFORM app.ensure_demo_control_samples(p_tenant_id);
  PERFORM app.ensure_demo_operational_accounting(p_tenant_id);
  RETURN app.demo_readiness_report_v5(p_tenant_id);
END;
$$;

DO $$ DECLARE demo_tenant record; BEGIN
  FOR demo_tenant IN SELECT DISTINCT tenant_id FROM public.empresa_config WHERE is_demo=true AND tenant_id IS NOT NULL
  LOOP PERFORM app.ensure_demo_operational_accounting(demo_tenant.tenant_id); END LOOP;
END $$;

REVOKE ALL ON FUNCTION app.ensure_demo_operational_accounting(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.demo_readiness_report_v5(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) TO service_role;
