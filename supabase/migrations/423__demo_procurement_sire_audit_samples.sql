-- Fill the remaining operational demo lists with safe samples. The supplier
-- return stays PENDIENTE, so it demonstrates the workflow without moving stock
-- or reversing accounting; the SIRE file is explicitly simulated.

CREATE OR REPLACE FUNCTION app.ensure_demo_procurement_sire_samples(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,app,pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_proveedor_id uuid;
  v_producto_id uuid;
  v_orden_id uuid;
  v_recepcion_id uuid;
  v_recepcion_item_id uuid;
  v_almacen_id uuid;
  v_cotizacion_id uuid;
  v_devolucion_id uuid;
  v_periodo text:=to_char(current_date,'YYYYMM');
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,394));
  IF NOT EXISTS (SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND is_demo=true) THEN
    RAISE EXCEPTION 'El tenant % no es una demo activa',p_tenant_id;
  END IF;

  SELECT id INTO v_user_id FROM public.users WHERE tenant_id=p_tenant_id ORDER BY created_at,id LIMIT 1;
  SELECT r.id,r.orden_id,oc.proveedor_id INTO v_recepcion_id,v_orden_id,v_proveedor_id
  FROM public.recepciones r JOIN public.ordenes_compra oc ON oc.id=r.orden_id AND oc.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id AND r.metadata->>'source'='demo_business_seed_v1'
  ORDER BY r.created_at,r.id LIMIT 1;
  SELECT ri.id,ri.producto_id,ri.almacen_id INTO v_recepcion_item_id,v_producto_id,v_almacen_id
  FROM public.recepcion_items ri
  WHERE ri.tenant_id=p_tenant_id AND ri.recepcion_id=v_recepcion_id
  ORDER BY ri.created_at,ri.id LIMIT 1;

  IF v_user_id IS NULL OR v_proveedor_id IS NULL OR v_producto_id IS NULL OR
     v_orden_id IS NULL OR v_recepcion_id IS NULL OR v_recepcion_item_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_cotizacion_id FROM public.cotizaciones_compra
  WHERE tenant_id=p_tenant_id AND codigo='COT-COMP-DEMO-001' ORDER BY created_at,id LIMIT 1;
  IF v_cotizacion_id IS NULL THEN
    v_cotizacion_id:=gen_random_uuid();
    INSERT INTO public.cotizaciones_compra
      (id,tenant_id,nombre,codigo,numero,proveedor_id,created_by,fecha_cotizacion,
       fecha_vencimiento,validez_dias,estado,subtotal,igv,total,observaciones,metadata)
    VALUES (v_cotizacion_id,p_tenant_id,'Cotización de compra demo','COT-COMP-DEMO-001',
      'CC-DEMO-001',v_proveedor_id,v_user_id,current_date-1,current_date+14,15,'ENVIADA',
      80,14.40,94.40,'Oferta de abastecimiento preparada para comparar y aprobar',
      '{"source":"demo_business_seed_v6"}'::jsonb);
    INSERT INTO public.cotizacion_compra_detalles
      (tenant_id,cotizacion_id,numero,producto_id,descripcion,cantidad,precio_unitario,subtotal,metadata)
    VALUES (p_tenant_id,v_cotizacion_id,1,v_producto_id,'Detergente líquido 1L',8,10,80,
      '{"source":"demo_business_seed_v6"}'::jsonb);
  END IF;

  SELECT id INTO v_devolucion_id FROM public.devoluciones_proveedor
  WHERE tenant_id=p_tenant_id AND codigo='DEV-DEMO-001' ORDER BY created_at,id LIMIT 1;
  IF v_devolucion_id IS NULL THEN
    v_devolucion_id:=gen_random_uuid();
    INSERT INTO public.devoluciones_proveedor
      (id,tenant_id,nombre,codigo,numero,orden_id,proveedor_id,recepcion_id,created_by,
       fecha_devolucion,estado,motivo,subtotal,igv,total,moneda,observaciones,metadata)
    VALUES (v_devolucion_id,p_tenant_id,'Devolución a proveedor demo','DEV-DEMO-001',
      'DEV-DEMO-001',v_orden_id,v_proveedor_id,v_recepcion_id,v_user_id,current_date,
      'PENDIENTE','EMPAQUE_DANADO',10,1.80,11.80,'PEN',
      'Borrador de devolución: aún no mueve stock ni genera nota de crédito',
      '{"source":"demo_business_seed_v6","simulated":true}'::jsonb);
    INSERT INTO public.devolucion_items
      (tenant_id,devolucion_id,recepcion_item_id,producto_id,descripcion,cantidad,
       precio_unitario,subtotal,almacen_id,motivo_detalle,metadata)
    VALUES (p_tenant_id,v_devolucion_id,v_recepcion_item_id,v_producto_id,
      'Detergente líquido 1L',1,10,10,v_almacen_id,'Empaque exterior dañado',
      '{"source":"demo_business_seed_v6"}'::jsonb);
  END IF;

  INSERT INTO public.sire_files
    (tenant_id,nombre,codigo,periodo,period,tipo,filename,file_path,file_size,total_registros,
     estado,status,completed_at,servicio,operacion,request_summary,response_summary,metadata)
  SELECT p_tenant_id,'RVIE demo '||v_periodo,'SIRE-RVIE-DEMO-'||v_periodo,v_periodo,v_periodo,
    'RVIE','SIRE_RVIE_DEMO_'||v_periodo||'.txt','/sire/demo/'||v_periodo||'/rvie.txt',256,1,
    'GENERADO','COMPLETED',now(),'SIRE','GENERAR_RVIE',
    jsonb_build_object('periodo',v_periodo,'simulated',true),
    jsonb_build_object('registros',1,'estado','generado'),
    '{"source":"demo_business_seed_v6","simulated":true,"sunat_sent":false}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.sire_files WHERE tenant_id=p_tenant_id AND codigo='SIRE-RVIE-DEMO-'||v_periodo
  );

  INSERT INTO public.audit_log
    (tenant_id,user_id,table_name,operation,record_id,email,new_values,changed_fields,metadata)
  SELECT p_tenant_id,v_user_id,x.table_name,'INSERT',x.record_id,u.email,x.payload,
    jsonb_build_array('estado','total'),jsonb_build_object('source','demo_business_seed_v6','simulated',true)
  FROM (VALUES
    ('cotizaciones_compra',v_cotizacion_id::text,jsonb_build_object('numero','CC-DEMO-001','estado','ENVIADA','total',94.40)),
    ('devoluciones_proveedor',v_devolucion_id::text,jsonb_build_object('numero','DEV-DEMO-001','estado','PENDIENTE','total',11.80))
  ) x(table_name,record_id,payload)
  LEFT JOIN public.users u ON u.id=v_user_id AND u.tenant_id=p_tenant_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_log a WHERE a.tenant_id=p_tenant_id
      AND a.table_name=x.table_name AND a.record_id=x.record_id
      AND a.metadata->>'source'='demo_business_seed_v6'
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.demo_readiness_report_v6(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,app,pg_temp AS $$
  WITH base AS (SELECT app.demo_readiness_report_v5(p_tenant_id) report), counts AS (
    SELECT
      (SELECT count(*) FROM public.cotizaciones_compra WHERE tenant_id=p_tenant_id) cotizaciones_compra,
      (SELECT count(*) FROM public.cotizacion_compra_detalles WHERE tenant_id=p_tenant_id) detalles_cotizacion_compra,
      (SELECT count(*) FROM public.devoluciones_proveedor WHERE tenant_id=p_tenant_id) devoluciones_proveedor,
      (SELECT count(*) FROM public.devolucion_items WHERE tenant_id=p_tenant_id) devolucion_items,
      (SELECT count(*) FROM public.sire_files WHERE tenant_id=p_tenant_id) sire_files,
      (SELECT count(*) FROM public.audit_log WHERE tenant_id=p_tenant_id) audit_logs
  )
  SELECT base.report||to_jsonb(counts)||jsonb_build_object(
    'ready',COALESCE((base.report->>'ready')::boolean,false)
      AND cotizaciones_compra>=1 AND detalles_cotizacion_compra>=1
      AND devoluciones_proveedor>=1 AND devolucion_items>=1 AND sire_files>=1 AND audit_logs>=2
  ) FROM base,counts;
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
  RETURN app.demo_readiness_report_v6(p_tenant_id);
END;
$$;

DO $$ DECLARE demo_tenant record; BEGIN
  FOR demo_tenant IN SELECT DISTINCT tenant_id FROM public.empresa_config WHERE is_demo=true AND tenant_id IS NOT NULL
  LOOP PERFORM app.ensure_demo_procurement_sire_samples(demo_tenant.tenant_id); END LOOP;
END $$;

REVOKE ALL ON FUNCTION app.ensure_demo_procurement_sire_samples(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.demo_readiness_report_v6(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hydrate_demo_hr_sample_tx(uuid) TO service_role;
