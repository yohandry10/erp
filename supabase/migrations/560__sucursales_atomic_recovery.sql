-- Alta, edición, baja y asignación conservan intención, auditoría y resultado
-- en una transacción. No se modifica ni se rellena ninguna fila histórica.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL search_path=pg_catalog,public,app,extensions,pg_temp;

CREATE OR REPLACE FUNCTION public.mutar_sucursal_tx(
 p_tenant_id uuid,p_actor_id uuid,p_idempotency_key text,p_operation text,
 p_record_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE
 v_operation text:=upper(btrim(coalesce(p_operation,'')));
 v_action text;
 v_super boolean;
 v_fingerprint text;
 v_replay jsonb;
 v_result jsonb;
 v_row public.sucursales;
 v_old jsonb;
 v_ids uuid[];
 v_previous uuid[];
 v_user public.usuarios_sistema;
BEGIN
 v_action:=CASE v_operation WHEN 'CREATE' THEN 'create' WHEN 'UPDATE' THEN 'update'
  WHEN 'DEACTIVATE' THEN 'delete' WHEN 'ASSIGN' THEN 'assign' END;
 IF v_action IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 255 THEN
  RAISE EXCEPTION 'SUCURSAL_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM app.assert_configuration_actor_464(p_tenant_id,p_actor_id,false);
 SELECT coalesce(is_super_admin,false) INTO v_super FROM public.usuarios_sistema WHERE id=p_actor_id;
 IF NOT v_super AND NOT EXISTS(
  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.tenant_id=p_tenant_id AND coalesce(r.activo,true)
  JOIN public.rol_permisos rp ON rp.role_id=r.id AND coalesce(rp.concedido,true)
  JOIN public.permisos p ON p.id=rp.permiso_id AND p.tenant_id=p_tenant_id AND coalesce(p.activo,true)
  WHERE ur.usuario_sistema_id=p_actor_id AND ur.tenant_id=p_tenant_id AND lower(p.codigo)='configuracion.sucursales.'||v_action
 ) THEN RAISE EXCEPTION 'SUCURSAL_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;

 -- Actor y autorización se vuelven a comprobar también al recuperar recibos.
 v_fingerprint:=app.configuration_fingerprint_464(jsonb_build_object('actor',p_actor_id,'record',p_record_id,'payload',p_payload));
 v_replay:=app.configuration_intent_replay_464('TENANT',p_tenant_id::text,'SUCURSAL_'||v_operation,p_idempotency_key,v_fingerprint);
 IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

 IF v_operation='ASSIGN' THEN
  IF p_payload-ARRAY['sucursal_ids']::text[]<>'{}'::jsonb OR jsonb_typeof(p_payload->'sucursal_ids') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'SUCURSAL_ASSIGN_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  -- Todas las intenciones del mismo usuario se serializan, incluso con claves distintas.
  SELECT * INTO v_user FROM public.usuarios_sistema WHERE id=p_record_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUCURSAL_USER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT coalesce(array_agg(value::uuid ORDER BY value::uuid),'{}'::uuid[]) INTO v_ids FROM jsonb_array_elements_text(p_payload->'sucursal_ids');
  IF cardinality(v_ids)<>(SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN
   RAISE EXCEPTION 'SUCURSAL_ASSIGN_DUPLICATE' USING ERRCODE='22023';
  END IF;
  -- Bloquear sucursales impide apagar un local durante esta validación.
  PERFORM 1 FROM public.sucursales WHERE tenant_id=p_tenant_id AND id=ANY(v_ids) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS(SELECT 1 FROM public.sucursales s WHERE s.tenant_id=p_tenant_id AND s.id=x AND s.activo)) THEN
   RAISE EXCEPTION 'SUCURSAL_ASSIGN_FOREIGN_OR_INACTIVE' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(sucursal_id ORDER BY sucursal_id),'{}'::uuid[]) INTO v_previous
   FROM public.usuario_sucursales WHERE tenant_id=p_tenant_id AND usuario_sistema_id=p_record_id;
  DELETE FROM public.usuario_sucursales WHERE tenant_id=p_tenant_id AND usuario_sistema_id=p_record_id;
  INSERT INTO public.usuario_sucursales(tenant_id,usuario_sistema_id,sucursal_id)
   SELECT p_tenant_id,p_record_id,x FROM unnest(v_ids) x;
  v_result:=jsonb_build_object('sucursal_ids',to_jsonb(v_ids));
  PERFORM app.audit_configuration_464(p_tenant_id,p_actor_id,'usuario_sucursales','UPDATE',p_record_id::text,
   jsonb_build_object('sucursal_ids',to_jsonb(v_previous)),v_result,'SUCURSAL_ASSIGN',jsonb_build_object('source','sucursales_560','idempotency_key',p_idempotency_key));
 ELSE
  IF v_operation='CREATE' THEN
   IF p_record_id IS NOT NULL OR p_payload-ARRAY['nombre','codigo','codigo_establecimiento','direccion','ubigeo','telefono','centro_costo_id']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'SUCURSAL_CREATE_PAYLOAD_INVALID' USING ERRCODE='22023';
   END IF;
   -- El contador automático de 503 lee MAX; serializar el alta por tenant
   -- evita que claves diferentes compitan por el mismo siguiente código.
   PERFORM pg_advisory_xact_lock(hashtextextended('sucursal:create:'||p_tenant_id::text,560));
   IF coalesce(p_payload->>'codigo_establecimiento','')<>'' AND p_payload->>'codigo_establecimiento' !~ '^[0-9]{1,4}$' THEN
    RAISE EXCEPTION 'SUCURSAL_CODE_INVALID' USING ERRCODE='22023';
   END IF;
  ELSE
   IF v_operation='DEACTIVATE' AND p_payload<>'{}'::jsonb THEN
    RAISE EXCEPTION 'SUCURSAL_DEACTIVATE_PAYLOAD_INVALID' USING ERRCODE='22023';
   END IF;
   IF p_payload-ARRAY['nombre','codigo','direccion','ubigeo','telefono','centro_costo_id','activo']::text[]<>'{}'::jsonb THEN
    RAISE EXCEPTION 'SUCURSAL_UPDATE_PAYLOAD_INVALID' USING ERRCODE='22023';
   END IF;
   SELECT * INTO v_row FROM public.sucursales WHERE tenant_id=p_tenant_id AND id=p_record_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'SUCURSAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
   IF EXISTS(SELECT 1 FROM public.usuario_sucursales WHERE tenant_id=p_tenant_id AND usuario_sistema_id=p_actor_id)
    AND NOT EXISTS(SELECT 1 FROM public.usuario_sucursales WHERE tenant_id=p_tenant_id AND usuario_sistema_id=p_actor_id AND sucursal_id=p_record_id) THEN
    RAISE EXCEPTION 'SUCURSAL_NOT_FOUND' USING ERRCODE='P0002';
   END IF;
   v_old:=to_jsonb(v_row);
   IF v_row.es_principal AND (v_operation='DEACTIVATE' OR p_payload->>'activo'='false') THEN
    RAISE EXCEPTION 'SUCURSAL_PRINCIPAL_PROTECTED' USING ERRCODE='22023';
   END IF;
  END IF;
  IF p_payload ? 'nombre' AND (nullif(btrim(p_payload->>'nombre'),'') IS NULL OR length(p_payload->>'nombre')>160) THEN
   RAISE EXCEPTION 'SUCURSAL_NAME_INVALID' USING ERRCODE='22023';
  END IF;
  IF nullif(p_payload->>'ubigeo','') IS NOT NULL AND p_payload->>'ubigeo' !~ '^[0-9]{6}$' THEN
   RAISE EXCEPTION 'SUCURSAL_UBIGEO_INVALID' USING ERRCODE='22023';
  END IF;
  IF nullif(p_payload->>'centro_costo_id','') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.centros_costo WHERE tenant_id=p_tenant_id AND id=(p_payload->>'centro_costo_id')::uuid
  ) THEN RAISE EXCEPTION 'SUCURSAL_COST_CENTER_FOREIGN' USING ERRCODE='22023'; END IF;
  IF v_operation='CREATE' THEN
   INSERT INTO public.sucursales(tenant_id,nombre,codigo,codigo_establecimiento,direccion,ubigeo,telefono,centro_costo_id)
    VALUES(p_tenant_id,p_payload->>'nombre',p_payload->>'codigo',nullif(p_payload->>'codigo_establecimiento',''),p_payload->>'direccion',p_payload->>'ubigeo',p_payload->>'telefono',nullif(p_payload->>'centro_costo_id','')::uuid)
    RETURNING * INTO v_row;
  ELSE
   UPDATE public.sucursales SET
    nombre=CASE WHEN p_payload ? 'nombre' THEN p_payload->>'nombre' ELSE nombre END,
    codigo=CASE WHEN p_payload ? 'codigo' THEN p_payload->>'codigo' ELSE codigo END,
    direccion=CASE WHEN p_payload ? 'direccion' THEN p_payload->>'direccion' ELSE direccion END,
    ubigeo=CASE WHEN p_payload ? 'ubigeo' THEN p_payload->>'ubigeo' ELSE ubigeo END,
    telefono=CASE WHEN p_payload ? 'telefono' THEN p_payload->>'telefono' ELSE telefono END,
    centro_costo_id=CASE WHEN p_payload ? 'centro_costo_id' THEN nullif(p_payload->>'centro_costo_id','')::uuid ELSE centro_costo_id END,
    activo=CASE WHEN v_operation='DEACTIVATE' THEN false WHEN p_payload ? 'activo' THEN (p_payload->>'activo')::boolean ELSE activo END
    WHERE tenant_id=p_tenant_id AND id=p_record_id RETURNING * INTO v_row;
  END IF;
  v_result:=jsonb_build_object('sucursal',to_jsonb(v_row));
  PERFORM app.audit_configuration_464(p_tenant_id,p_actor_id,'sucursales',CASE WHEN v_operation='CREATE' THEN 'INSERT' ELSE 'UPDATE' END,
   v_row.id::text,v_old,to_jsonb(v_row),'SUCURSAL_'||v_operation,jsonb_build_object('source','sucursales_560','idempotency_key',p_idempotency_key));
 END IF;
 PERFORM app.configuration_intent_finish_464(p_tenant_id,'TENANT',p_tenant_id::text,'SUCURSAL_'||v_operation,p_idempotency_key,v_fingerprint,v_result);
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
