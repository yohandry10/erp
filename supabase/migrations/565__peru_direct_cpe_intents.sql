-- Nueva frontera PE directa. No cambia escritores de pedidos, documentos o POS.
-- Sin backfill: las claves heredadas sin huella no se consideran equivalentes.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE OR REPLACE FUNCTION public.emitir_cpe_directo_peru_tx(
 p_tenant_id uuid,p_actor_id uuid,p_intent_fingerprint text,
 p_cpe jsonb,p_documento jsonb,p_detalles jsonb,p_cxc jsonb,
 p_event_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE v_key text:=btrim(coalesce(p_idempotency_key,''));v_existing public.cpe%ROWTYPE;v_result jsonb;v_super boolean;
BEGIN
 PERFORM app.assert_actor_461(p_tenant_id,p_actor_id);
 SELECT coalesce(is_super_admin,false) INTO v_super FROM public.usuarios_sistema WHERE id=p_actor_id;
 IF NOT coalesce(v_super,false) AND NOT EXISTS(
  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.tenant_id=p_tenant_id AND coalesce(r.activo,true)
  JOIN public.rol_permisos rp ON rp.role_id=r.id AND coalesce(rp.concedido,true)
  JOIN public.permisos p ON p.id=rp.permiso_id AND p.tenant_id=p_tenant_id AND coalesce(p.activo,true)
  WHERE ur.usuario_sistema_id=p_actor_id AND ur.tenant_id=p_tenant_id AND p.codigo='cpe.comprobantes.emitir'
 ) THEN RAISE EXCEPTION 'PE_DIRECT_CPE_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(pais)='PE')
  OR jsonb_typeof(p_cpe) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_documento) IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_detalles) IS DISTINCT FROM 'array'
  OR length(v_key) NOT BETWEEN 8 AND 200 OR v_key ~ '^(pos\.cpe:|doc\.cpe:|ventas\.cpe\.factura:)'
  OR p_intent_fingerprint IS NULL OR p_intent_fingerprint !~ '^[a-f0-9]{64}$'
  OR p_cpe->>'created_by' IS DISTINCT FROM p_actor_id::text
  OR coalesce(p_cpe->>'tipo_documento','') NOT IN ('01','03')
  OR nullif(p_documento->>'pedido_id','') IS NOT NULL THEN
  RAISE EXCEPTION 'PE_DIRECT_CPE_INTENT_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM set_config('app.current_tenant_id',p_tenant_id::text,true);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':pe-direct-cpe:'||v_key,565));
 SELECT * INTO v_existing FROM public.cpe WHERE tenant_id=p_tenant_id AND idempotency_key=v_key FOR UPDATE;
 IF FOUND AND (v_existing.metadata->>'pe_direct_request_fingerprint' IS DISTINCT FROM p_intent_fingerprint
  OR v_existing.created_by IS DISTINCT FROM p_actor_id) THEN
  RAISE EXCEPTION 'PE_DIRECT_CPE_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
 END IF;
 v_result:=public.emitir_factura_cliente_tx(p_tenant_id,
  p_cpe||jsonb_build_object('metadata',coalesce(p_cpe->'metadata','{}'::jsonb)||jsonb_build_object('pais','PE','pe_direct_request_fingerprint',p_intent_fingerprint)),
  p_documento,p_detalles,p_cxc,p_event_id,v_key);
 IF NOT EXISTS(SELECT 1 FROM public.cpe WHERE tenant_id=p_tenant_id AND id=(v_result->>'cpe_id')::uuid
  AND metadata->>'pe_direct_request_fingerprint'=p_intent_fingerprint AND created_by=p_actor_id) THEN
  RAISE EXCEPTION 'PE_DIRECT_CPE_POSTCONDITION_FAILED' USING ERRCODE='23514';
 END IF;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
