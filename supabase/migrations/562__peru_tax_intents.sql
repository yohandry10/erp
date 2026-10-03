-- Tributos Perú: intención, versión/constancia y respuesta congelada atómicas.
-- Puentes anteriores conservados para promoción DB-first sin alterar historial.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE TABLE public.tributos_operaciones_562 (
 id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 actor_id uuid NOT NULL REFERENCES public.usuarios_sistema(id),
 operacion text NOT NULL CHECK(operacion IN('MONTHLY_SAVE','ANNUAL_SAVE','MONTHLY_RECEIPT','ANNUAL_RECEIPT')),
 idempotency_key text NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 255),
 fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 entidad_id uuid,
 response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(tenant_id,operacion,idempotency_key)
);
ALTER TABLE public.tributos_operaciones_562 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tributos_operaciones_562 FORCE ROW LEVEL SECURITY;
-- Registro privado: aun si un rol recibe SELECT por accidente, RLS deniega filas.
CREATE POLICY tributos_intents_private_562 ON public.tributos_operaciones_562
 FOR ALL TO PUBLIC USING(false) WITH CHECK(false);
REVOKE ALL ON public.tributos_operaciones_562 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.mutar_tributo_peru_tx(
 p_tenant_id uuid,p_actor_id uuid,p_idempotency_key text,p_operation text,
 p_record_id uuid,p_request jsonb,p_calculo jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
AS $function$
DECLARE
 v_key text:=btrim(coalesce(p_idempotency_key,''));
 v_super boolean;
 v_fingerprint text;
 v_intent public.tributos_operaciones_562;
 v_result jsonb;
 v_warnings jsonb;
BEGIN
 IF p_operation IS NULL OR p_operation NOT IN('MONTHLY_SAVE','ANNUAL_SAVE','MONTHLY_RECEIPT','ANNUAL_RECEIPT')
  OR length(v_key) NOT BETWEEN 8 AND 255 OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'TRIBUTO_REQUEST_INVALID' USING ERRCODE='22023';
 END IF;
 PERFORM app.assert_accounting_actor_458(p_tenant_id,p_actor_id);
 SELECT coalesce(is_super_admin,false) INTO v_super FROM public.usuarios_sistema WHERE id=p_actor_id;
 IF NOT v_super AND NOT EXISTS(
  SELECT 1 FROM public.user_roles ur
  JOIN public.roles r ON r.id=ur.role_id AND r.tenant_id=p_tenant_id AND coalesce(r.activo,true)
  JOIN public.rol_permisos rp ON rp.role_id=r.id AND coalesce(rp.concedido,true)
  JOIN public.permisos p ON p.id=rp.permiso_id AND p.tenant_id=p_tenant_id AND coalesce(p.activo,true)
  WHERE ur.usuario_sistema_id=p_actor_id AND ur.tenant_id=p_tenant_id
   AND lower(p.codigo)='contabilidad.reportes.actualizar'
 ) THEN RAISE EXCEPTION 'TRIBUTO_PERMISSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresa_config WHERE tenant_id=p_tenant_id AND upper(pais)='PE') THEN
  RAISE EXCEPTION 'TRIBUTO_PERU_ONLY' USING ERRCODE='22023';
 END IF;
 IF p_operation LIKE '%_RECEIPT' AND (p_record_id IS NULL OR nullif(btrim(p_request->>'constancia'),'') IS NULL) THEN
  RAISE EXCEPTION 'TRIBUTO_RECEIPT_INVALID' USING ERRCODE='22023';
 END IF;
 v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
  'actor',p_actor_id,'record',p_record_id,'request',p_request)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':tax:intent:'||v_key,562));
 SELECT * INTO v_intent FROM public.tributos_operaciones_562
  WHERE tenant_id=p_tenant_id AND operacion=p_operation AND idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_intent.actor_id IS DISTINCT FROM p_actor_id OR v_intent.fingerprint IS DISTINCT FROM v_fingerprint THEN
   RAISE EXCEPTION 'TRIBUTO_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  IF v_intent.response IS NULL THEN RAISE EXCEPTION 'TRIBUTO_OPERATION_INCOMPLETE' USING ERRCODE='40001'; END IF;
  RETURN v_intent.response;
 END IF;
 -- Consulta autorizada de intención; no crea reserva ni fila antes de calcular.
 IF p_calculo IS NULL THEN RETURN jsonb_build_object('pending',true); END IF;
 IF jsonb_typeof(p_calculo)<>'object' THEN RAISE EXCEPTION 'TRIBUTO_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
 IF p_operation='MONTHLY_SAVE' AND (p_calculo->>'periodo' IS DISTINCT FROM p_request->>'periodo'
  OR coalesce(p_request->>'periodo','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') THEN
  RAISE EXCEPTION 'TRIBUTO_PERIOD_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_operation='ANNUAL_SAVE' AND p_calculo->>'ejercicio' IS DISTINCT FROM p_request->>'ejercicio' THEN
  RAISE EXCEPTION 'TRIBUTO_EXERCISE_INVALID' USING ERRCODE='22023';
 END IF;
 IF p_operation='MONTHLY_RECEIPT' THEN
  SELECT warnings INTO v_warnings FROM public.tributos_declaraciones_mensuales
   WHERE id=p_record_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIBUTO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 ELSIF p_operation='ANNUAL_RECEIPT' THEN
  SELECT warnings INTO v_warnings FROM public.tributos_declaraciones_anuales
   WHERE id=p_record_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIBUTO_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END IF;
 IF p_operation LIKE '%_RECEIPT' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v_warnings,'[]')) w
   WHERE coalesce((w->>'bloquea_presentacion')::boolean,false)) THEN
  RAISE EXCEPTION 'TRIBUTO_RECEIPT_BLOCKED_BY_WARNINGS' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.tributos_operaciones_562(tenant_id,actor_id,operacion,idempotency_key,fingerprint)
  VALUES(p_tenant_id,p_actor_id,p_operation,v_key,v_fingerprint) RETURNING * INTO v_intent;
 CASE p_operation
 WHEN 'MONTHLY_SAVE' THEN v_result:=to_jsonb(app.guardar_tributo_mensual_tx(p_tenant_id,p_actor_id,p_calculo));
 WHEN 'ANNUAL_SAVE' THEN v_result:=to_jsonb(app.guardar_tributo_anual_tx(p_tenant_id,p_actor_id,p_calculo));
 WHEN 'MONTHLY_RECEIPT' THEN v_result:=to_jsonb(app.registrar_constancia_tributo_mensual_tx(
  p_tenant_id,p_actor_id,p_record_id,btrim(p_request->>'constancia'),(p_request->>'fecha_presentacion')::timestamptz));
 WHEN 'ANNUAL_RECEIPT' THEN v_result:=to_jsonb(app.registrar_constancia_tributo_anual_tx(
  p_tenant_id,p_actor_id,p_record_id,btrim(p_request->>'constancia'),(p_request->>'fecha_presentacion')::timestamptz));
 END CASE;
 IF v_result IS NULL THEN RAISE EXCEPTION 'TRIBUTO_EMPTY_RESULT' USING ERRCODE='40001'; END IF;
 UPDATE public.tributos_operaciones_562 SET entidad_id=(v_result->>'id')::uuid,response=v_result,completed_at=now()
  WHERE id=v_intent.id;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb) TO service_role;
COMMENT ON FUNCTION public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb) IS
 'Tributos Perú: autorización vigente, intención/versión/constancia atómicas y respuesta congelada. NULL cálculo consulta sin escribir.';
COMMIT;
