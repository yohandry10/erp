\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE t uuid:=gen_random_uuid();p uuid;c uuid;xp uuid;xc uuid;d date;offset_days integer;
 source text;fn regprocedure;
BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'VERIFY_574_LOCAL_ONLY';
 END IF;
 FOREACH fn IN ARRAY ARRAY['app.normalize_cuentas_por_cobrar_row()'::regprocedure,'app.normalize_cuentas_por_pagar_row()'::regprocedure] LOOP
  SELECT prosrc INTO source FROM pg_proc WHERE oid=fn;
  IF source ~* '\mcurrent_date\M' OR position('app.hoy_tenant(NEW.tenant_id)' in source)=0 THEN RAISE EXCEPTION 'VERIFY_574_SERVER_DAY_REMAINS:%',fn; END IF;
 END LOOP;
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
 VALUES(t,'VERIFY-574-'||left(t::text,8),'Tenant574','Fixture local','PE','test',true,'ACTIVO');
 INSERT INTO public.proveedores(tenant_id,codigo,nombre,razon_social,ruc,estado,activo,condiciones_pago,dias_credito)
 VALUES(t,'PROV-574','Proveedor574','Proveedor574','20123456574','ACTIVO',true,'CREDITO',30) RETURNING id INTO p;
 INSERT INTO public.clientes(tenant_id,codigo,nombre,razon_social,documento_tipo,ruc,activo)
 VALUES(t,'CLI-574','Cliente574','Cliente574','RUC','20123457574',true) RETURNING id INTO c;
 d:=app.hoy_tenant(t);
 -- Always establish an actual server civil-day mismatch, without changing the
 -- system clock or mocking the tenant clock. One of these two zones must differ.
 PERFORM set_config('TimeZone',CASE WHEN (now() AT TIME ZONE 'Pacific/Kiritimati')::date<>d THEN 'Pacific/Kiritimati' ELSE 'Etc/GMT+12' END,true);
 IF current_date=d THEN RAISE EXCEPTION 'VERIFY_574_CLOCK_DIFFERENCE_NOT_ESTABLISHED'; END IF;
 FOR offset_days IN -1..1 LOOP
  INSERT INTO public.cuentas_por_pagar(tenant_id,proveedor_id,numero_documento,fecha_emision,fecha_vencimiento,
    moneda,subtotal,igv,total,saldo,saldo_pendiente,estado,condiciones_pago,dias_credito,tipo_cambio_origen)
  VALUES(t,p,'FP-574-'||(offset_days+1),CASE WHEN offset_days<0 THEN d-30 END,d+offset_days,'PEN',100,0,100,100,100,'PENDIENTE','CREDITO',30,1) RETURNING id INTO xp;
  IF NOT EXISTS(SELECT 1 FROM public.cuentas_por_pagar WHERE id=xp AND fecha_emision=CASE WHEN offset_days<0 THEN d-30 ELSE d END AND fecha_vencimiento=d+offset_days
      AND estado=CASE WHEN offset_days<0 THEN 'VENCIDA' ELSE 'PENDIENTE' END AND total=100 AND saldo=100 AND saldo_pendiente=100) THEN
   RAISE EXCEPTION 'VERIFY_574_CXP_CIVIL_DAY_WRONG:%',offset_days;
  END IF;
  INSERT INTO public.cuentas_por_cobrar(tenant_id,cliente_id,estado,monto_total,monto_original,monto_pendiente,
    saldo,saldo_pendiente,total,fecha_emision,fecha_vencimiento,moneda,numero_documento,tipo_documento,
    idempotency_key,event_source,tipo_cambio_origen,metadata)
  VALUES(t,c,'PENDIENTE',100,100,100,100,100,100,CASE WHEN offset_days<0 THEN d-30 END,d+offset_days,'PEN','FC-574-'||(offset_days+1),'FACTURA',
    'verify-574-cxc-'||offset_days,'verify.574',1,'{"origen":"migracion_apertura"}') RETURNING id INTO xc;
  IF NOT EXISTS(SELECT 1 FROM public.cuentas_por_cobrar WHERE id=xc AND fecha_emision=CASE WHEN offset_days<0 THEN d-30 ELSE d END AND fecha_vencimiento=d+offset_days
      AND estado=CASE WHEN offset_days<0 THEN 'VENCIDA' ELSE 'PENDIENTE' END AND dias_mora=greatest(-offset_days,0)
      AND monto_total=100 AND monto_pendiente=100) THEN RAISE EXCEPTION 'VERIFY_574_CXC_CIVIL_DAY_WRONG:%',offset_days; END IF;
 END LOOP;
 IF has_table_privilege('service_role','public.cuentas_por_pagar','INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role','public.cuentas_por_cobrar','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'VERIFY_574_DIRECT_WRITER_OPEN'; END IF;
END;
$verify$;
ROLLBACK;
