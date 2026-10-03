-- Catálogos para futuras empresas PE; sin backfill ni datos comerciales.
-- El writer de PFX usa el recibo de intención y la frontera de configuración.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE OR REPLACE FUNCTION app.seed_pos_payment_catalog_564()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
BEGIN
 IF upper(coalesce(NEW.pais,''))='PE' THEN
  INSERT INTO public.metodos_pago(tenant_id,codigo,nombre,tipo,estado,activo)
  SELECT NEW.tenant_id,x.codigo,x.nombre,x.tipo,'ACTIVO',true
  FROM (VALUES ('EFECTIVO','Efectivo','EFECTIVO'),('TARJETA','Tarjeta','TARJETA'),
   ('TRANSFERENCIA','Transferencia bancaria','TRANSFERENCIA'),('YAPE','Yape / Plin','BILLETERA_DIGITAL')) x(codigo,nombre,tipo)
  WHERE NOT EXISTS(SELECT 1 FROM public.metodos_pago m WHERE m.tenant_id=NEW.tenant_id AND upper(btrim(m.codigo))=x.codigo);
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION app.seed_pos_payment_catalog_564() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS seed_pos_payment_catalog_564 ON public.empresa_config;
CREATE TRIGGER seed_pos_payment_catalog_564 AFTER INSERT ON public.empresa_config
FOR EACH ROW EXECUTE FUNCTION app.seed_pos_payment_catalog_564();

CREATE OR REPLACE FUNCTION public.configurar_certificado_pos_tx(
 p_tenant_id uuid,p_actor_id uuid,p_idempotency_key text,p_intent_fingerprint text,
 p_certificado bytea,p_password text,p_expira_en timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE v_replay jsonb;v_result jsonb;v_fingerprint text;v_super boolean;
BEGIN
 PERFORM app.assert_configuration_actor_464(p_tenant_id,p_actor_id,false);
 SELECT coalesce(is_super_admin,false) INTO v_super FROM public.usuarios_sistema WHERE id=p_actor_id;
 IF NOT v_super AND NOT EXISTS(
  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.tenant_id=p_tenant_id AND coalesce(r.activo,true)
  JOIN public.rol_permisos rp ON rp.role_id=r.id AND coalesce(rp.concedido,true)
  JOIN public.permisos p ON p.id=rp.permiso_id AND p.tenant_id=p_tenant_id AND coalesce(p.activo,true)
  WHERE ur.usuario_sistema_id=p_actor_id AND ur.tenant_id=p_tenant_id AND p.codigo='pos.configuracion.write'
 ) THEN RAISE EXCEPTION 'POS_CERTIFICATE_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_intent_fingerprint IS NULL OR p_intent_fingerprint !~ '^[a-f0-9]{64}$'
  OR p_certificado IS NULL OR octet_length(p_certificado)<29
  OR nullif(p_password,'') IS NULL OR p_expira_en IS NULL THEN
  RAISE EXCEPTION 'POS_CERTIFICATE_PAYLOAD_INVALID' USING ERRCODE='22023';
 END IF;
 v_fingerprint:=app.configuration_fingerprint_464(jsonb_build_object('actor',p_actor_id,'intent',p_intent_fingerprint));
 v_replay:=app.configuration_intent_replay_464('TENANT',p_tenant_id::text,'POS_CERTIFICATE',p_idempotency_key,v_fingerprint);
 IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
 PERFORM public.actualizar_empresa_config_tx(p_tenant_id,p_actor_id,
  'pos-cert:'||md5(p_tenant_id::text||lower(btrim(p_idempotency_key))), 'EMPRESA',
  jsonb_build_object('certificado_pfx',p_certificado,'certificado_password',p_password,'certificado_expira_en',p_expira_en));
 v_result:=jsonb_build_object('success',true,'idempotent',false,'message','Certificado configurado correctamente');
 PERFORM app.configuration_intent_finish_464(p_tenant_id,'TENANT',p_tenant_id::text,'POS_CERTIFICATE',p_idempotency_key,v_fingerprint,v_result);
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.configurar_certificado_pos_tx(uuid,uuid,text,text,bytea,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configurar_certificado_pos_tx(uuid,uuid,text,text,bytea,text,timestamptz) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
