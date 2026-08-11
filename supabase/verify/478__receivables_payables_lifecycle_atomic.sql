\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_478_SOLO_ERP_E2E:%',current_database(); END IF;
END $$;

UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',
 allow_demo_data=true,configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton=true;

DO $verify$
DECLARE
  t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); p uuid; c uuid; xp uuid; xc uuid;
  r jsonb; rr jsonb; failed boolean;
BEGIN
  INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
  VALUES(t,'VERIFY-478-'||left(t::text,8),'Tenant verify 478','Fixture local','PE','test',true,'ACTIVO');
  INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado)
  VALUES(a,t,'Actor','478','actor-'||left(a::text,8)||'@local.invalid','actor478','unused',true,'ACTIVO');
  INSERT INTO public.proveedores(tenant_id,codigo,nombre,razon_social,ruc,estado,activo,condiciones_pago,dias_credito)
  VALUES(t,'PROV-478','Proveedor 478','Proveedor 478','20123456478','ACTIVO',true,'CREDITO',30) RETURNING id INTO p;
  INSERT INTO public.clientes(tenant_id,codigo,nombre,razon_social,documento_tipo,ruc,activo)
  VALUES(t,'CLI-478','Cliente 478','Cliente 478','RUC','20123457478',true) RETURNING id INTO c;
  INSERT INTO public.cuentas_por_pagar(tenant_id,proveedor_id,numero_documento,fecha_emision,fecha_vencimiento,
    moneda,subtotal,igv,total,saldo,saldo_pendiente,estado,condiciones_pago,dias_credito,tipo_cambio_origen)
  VALUES(t,p,'FP-478',current_date,current_date+30,'PEN',100,18,118,118,118,'PENDIENTE','CREDITO',30,1) RETURNING id INTO xp;
  INSERT INTO public.cuentas_por_cobrar(tenant_id,cliente_id,estado,monto_total,monto_original,monto_pendiente,
    saldo,saldo_pendiente,total,fecha_emision,fecha_vencimiento,moneda,numero_documento,tipo_documento,
    idempotency_key,event_source,tipo_cambio_origen,metadata)
  VALUES(t,c,'PENDIENTE',100,100,100,100,100,100,current_date,current_date+30,'PEN','FC-478','FACTURA',
    'verify-478-cxc-seed','verify.478',1,'{"origen":"migracion_apertura"}') RETURNING id INTO xc;

  r:=public.reprogramar_cxc_tx(t,xc,a,current_date+45,'Acuerdo','Cliente solicitó','verify-478-cxc-reprogram');
  rr:=public.reprogramar_cxc_tx(t,xc,a,current_date+45,'Acuerdo','Cliente solicitó','verify-478-cxc-reprogram');
  IF (r->>'idempotent')::boolean OR NOT (rr->>'idempotent')::boolean OR
     (SELECT fecha_vencimiento::date FROM public.cuentas_por_cobrar WHERE id=xc)<>current_date+45 THEN
    RAISE EXCEPTION 'VERIFY_478_CXC_REPROGRAM_FAILED';
  END IF;
  failed:=false;
  BEGIN PERFORM public.reprogramar_cxc_tx(t,xc,a,current_date+46,'Cambio',null,'verify-478-cxc-reprogram');
  EXCEPTION WHEN OTHERS THEN failed:=position('IDEMPOTENCY_CONFLICT' in SQLERRM)>0; END;
  IF NOT failed THEN RAISE EXCEPTION 'VERIFY_478_CXC_CONFLICT_NOT_REJECTED'; END IF;

  r:=public.gestionar_cxp_tx(t,xp,a,'UPDATE_TERMS','{"fecha_vencimiento":"2099-12-31","dias_credito":60,"observaciones":"Acuerdo"}',
    'verify-478-cxp-update');
  IF (SELECT dias_credito FROM public.cuentas_por_pagar WHERE id=xp)<>60 THEN RAISE EXCEPTION 'VERIFY_478_CXP_UPDATE_FAILED'; END IF;
  failed:=false;
  BEGIN PERFORM public.gestionar_cxp_tx(t,xp,a,'UPDATE_TERMS','{"total":1}','verify-478-cxp-forged');
  EXCEPTION WHEN OTHERS THEN failed:=position('FINANCIAL_FIELDS_IMMUTABLE' in SQLERRM)>0; END;
  IF NOT failed THEN RAISE EXCEPTION 'VERIFY_478_FINANCIAL_MUTATION_NOT_REJECTED'; END IF;

  r:=public.gestionar_cxp_tx(t,xp,a,'CANCEL','{"motivo":"Duplicada"}','verify-478-cxp-cancel');
  rr:=public.gestionar_cxp_tx(t,xp,a,'CANCEL','{"motivo":"Duplicada"}','verify-478-cxp-cancel');
  IF (SELECT estado FROM public.cuentas_por_pagar WHERE id=xp)<>'ANULADA'
     OR NOT (rr->>'idempotent')::boolean
     OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='cxp.anulada' AND aggregate_id=xp::text)<>1 THEN
    RAISE EXCEPTION 'VERIFY_478_CXP_CANCEL_FAILED';
  END IF;

  IF has_function_privilege('authenticated','public.gestionar_cxp_tx(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
     OR has_function_privilege('service_role','app.gestionar_cxp_tx_478(uuid,uuid,uuid,text,jsonb,text)','EXECUTE')
     OR has_table_privilege('service_role','public.cuentas_por_pagar','UPDATE')
     OR has_table_privilege('service_role','public.cuentas_por_cobrar','UPDATE') THEN
    RAISE EXCEPTION 'VERIFY_478_ACL_FAILED';
  END IF;
END;
$verify$;

ROLLBACK;
