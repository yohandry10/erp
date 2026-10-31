-- Expediente privado: metadatos durables + subida recuperable a Storage.
-- Sin backfill, URLs públicas ni borrado físico. Retirar conserva la evidencia;
-- retención/exportación integral corresponde al servicio de continuidad F09.
BEGIN;
SET LOCAL lock_timeout='10s';
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('supply-contract-files','supply-contract-files',false,10485760,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Las políticas permisivas heredadas no pueden abrir este bucket a clientes.
CREATE POLICY suministro_storage_private_573 ON storage.objects AS RESTRICTIVE TO anon,authenticated
USING(bucket_id<>'supply-contract-files') WITH CHECK(bucket_id<>'supply-contract-files');
CREATE TABLE public.suministro_adjuntos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, contrato_id uuid NOT NULL,
 recurso_tipo text NOT NULL CHECK(recurso_tipo IN ('CONTRATO','OC','ADENDA')), recurso_id uuid NOT NULL,
 nombre text NOT NULL CHECK(length(nombre) BETWEEN 1 AND 160 AND nombre !~ '[[:cntrl:]/\\]'),
 mime text NOT NULL CHECK(mime IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg')),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 10485760), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 object_path text NOT NULL UNIQUE, estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','DISPONIBLE','RETIRADO')),
 actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id), idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 180),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, retirado_por uuid REFERENCES public.usuarios_sistema(id), motivo_retiro text,
 FOREIGN KEY(tenant_id,contrato_id) REFERENCES public.suministro_contratos(tenant_id,id), UNIQUE(tenant_id,idempotency_key)
);
ALTER TABLE public.suministro_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suministro_adjuntos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.suministro_adjuntos FROM PUBLIC,anon,authenticated,service_role;
CREATE POLICY suministro_private_573 ON public.suministro_adjuntos USING(false) WITH CHECK(false);

CREATE FUNCTION public.consultar_suministro_adjuntos_573(p_tenant_id uuid,p_actor_id uuid,p_contrato_id uuid,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE d jsonb;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.ver');
 IF NOT EXISTS(SELECT 1 FROM public.suministro_contratos WHERE tenant_id=p_tenant_id AND id=p_contrato_id) THEN
  RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT to_jsonb(a) INTO d FROM public.suministro_adjuntos a WHERE tenant_id=p_tenant_id AND contrato_id=p_contrato_id AND id=p_id AND estado='DISPONIBLE';
  IF d IS NULL THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  RETURN d;
 END IF;
 RETURN coalesce((SELECT jsonb_agg((to_jsonb(a)-'object_path'-'idempotency_key') ORDER BY created_at,id)
  FROM public.suministro_adjuntos a WHERE tenant_id=p_tenant_id AND contrato_id=p_contrato_id AND estado<>'PENDIENTE'),'[]'::jsonb);
END $fn$;

CREATE FUNCTION public.reservar_suministro_adjunto_573(p_tenant_id uuid,p_actor_id uuid,p_contrato_id uuid,p_payload jsonb,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE a public.suministro_adjuntos; c public.suministro_contratos; k text:=btrim(coalesce(p_idempotency_key,'')); rid uuid;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
 IF length(k) NOT BETWEEN 8 AND 180 OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':suministro-adjunto:'||k,573));
 SELECT * INTO a FROM public.suministro_adjuntos WHERE tenant_id=p_tenant_id AND idempotency_key=k;
 IF FOUND THEN
  IF a.actor_id IS DISTINCT FROM p_actor_id OR a.contrato_id IS DISTINCT FROM p_contrato_id
    OR (a.nombre,a.mime,a.bytes,a.sha256,a.recurso_tipo,a.recurso_id) IS DISTINCT FROM
     (p_payload->>'nombre',p_payload->>'mime',(p_payload->>'bytes')::integer,p_payload->>'sha256',p_payload->>'recurso_tipo',(p_payload->>'recurso_id')::uuid) THEN
   RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF a.estado='RETIRADO' THEN RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN to_jsonb(a);
 END IF;
 SELECT * INTO c FROM public.suministro_contratos WHERE tenant_id=p_tenant_id AND id=p_contrato_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 rid:=(p_payload->>'recurso_id')::uuid;
 IF NOT ((p_payload->>'recurso_tipo'='CONTRATO' AND rid=c.id)
  OR (p_payload->>'recurso_tipo'='OC' AND EXISTS(SELECT 1 FROM public.suministro_ordenes_cliente WHERE tenant_id=p_tenant_id AND contrato_id=c.id AND id=rid))
  OR (p_payload->>'recurso_tipo'='ADENDA' AND EXISTS(SELECT 1 FROM public.suministro_historial WHERE tenant_id=p_tenant_id AND contrato_id=c.id AND id=rid AND accion='ADENDAR'))) THEN
  RAISE EXCEPTION 'SUPPLY_ATTACHMENT_TARGET_INVALID' USING ERRCODE='23514'; END IF;
 a.id:=gen_random_uuid();
 INSERT INTO public.suministro_adjuntos(id,tenant_id,contrato_id,recurso_tipo,recurso_id,nombre,mime,bytes,sha256,object_path,actor_id,idempotency_key)
 VALUES(a.id,p_tenant_id,c.id,p_payload->>'recurso_tipo',rid,p_payload->>'nombre',p_payload->>'mime',
  (p_payload->>'bytes')::integer,p_payload->>'sha256',p_tenant_id::text||'/'||c.id::text||'/'||a.id::text,p_actor_id,k) RETURNING * INTO a;
 RETURN to_jsonb(a);
