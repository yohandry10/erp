\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.fail_batch_estimates_572() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.event_type='depreciacion.generada' AND NEW.payload->>'activoId'=current_setting('uat.estimates572.fail_asset',true) THEN
  RAISE EXCEPTION 'VERIFY_572_SECOND_OUTBOX_FAILURE';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER verify_batch_estimates_572 BEFORE INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_batch_estimates_572();
DO $verify$
DECLARE
 t uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); a uuid; b uuid;
 r jsonb; replay jsonb; revision jsonb; historia jsonb; failed boolean;
 fn regprocedure; n integer; plan jsonb; key uuid:=gen_random_uuid(); saved_history jsonb;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY_572_LOCAL_ONLY'; END IF;
 FOREACH fn IN ARRAY ARRAY[to_regprocedure('app.cuota_activo_572(public.activos_fijos,integer,integer)'),to_regprocedure('app.calcular_revision_activo_572(public.activos_fijos)'),
   to_regprocedure('app.revisar_estimacion_activo_572()'),to_regprocedure('app.validar_cuota_revisada_572()')] LOOP
  IF fn IS NULL OR has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('authenticated',fn,'EXECUTE')
    OR has_function_privilege('service_role',fn,'EXECUTE')
    OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND prosecdef AND pg_get_userbyid(proowner)='postgres') THEN
    RAISE EXCEPTION 'VERIFY_572_PRIVATE_FUNCTION_INVALID:%',fn;
  END IF;
 END LOOP;
 IF has_table_privilege('service_role','public.activos_fijos','UPDATE')
    OR has_table_privilege('service_role','public.depreciaciones','INSERT')
    OR NOT has_table_privilege('service_role','public.depreciaciones','SELECT') THEN RAISE EXCEPTION 'VERIFY_572_ACL_INVALID'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('public.activos_fijos'::regclass,'public.depreciaciones'::regclass)
     AND relrowsecurity AND relforcerowsecurity)<>2 THEN RAISE EXCEPTION 'VERIFY_572_RLS_INVALID'; END IF;

 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,
   configured_at=clock_timestamp(),updated_at=clock_timestamp() WHERE singleton;
 INSERT INTO public.tenants(id,codigo,nombre,descripcion,pais,plan,activo,estado)
 VALUES(t,'VERIFY-572-'||left(t::text,8),'Tenant572','Fixture efímero','PE','test',true,'ACTIVO');
 INSERT INTO public.usuarios_sistema(id,tenant_id,nombre,apellido,email,nombre_usuario,password_hash,activo,estado,is_super_admin)
 VALUES(u,t,'Actor','572','actor-'||u::text||'@local.invalid','actor572','unused',true,'ACTIVO',true);
 r:=public.gestionar_activo_diferido_tx(t,u,'ASSET','CREATE',null,
  '{"codigo":"AF-572-L","nombre":"Equipo vida útil","fecha_adquisicion":"2026-01-01","valor_adquisicion":12000,"valor_residual":0,"vida_util_meses":12}',
  'verify-572-create-life'); a:=(r->>'id')::uuid;
 PERFORM public.registrar_depreciacion_tx(t,a,'2026-01','2026-01-31',1000,1000,11000,null,u::text);
 SELECT to_jsonb(d) INTO historia FROM public.depreciaciones d WHERE activo_id=a;
 r:=public.gestionar_activo_diferido_tx(t,u,'ASSET','UPDATE',a,'{"vida_util_meses":24}','verify-572-life-update');
 revision:=r->'record'->'metadata'->'depreciacion_revision_572';
 IF revision->>'periodo_inicio'<>'2026-02' OR (revision->>'meses_restantes')::integer<>23
    OR (revision->>'base_centimos')::numeric<>1100000 OR (revision->>'cuota_centimos')::numeric<>47826
    OR revision IS DISTINCT FROM (SELECT metadata->'depreciacion_revision_572' FROM public.activos_fijos WHERE id=a)
    OR historia IS DISTINCT FROM (SELECT to_jsonb(d) FROM public.depreciaciones d WHERE activo_id=a) THEN
   RAISE EXCEPTION 'VERIFY_572_PROSPECTIVE_BASIS_INVALID';
 END IF;
 replay:=public.gestionar_activo_diferido_tx(t,u,'ASSET','UPDATE',a,'{"vida_util_meses":24}','verify-572-life-update');
 IF replay->'record' IS DISTINCT FROM r->'record' OR replay->>'idempotent'<>'true' THEN RAISE EXCEPTION 'VERIFY_572_REPLAY_CHANGED_BASIS'; END IF;
 PERFORM public.gestionar_activo_diferido_tx(t,u,'ASSET','UPDATE',a,'{"nombre":"Nombre distinto"}','verify-572-name-update');
 IF revision IS DISTINCT FROM (SELECT metadata->'depreciacion_revision_572' FROM public.activos_fijos WHERE id=a) THEN
   RAISE EXCEPTION 'VERIFY_572_NAME_RESET_BASIS';
 END IF;
 failed:=false;
 BEGIN PERFORM public.registrar_depreciacion_tx(t,a,'2026-02','2026-02-28',500,1500,10500,null,u::text);
 EXCEPTION WHEN serialization_failure THEN failed:=SQLERRM='DEPRECIACION_REVISION_CAMBIO_CONCURRENTEMENTE'; END;
 IF NOT failed OR (SELECT count(*) FROM public.depreciaciones WHERE activo_id=a)<>1
   OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='depreciacion.generada')<>1 THEN
   RAISE EXCEPTION 'VERIFY_572_STALE_QUOTA_NOT_ATOMIC';
 END IF;
 PERFORM public.registrar_depreciacion_tx(t,a,'2026-02','2026-02-28',478.26,1478.26,10521.74,null,u::text);
 SELECT count(*) INTO n FROM public.financial_master_operations WHERE tenant_id=t;
 failed:=false;
 BEGIN PERFORM public.gestionar_activo_diferido_tx(t,u,'ASSET','UPDATE',a,'{"vida_util_meses":1}','verify-572-invalid-life');
 EXCEPTION WHEN invalid_parameter_value THEN failed:=SQLERRM='ASSET_USEFUL_LIFE_EXHAUSTED'; END;
 IF NOT failed OR (SELECT vida_util_meses FROM public.activos_fijos WHERE id=a)<>24
    OR (SELECT count(*) FROM public.financial_master_operations WHERE tenant_id=t)<>n THEN RAISE EXCEPTION 'VERIFY_572_INVALID_LIFE_PARTIAL_COMMIT'; END IF;

 r:=public.gestionar_activo_diferido_tx(t,u,'ASSET','CREATE',null,
  '{"codigo":"AF-572-R","nombre":"Equipo residual","fecha_adquisicion":"2026-01-01","valor_adquisicion":12000,"valor_residual":0,"vida_util_meses":12}',
  'verify-572-create-residual'); b:=(r->>'id')::uuid;
 PERFORM public.registrar_depreciacion_tx(t,b,'2026-01','2026-01-31',1000,1000,11000,null,u::text);
 r:=public.gestionar_activo_diferido_tx(t,u,'ASSET','UPDATE',b,'{"valor_residual":1000}','verify-572-residual-update');
 IF (r#>>'{record,metadata,depreciacion_revision_572,cuota_centimos}')::numeric<>90909 THEN RAISE EXCEPTION 'VERIFY_572_RESIDUAL_QUOTA_INVALID'; END IF;
 PERFORM public.registrar_depreciacion_tx(t,b,'2026-02','2026-02-28',909.09,1909.09,10090.91,null,u::text);
 IF (SELECT count(*) FROM public.depreciaciones WHERE tenant_id=t)<>4
   OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='depreciacion.generada')<>4 THEN
  RAISE EXCEPTION 'VERIFY_572_DEPRECIATION_OR_OUTBOX_INVALID';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('source',jsonb_build_object(
  'id',x.id,'tenant_id',x.tenant_id,'codigo',x.codigo,'valor_adquisicion',x.valor_adquisicion,
  'valor_residual',x.valor_residual,'vida_util_meses',x.vida_util_meses,'depreciacion_acumulada',x.depreciacion_acumulada,
  'fecha_inicio_depreciacion',coalesce(x.fecha_inicio_depreciacion,x.fecha_adquisicion),'centro_costo_id',x.centro_costo_id),
  'cuota',CASE WHEN x.id=a THEN 478.26 ELSE 909.09 END,
  'acumulada',x.depreciacion_acumulada+CASE WHEN x.id=a THEN 478.26 ELSE 909.09 END,
  'valor_neto',x.valor_adquisicion-x.depreciacion_acumulada-CASE WHEN x.id=a THEN 478.26 ELSE 909.09 END) ORDER BY x.id)
 INTO plan FROM public.activos_fijos x WHERE tenant_id=t;
 SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) INTO saved_history FROM public.depreciaciones d WHERE tenant_id=t;
 PERFORM set_config('uat.estimates572.fail_asset',plan->1->'source'->>'id',true);
 failed:=false;
 BEGIN PERFORM public.registrar_lote_depreciacion_tx_570(t,u,key,'{"anio":2026,"mes":3}',plan);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'VERIFY_572_SECOND_OUTBOX_FAILURE' THEN RAISE;END IF;failed:=true;
 END;
 IF NOT failed OR saved_history IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.depreciaciones d WHERE tenant_id=t)
  OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='depreciacion.generada')<>4
  OR EXISTS(SELECT 1 FROM app.asset_depreciation_batches_570 WHERE tenant_id=t) THEN
  RAISE EXCEPTION 'VERIFY_572_REVISED_BATCH_PARTIAL_COMMIT';
 END IF;
 PERFORM set_config('uat.estimates572.fail_asset','',true);
 r:=public.registrar_lote_depreciacion_tx_570(t,u,key,'{"anio":2026,"mes":3}',plan);
 IF r#>>'{data,activos_depreciados}'<>'2' OR (r#>>'{data,total_depreciado}')::numeric<>1387.35
  OR r#>>'{operation,actor_id}'<>u::text OR r#>>'{operation,idempotency_key}'<>key::text
  OR (SELECT count(*) FROM public.depreciaciones WHERE tenant_id=t)<>6
  OR (SELECT count(*) FROM public.outbox_events WHERE tenant_id=t AND event_type='depreciacion.generada')<>6 THEN
  RAISE EXCEPTION 'VERIFY_572_ATOMIC_REVISED_BATCH_RECEIPT';
 END IF;
 replay:=public.registrar_lote_depreciacion_tx_570(t,u,key,'{"anio":2026,"mes":3}','[]');
 IF replay-'idempotent' IS DISTINCT FROM r-'idempotent' OR replay->>'idempotent'<>'true'
  OR (SELECT count(*) FROM public.depreciaciones WHERE tenant_id=t)<>6
  OR (SELECT count(*) FROM app.asset_depreciation_batches_570 WHERE tenant_id=t)<>1 THEN
  RAISE EXCEPTION 'VERIFY_572_ORIGINAL_BATCH_REPLAY_CHANGED';
 END IF;
 RAISE NOTICE 'VERIFY_572_OK: revisión prospectiva, recibo/replay, historia, rechazo de cuota obsoleta atómico, residual, lote durable con importes revisados, fallo segunda operación/replay, ACL y RLS';
END;
$verify$;
ROLLBACK;
