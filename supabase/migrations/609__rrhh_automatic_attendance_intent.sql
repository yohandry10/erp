-- La intención automática no incluye un reloj volátil. Se conserva el writer475,
-- su huella, recibo, actor, permiso y lock; nunca se adapta una marca anterior.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.registrar_asistencia_actual_tx(
 p_tenant_id uuid,p_actor_id uuid,p_empleado_id uuid,p_tipo text,p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
DECLARE
 v_key text:=btrim(coalesce(p_idempotency_key,''));
 v_tipo text:=lower(btrim(coalesce(p_tipo,'')));
 v_intent public.rrhh_operaciones_475%ROWTYPE;
 v_replayed boolean;
 v_country text;
 v_local timestamp;
 v_date text;
 v_time text;
 v_result jsonb;
BEGIN
 PERFORM app.assert_rrhh_actor_475(p_tenant_id,p_actor_id);
 IF length(v_key) NOT BETWEEN 8 AND 200 OR p_empleado_id IS NULL OR v_tipo NOT IN('entrada','salida') THEN
  RAISE EXCEPTION 'RRHH_ATTENDANCE_INTENT_INVALID' USING ERRCODE='23514';
 END IF;
 -- La misma llave de lock que el writer original: serializa también con una
 -- petición antigua/manual que esté confirmando esa intención.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':rrhh:intent:ATTENDANCE_MARK:'||v_key,475));
 SELECT * INTO v_intent FROM public.rrhh_operaciones_475 o
 WHERE o.tenant_id=p_tenant_id AND o.operacion='ATTENDANCE_MARK' AND o.idempotency_key=v_key
 FOR UPDATE;
 v_replayed:=FOUND;
 IF v_replayed THEN
  IF v_intent.actor_id IS DISTINCT FROM p_actor_id THEN
   RAISE EXCEPTION 'RRHH_IDEMPOTENCY_KEY_DIFFERENT_ACTOR' USING ERRCODE='23505';
  END IF;
  IF v_intent.response IS NULL THEN
   RAISE EXCEPTION 'RRHH_OPERATION_INCOMPLETE' USING ERRCODE='40001';
  END IF;
  v_date:=v_intent.response->>'fecha';
  v_time:=v_intent.response->>(CASE WHEN v_tipo='entrada' THEN 'hora_entrada' ELSE 'hora_salida' END);
  IF v_date IS NULL OR v_time IS NULL THEN
   RAISE EXCEPTION 'RRHH_IDEMPOTENCY_KEY_DIFFERENT_PAYLOAD' USING ERRCODE='23505';
  END IF;
 ELSE
  SELECT upper(coalesce(nullif(btrim(ec.pais),''),nullif(btrim(t.pais),''))) INTO v_country
  FROM public.tenants t LEFT JOIN LATERAL (
   SELECT config.pais FROM public.empresa_config config WHERE config.tenant_id=t.id
   ORDER BY config.updated_at DESC NULLS LAST,config.id LIMIT 1
  ) ec ON true WHERE t.id=p_tenant_id;
  IF v_country IS NULL OR v_country NOT IN('PE','CO','AR') THEN
   RAISE EXCEPTION 'RRHH_ATTENDANCE_COUNTRY_REQUIRED' USING ERRCODE='23514';
  END IF;
  v_local:=clock_timestamp() AT TIME ZONE app.zona_horaria_pais(v_country);
  v_date:=to_char(v_local,'YYYY-MM-DD');v_time:=to_char(v_local,'HH24:MI:SS');
 END IF;
 -- El writer revalida actor y huella completa, incluso en replay. Cambiar
 -- empleado/tipo o reutilizar un recibo manual distinto conserva el conflicto.
 v_result:=public.ejecutar_operacion_rrhh_tx(p_tenant_id,p_actor_id,'ATTENDANCE_MARK',
  jsonb_build_object('empleado_id',p_empleado_id,'fecha',v_date,'tipo',v_tipo,'hora',v_time),v_key);
 RETURN jsonb_build_object('data',v_result,'replayed',v_replayed);
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_asistencia_actual_tx(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_asistencia_actual_tx(uuid,uuid,uuid,text,text) TO service_role;
COMMENT ON FUNCTION public.registrar_asistencia_actual_tx(uuid,uuid,uuid,text,text) IS
 '609: asistencia automática con reloj civil del país y replay475 confirmado bajo el mismo lock. Sin backfill ni DML nuevo del runtime.';
-- Rollback: detener el binario que exige609 y desplegar el anterior; retirar
-- sólo esta función. Las marcas, recibos y auditoría475 se conservan.
COMMIT;
