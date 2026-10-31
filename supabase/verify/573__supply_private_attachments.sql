\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE t uuid; a uuid; ot uuid; oa uuid; cl uuid; pr uuid; c uuid; f uuid; j jsonb; payload jsonb; obj text;
BEGIN
 IF current_database()<>'erp_e2e' THEN RAISE EXCEPTION 'VERIFY573_LOCAL_ONLY'; END IF;
 IF has_table_privilege('service_role','public.suministro_adjuntos','SELECT,INSERT,UPDATE,DELETE')
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.suministro_adjuntos'::regclass AND relrowsecurity AND relforcerowsecurity)
  OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='supply-contract-files' AND public)
  OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='suministro_storage_private_573' AND NOT polpermissive) THEN RAISE EXCEPTION 'VERIFY573_PRIVATE'; END IF;
 UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
 j:=public.create_demo_tenant_ready_tx('VERIFY573',14,'PE','verify573-'||gen_random_uuid()::text);t:=(j->>'tenant_id')::uuid;a:=(j->>'user_id')::uuid;
 j:=public.create_demo_tenant_ready_tx('VERIFY573OTHER',14,'PE','verify573other-'||gen_random_uuid()::text);ot:=(j->>'tenant_id')::uuid;oa:=(j->>'user_id')::uuid;
 SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
 SELECT id INTO pr FROM public.productos WHERE tenant_id=t AND activo AND unidad_medida IS NOT NULL ORDER BY id LIMIT 1;
 j:=public.operar_suministro_570(t,a,'CREAR_CONTRATO',NULL,jsonb_build_object('cliente_id',cl,'numero','573','asunto','Expediente privado','moneda','PEN','vigencia_desde','2026-01-01','vigencia_hasta','2027-12-31','responsable_id',a,'lineas',jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',1,'precio_unitario',2))),'573-contract');c:=(j->>'id')::uuid;
 payload:=jsonb_build_object('recurso_tipo','CONTRATO','recurso_id',c,'nombre','Contrato.pdf','mime','application/pdf','bytes',100,'sha256',repeat('a',64));
 j:=public.reservar_suministro_adjunto_573(t,a,c,payload,'573-upload');f:=(j->>'id')::uuid;obj:=j->>'object_path';
 IF jsonb_array_length(public.consultar_suministro_adjuntos_573(t,a,c))<>0 THEN RAISE EXCEPTION 'VERIFY573_PENDING_VISIBLE'; END IF;
 BEGIN PERFORM public.finalizar_suministro_adjunto_573(t,a,f); RAISE EXCEPTION 'VERIFY573_MISSING_OBJECT';
 EXCEPTION WHEN check_violation THEN IF SQLERRM<>'SUPPLY_ATTACHMENT_NOT_STORED' THEN RAISE; END IF; END;
 INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('supply-contract-files',obj,'{"size":100}');
 PERFORM public.finalizar_suministro_adjunto_573(t,a,f);
 j:=public.finalizar_suministro_adjunto_573(t,a,f);
 IF j->>'idempotent'<>'true' OR jsonb_array_length(public.consultar_suministro_adjuntos_573(t,a,c))<>1
  OR (SELECT count(*) FROM public.suministro_historial WHERE recurso_id=f AND accion='ADJUNTAR_DOCUMENTO')<>1 THEN RAISE EXCEPTION 'VERIFY573_FINALIZE_REPLAY'; END IF;
 BEGIN PERFORM public.reservar_suministro_adjunto_573(t,a,c,payload||'{"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}','573-upload'); RAISE EXCEPTION 'VERIFY573_DIFFERENT_CONTENT'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN PERFORM public.reservar_suministro_adjunto_573(t,a,c,payload||jsonb_build_object('recurso_tipo','OC','recurso_id',gen_random_uuid()),'573-target'); RAISE EXCEPTION 'VERIFY573_FOREIGN_TARGET'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.consultar_suministro_adjuntos_573(ot,oa,c,f); RAISE EXCEPTION 'VERIFY573_FOREIGN_READ'; EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM public.finalizar_suministro_adjunto_573(t,oa,f); RAISE EXCEPTION 'VERIFY573_FOREIGN_ACTOR'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.retirar_suministro_adjunto_573(t,a,c,f,'Documento reemplazado','573-retire');
 j:=public.retirar_suministro_adjunto_573(t,a,c,f,'Documento reemplazado','573-retire');
 IF j->>'idempotent'<>'true' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE name=obj AND bucket_id='supply-contract-files') THEN RAISE EXCEPTION 'VERIFY573_RETIRE_PRESERVATION'; END IF;
 BEGIN PERFORM public.consultar_suministro_adjuntos_573(t,a,c,f); RAISE EXCEPTION 'VERIFY573_RETIRED_DOWNLOAD'; EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM public.reservar_suministro_adjunto_573(t,a,c,payload,'573-upload'); RAISE EXCEPTION 'VERIFY573_RETIRED_RESURRECTED'; EXCEPTION WHEN unique_violation THEN NULL; END;
 RAISE NOTICE 'VERIFY573_OK: Storage privado, preparación, confirmación, replay, retiro, aislamiento e historial';
END $verify$;
ROLLBACK;
