\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.reject614(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN EXECUTE stmt;
    IF EXISTS(SELECT 1 FROM pg_constraint WHERE conname='zzz_assert_supplier_invoice_receipt_closed_614') THEN
      SET CONSTRAINTS zzz_assert_supplier_invoice_receipt_closed_614 IMMEDIATE;
      SET CONSTRAINTS zzz_assert_supplier_invoice_receipt_closed_614 DEFERRED;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE expected||'%' THEN RETURN; END IF;
    RAISE EXCEPTION 'VERIFY614_UNEXPECTED_ERROR % expected %',SQLERRM,expected;
  END;
  RAISE EXCEPTION 'VERIFY614_EXPECTED_REJECTION %',expected;
END $fn$;
DO $verify$
DECLARE j jsonb;t uuid;a uuid;o uuid;d uuid;p uuid;w uuid;s uuid;r1 uuid;r2 uuid;r3 uuid;ri uuid;s2 uuid;ot uuid;foreign_receipt uuid;
  body jsonb; invoice jsonb; replay jsonb; snapshot text; day date; q text;
BEGIN
  IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
    WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
    RAISE EXCEPTION 'VERIFY614_LOCAL_ONLY';
  END IF;
  j:=public.create_demo_tenant_ready_tx('VERIFY614',14,'PE','verify614-'||gen_random_uuid()::text);
  t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;day:=app.hoy_tenant(t);
  j:=public.create_demo_tenant_ready_tx('VERIFY614OTHER',14,'PE','verify614other-'||gen_random_uuid()::text);
  ot:=(j->>'tenant_id')::uuid;
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  SELECT id INTO foreign_receipt FROM public.recepciones WHERE tenant_id=ot LIMIT 1;
  IF foreign_receipt IS NULL THEN RAISE EXCEPTION 'VERIFY614_FOREIGN_RECEIPT_REQUIRED'; END IF;
  SELECT oc.id,det.id,det.producto_id,oc.proveedor_id INTO o,d,p,s
    FROM public.ordenes_compra oc JOIN public.orden_compra_detalles det ON det.orden_id=oc.id AND det.tenant_id=oc.tenant_id
    WHERE oc.tenant_id=t AND upper(oc.estado::text) IN('APROBADA','PARCIAL')
      AND det.cantidad-coalesce(det.cantidad_recibida,0)>=1 ORDER BY oc.id,det.id LIMIT 1;
  IF o IS NULL THEN RAISE EXCEPTION 'VERIFY614_FACTORY_ORDER_REQUIRED'; END IF;
  SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC,id LIMIT 1;
  j:=public.crear_recepcion_tx(t,o,jsonb_build_array(jsonb_build_object('detalle_id',d,'producto_id',p,'cantidad_recibida',1,
    'almacen_id',w,'calidad','OK')),NULL,a,'verify614-close');r1:=(j->>'id')::uuid;
  j:=public.crear_recepcion_tx(t,o,jsonb_build_array(jsonb_build_object('detalle_id',d,'producto_id',p,'cantidad_recibida',1,
    'almacen_id',w,'calidad','OK')),NULL,a,'verify614-draft');r2:=(j->>'id')::uuid;
  j:=public.crear_recepcion_tx(t,o,jsonb_build_array(jsonb_build_object('detalle_id',d,'producto_id',p,'cantidad_recibida',1,
    'almacen_id',w,'calidad','OK')),NULL,a,'verify614-cancel');r3:=(j->>'id')::uuid;
  UPDATE public.recepciones SET estado='ANULADA' WHERE tenant_id=t AND id=r3;
  PERFORM public.cerrar_recepcion_tx(r1,t,a::text,NULL);
  body:=jsonb_build_object('proveedor_id',s,'orden_id',o,'recepcion_id',r2,'created_by',a,'numero_documento','F614-DRAFT',
    'fecha_emision',day,'fecha_vencimiento',day,'condiciones_pago','CONTADO','tipo_documento','FACTURA',
    'moneda','PEN','subtotal',1,'igv',0.18,'total',1.18,'saldo',1.18,'estado','PENDIENTE','estado_comparacion','OK');
  SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'')) INTO snapshot FROM public.cuentas_por_pagar x WHERE tenant_id=t;
  PERFORM pg_temp.reject614(format('SELECT public.crear_factura_proveedor_tx(%L,%L,%L,%L)',t,body,gen_random_uuid(),'verify614-invoice-draft'),
    'SUPPLIER_INVOICE_RECEIPT_NOT_CLOSED');
  body:=body||jsonb_build_object('recepcion_id',r3,'numero_documento','F614-CANCEL');
  PERFORM pg_temp.reject614(format('SELECT public.crear_factura_proveedor_tx(%L,%L,%L,%L)',t,body,gen_random_uuid(),'verify614-invoice-cancel'),
    'SUPPLIER_INVOICE_RECEIPT_NOT_CLOSED');
  body:=body||jsonb_build_object('recepcion_id',NULL,'referencia_tipo','RECEPCION','referencia_id',r2,'numero_documento','F614-LEGACY');
  PERFORM pg_temp.reject614(format('SELECT public.crear_factura_proveedor_tx(%L,%L,%L,%L)',t,body,gen_random_uuid(),'verify614-invoice-legacy'),
    'SUPPLIER_INVOICE_RECEIPT_NOT_CLOSED');
  body:=body||jsonb_build_object('referencia_id',NULL,'numero_documento','F614-MISSING');
  PERFORM pg_temp.reject614(format('SELECT public.crear_factura_proveedor_tx(%L,%L,%L,%L)',t,body,gen_random_uuid(),'verify614-invoice-missing'),
    'SUPPLIER_INVOICE_RECEIPT_NOT_FOUND');
  body:=body||jsonb_build_object('referencia_id',foreign_receipt,'numero_documento','F614-FOREIGN');
  PERFORM pg_temp.reject614(format('SELECT public.crear_factura_proveedor_tx(%L,%L,%L,%L)',t,body,gen_random_uuid(),'verify614-invoice-foreign'),
    'tenant_id no coincide con la recepción de la CxP');
  body:=body||jsonb_build_object('recepcion_id',r1,'referencia_id',r2,'numero_documento','F614-MISMATCH');
  PERFORM pg_temp.reject614(format('SELECT public.crear_factura_proveedor_tx(%L,%L,%L,%L)',t,body,gen_random_uuid(),'verify614-invoice-conflict'),
    'SUPPLIER_INVOICE_RECEIPT_REFERENCE_MISMATCH');
  body:=(body-'referencia_tipo'-'referencia_id')||jsonb_build_object('recepcion_id',r1,'numero_documento','F614-SUPPLIER');
  SELECT id INTO s2 FROM public.proveedores WHERE tenant_id=t AND id<>s AND activo LIMIT 1;
  IF s2 IS NULL THEN RAISE EXCEPTION 'VERIFY614_SECOND_SUPPLIER_REQUIRED'; END IF;
  PERFORM pg_temp.reject614(format('SELECT public.crear_factura_proveedor_tx(%L,%L,%L,%L)',t,
    body||jsonb_build_object('orden_id',NULL,'proveedor_id',s2),gen_random_uuid(),'verify614-invoice-supplier'),
    'SUPPLIER_INVOICE_RECEIPT_ORDER_MISMATCH');
  IF snapshot IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'')) FROM public.cuentas_por_pagar x WHERE tenant_id=t)
    THEN RAISE EXCEPTION 'VERIFY614_REJECTED_INVOICE_CHANGED_STATE'; END IF;
  body:=body||jsonb_build_object('recepcion_id',r1,'numero_documento','F614-CLOSED');
  invoice:=public.crear_factura_proveedor_tx(t,body,gen_random_uuid(),'verify614-invoice-closed');
  replay:=public.crear_factura_proveedor_tx(t,body,gen_random_uuid(),'verify614-invoice-closed');
  IF invoice->>'id' IS DISTINCT FROM replay->>'id' OR replay->>'idempotent'<>'true' THEN RAISE EXCEPTION 'VERIFY614_REPLAY_CHANGED'; END IF;
  PERFORM pg_temp.reject614(format('UPDATE public.cuentas_por_pagar SET recepcion_id=%L,referencia_id=%L WHERE tenant_id=%L AND id=%L',r3,r3,t,invoice->>'id'),
    'SUPPLIER_INVOICE_RECEIPT_NOT_CLOSED');
  -- Un update ajeno al vínculo conserva el comportamiento de la deuda existente.
  UPDATE public.cuentas_por_pagar SET observaciones='Verificación de vínculo preservado' WHERE tenant_id=t AND id=(invoice->>'id')::uuid;
  SELECT id INTO ri FROM public.recepcion_items WHERE tenant_id=t AND recepcion_id=r1 LIMIT 1;
  PERFORM pg_temp.reject614(format('UPDATE public.recepcion_items SET cantidad_recibida=2 WHERE tenant_id=%L AND id=%L',t,ri),
    'Los items de una recepción sólo pueden cambiar mientras está BORRADOR');
  PERFORM pg_temp.reject614(format('UPDATE public.recepcion_items SET recepcion_id=%L WHERE tenant_id=%L AND id=%L',r2,t,ri),
    'Un item de recepción no puede cambiar de recepción ni tenant');
  PERFORM pg_temp.reject614(format('INSERT INTO public.recepcion_items(tenant_id,recepcion_id,detalle_id,producto_id,cantidad_recibida,almacen_id,calidad) VALUES(%L,%L,%L,%L,1,%L,''OK'')',t,r1,d,p,w),
    'Los items de una recepción sólo pueden cambiar mientras está BORRADOR');
  SELECT id INTO ri FROM public.recepcion_items WHERE tenant_id=t AND recepcion_id=r2 LIMIT 1;
  UPDATE public.recepcion_items SET lote='BORRADOR-EDITABLE' WHERE tenant_id=t AND id=ri;
  IF NOT EXISTS(SELECT 1 FROM public.recepcion_items WHERE tenant_id=t AND id=ri AND lote='BORRADOR-EDITABLE') THEN
    RAISE EXCEPTION 'VERIFY614_DRAFT_EDIT_BLOCKED'; END IF;
  IF has_function_privilege('service_role','app.guard_supplier_invoice_receipt_614()','EXECUTE')
     OR has_function_privilege('authenticated','app.assert_supplier_invoice_receipt_closed_614()','EXECUTE')
     OR has_function_privilege('anon','app.validate_supplier_invoice_receipt_614(public.cuentas_por_pagar,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY614_PRIVATE_HELPERS'; END IF;
END $verify$;
SELECT 'VERIFY614_RECEIPT_INVOICE_GUARDS_OK';
ROLLBACK;