END $fn$;

CREATE FUNCTION public.finalizar_suministro_adjunto_573(p_tenant_id uuid,p_actor_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,pg_temp AS $fn$
DECLARE a public.suministro_adjuntos; replay boolean;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
 SELECT * INTO a FROM public.suministro_adjuntos WHERE tenant_id=p_tenant_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF a.actor_id<>p_actor_id OR a.estado='RETIRADO' THEN RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 replay:=a.estado='DISPONIBLE';
 IF NOT replay THEN
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='supply-contract-files' AND name=a.object_path) THEN
   RAISE EXCEPTION 'SUPPLY_ATTACHMENT_NOT_STORED' USING ERRCODE='23514'; END IF;
  UPDATE public.suministro_adjuntos SET estado='DISPONIBLE',completed_at=now() WHERE id=a.id RETURNING * INTO a;
  INSERT INTO public.suministro_historial(tenant_id,contrato_id,recurso_id,accion,actual,actor_id)
   VALUES(p_tenant_id,a.contrato_id,a.id,'ADJUNTAR_DOCUMENTO',to_jsonb(a)-'object_path'-'idempotency_key',p_actor_id);
  INSERT INTO public.audit_log(tenant_id,user_id,table_name,operation,record_id,new_values)
   VALUES(p_tenant_id,p_actor_id,'suministro_adjuntos','INSERT',a.id::text,to_jsonb(a)-'object_path'-'idempotency_key');
 END IF;
 RETURN jsonb_build_object('id',a.id,'contrato_id',a.contrato_id,'accion','ADJUNTAR_DOCUMENTO','idempotent',replay);
END $fn$;

CREATE FUNCTION public.retirar_suministro_adjunto_573(p_tenant_id uuid,p_actor_id uuid,p_contrato_id uuid,p_id uuid,p_motivo text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,app,extensions,pg_temp AS $fn$
DECLARE a public.suministro_adjuntos; op public.suministro_operaciones; k text:=btrim(coalesce(p_idempotency_key,'')); h text; r jsonb;
BEGIN
 PERFORM app.assert_actor_permission_466(p_tenant_id,p_actor_id,'ventas.contratos.gestionar');
 IF length(k) NOT BETWEEN 8 AND 180 OR coalesce(length(btrim(p_motivo)),0) NOT BETWEEN 5 AND 1000 THEN
  RAISE EXCEPTION 'SUPPLY_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 h:=encode(extensions.digest(convert_to(jsonb_build_object('accion','RETIRAR_ADJUNTO','contrato',p_contrato_id,'id',p_id,'motivo',p_motivo)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':suministro:'||k,570));
 SELECT * INTO op FROM public.suministro_operaciones WHERE tenant_id=p_tenant_id AND idempotency_key=k;
 IF FOUND THEN
  IF op.actor_id IS DISTINCT FROM p_actor_id OR op.fingerprint IS DISTINCT FROM h THEN RAISE EXCEPTION 'SUPPLY_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN op.resultado||'{"idempotent":true}'::jsonb;
 END IF;
 SELECT * INTO a FROM public.suministro_adjuntos WHERE tenant_id=p_tenant_id AND contrato_id=p_contrato_id AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLY_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF a.estado<>'DISPONIBLE' THEN RAISE EXCEPTION 'SUPPLY_VERSION_OR_STATE_CONFLICT' USING ERRCODE='23505'; END IF;
 UPDATE public.suministro_adjuntos SET estado='RETIRADO',retirado_por=p_actor_id,motivo_retiro=btrim(p_motivo) WHERE id=a.id;
 INSERT INTO public.suministro_historial(tenant_id,contrato_id,recurso_id,accion,anterior,actual,motivo,actor_id)
  VALUES(p_tenant_id,a.contrato_id,a.id,'RETIRAR_ADJUNTO',jsonb_build_object('estado','DISPONIBLE'),jsonb_build_object('nombre',a.nombre,'estado','RETIRADO'),btrim(p_motivo),p_actor_id);
 INSERT INTO public.audit_log(tenant_id,user_id,table_name,operation,record_id,new_values)
  VALUES(p_tenant_id,p_actor_id,'suministro_adjuntos','UPDATE',a.id::text,jsonb_build_object('estado','RETIRADO','motivo',btrim(p_motivo)));
 r:=jsonb_build_object('id',a.id,'contrato_id',a.contrato_id,'accion','RETIRAR_ADJUNTO','idempotent',false);
 INSERT INTO public.suministro_operaciones(tenant_id,idempotency_key,actor_id,fingerprint,resultado) VALUES(p_tenant_id,k,p_actor_id,h,r);
 RETURN r;
END $fn$;
REVOKE ALL ON FUNCTION public.consultar_suministro_adjuntos_573(uuid,uuid,uuid,uuid),
 public.reservar_suministro_adjunto_573(uuid,uuid,uuid,jsonb,text),public.finalizar_suministro_adjunto_573(uuid,uuid,uuid),
 public.retirar_suministro_adjunto_573(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_suministro_adjuntos_573(uuid,uuid,uuid,uuid),
 public.reservar_suministro_adjunto_573(uuid,uuid,uuid,jsonb,text),public.finalizar_suministro_adjunto_573(uuid,uuid,uuid),
 public.retirar_suministro_adjunto_573(uuid,uuid,uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
