-- Ensayo LOCAL. Capturar has_table_privilege antes de migrar y pasar su valor
-- con -v prior_depreciation_select=true|false. No adivinar ni revocar un grant
-- anterior. La metadata de revisión se conserva y la API anterior la ignora.
\set ON_ERROR_STOP on
\if :{?prior_depreciation_select}
\else
DO $$ BEGIN RAISE EXCEPTION 'ROLLBACK_572_REQUIRES_PRIOR_SELECT_SNAPSHOT'; END $$;
\endif
BEGIN;
DO $$ BEGIN
 IF current_database()<>'erp_e2e' OR NOT EXISTS(SELECT 1 FROM app.deployment_environment
   WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
  RAISE EXCEPTION 'ROLLBACK_572_LOCAL_ONLY';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.registrar_lote_depreciacion_tx_570(p_tenant_id uuid,p_actor_id uuid,p_key uuid,p_request jsonb,p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,extensions,pg_temp
SET lock_timeout='5s' AS $depreciation_write570$
DECLARE previous jsonb;current_sources jsonb;expected_sources jsonb;item jsonb;source jsonb;r jsonb;result jsonb;
 cuotas jsonb:='[]';omitidos jsonb:='[]';dep public.depreciaciones%ROWTYPE;
 oid uuid:=gen_random_uuid();stamp timestamptz:=clock_timestamp();v_periodo text;fecha date;
 total numeric:=0;base numeric;remaining numeric;monthly numeric;elapsed integer;cuota numeric;acc numeric;net numeric;start_date date;
BEGIN
 previous:=public.leer_lote_depreciacion_570(p_tenant_id,p_actor_id,p_key,p_request);
 IF previous IS NOT NULL THEN RETURN previous;END IF;
 IF jsonb_typeof(p_plan) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'DEPRECIATION570_PLAN_INVALID' USING ERRCODE='22023';END IF;
 v_periodo:=to_char(make_date((p_request->>'anio')::int,(p_request->>'mes')::int,1),'YYYY-MM');
 fecha:=(make_date((p_request->>'anio')::int,(p_request->>'mes')::int,1)+interval '1 month - 1 day')::date;
 -- Fences inserts and changes to candidates across pages, including equal-count replacements.
 -- Fail/rollback on any row: no exception handler may convert a partial batch into success.
 LOCK TABLE public.activos_fijos IN EXCLUSIVE MODE;
 PERFORM app.ensure_accounting_period_open_458(p_tenant_id,fecha);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'codigo',a.codigo,
  'valor_adquisicion',a.valor_adquisicion,'valor_residual',a.valor_residual,'vida_util_meses',a.vida_util_meses,
  'depreciacion_acumulada',a.depreciacion_acumulada,'fecha_inicio_depreciacion',coalesce(a.fecha_inicio_depreciacion,a.fecha_adquisicion),
  'centro_costo_id',a.centro_costo_id) ORDER BY a.id),'[]') INTO current_sources
 FROM public.activos_fijos a WHERE a.tenant_id=p_tenant_id AND a.situacion='ACTIVO';
 SELECT coalesce(jsonb_agg(value->'source' ORDER BY value->'source'->>'id'),'[]') INTO expected_sources FROM jsonb_array_elements(p_plan);
 IF current_sources IS DISTINCT FROM expected_sources THEN RAISE EXCEPTION 'DEPRECIATION570_SOURCE_CHANGED' USING ERRCODE='40001';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan) ORDER BY value->'source'->>'id' LOOP
  source:=item->'source';
  IF jsonb_typeof(item->'cuota') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'acumulada') IS DISTINCT FROM 'number'
   OR jsonb_typeof(item->'valor_neto') IS DISTINCT FROM 'number' OR (source->>'vida_util_meses')::int<1 THEN
   RAISE EXCEPTION 'DEPRECIATION570_PLAN_INVALID' USING ERRCODE='22023';END IF;
  start_date:=(source->>'fecha_inicio_depreciacion')::date;
  elapsed:=((p_request->>'anio')::int-extract(year FROM start_date)::int)*12+(p_request->>'mes')::int-extract(month FROM start_date)::int;
  base:=round(((source->>'valor_adquisicion')::numeric-(source->>'valor_residual')::numeric)*100);
  remaining:=base-round((source->>'depreciacion_acumulada')::numeric*100);
  monthly:=round(base/(source->>'vida_util_meses')::int);
  cuota:=CASE WHEN elapsed<0 OR elapsed>=(source->>'vida_util_meses')::int OR remaining<=0 THEN 0
   ELSE least(CASE WHEN elapsed=(source->>'vida_util_meses')::int-1 THEN remaining ELSE monthly END,remaining)/100 END;
  acc:=round((source->>'depreciacion_acumulada')::numeric+cuota,2);net:=round((source->>'valor_adquisicion')::numeric-acc,2);
  IF (item->>'cuota')::numeric IS DISTINCT FROM cuota OR (item->>'acumulada')::numeric IS DISTINCT FROM acc OR (item->>'valor_neto')::numeric IS DISTINCT FROM net THEN
   RAISE EXCEPTION 'DEPRECIATION570_COMPUTED_CONFLICT' USING ERRCODE='40001';END IF;
  -- Existing installments belong to their original operation and stay untouched.
  SELECT * INTO dep FROM public.depreciaciones d WHERE d.tenant_id=p_tenant_id AND d.activo_id=(source->>'id')::uuid
   AND d.periodo=v_periodo AND lower(d.estado::text) IN('pendiente','procesada') ORDER BY d.created_at,d.id LIMIT 1;
  IF FOUND THEN
   omitidos:=omitidos||jsonb_build_array(jsonb_build_object('activo_id',source->>'id','codigo',source->>'codigo','motivo','ALREADY_REGISTERED','depreciacion_id',dep.id));
  ELSIF cuota<=0 THEN
   omitidos:=omitidos||jsonb_build_array(jsonb_build_object('activo_id',source->>'id','codigo',source->>'codigo','motivo','OUTSIDE_USEFUL_LIFE_OR_RESIDUAL'));
  ELSE
   r:=public.registrar_depreciacion_tx(p_tenant_id,(source->>'id')::uuid,v_periodo,fecha,cuota,acc,net,(source->>'centro_costo_id')::uuid,p_actor_id::text);
   IF r->'idempotent' IS DISTINCT FROM 'false'::jsonb OR r->'depreciacion'->>'tenant_id' IS DISTINCT FROM p_tenant_id::text
    OR r->'depreciacion'->>'activo_id' IS DISTINCT FROM source->>'id' OR r->'outbox'->>'depreciacionId' IS DISTINCT FROM r->'depreciacion'->>'id' THEN
    RAISE EXCEPTION 'DEPRECIATION570_INSTALLMENT_UNKNOWN' USING ERRCODE='23514';END IF;
   cuotas:=cuotas||jsonb_build_array(jsonb_build_object('activo_id',source->>'id','codigo',source->>'codigo','depreciacion',r->'depreciacion','outbox',r->'outbox'));
   total:=total+cuota;
  END IF;
 END LOOP;
 result:=jsonb_build_object('success',true,'complete',true,'tenant_id',p_tenant_id,'idempotent',false,
  'data',jsonb_build_object('periodo',v_periodo,'activos_depreciados',jsonb_array_length(cuotas),'total_depreciado',total,'cuotas',cuotas,'omitidos',omitidos),
  'operation',jsonb_build_object('status','COMMITTED','type','ACCOUNTING_ASSET_DEPRECIATION_BATCH','operation_id',oid,'tenant_id',p_tenant_id,
   'actor_id',p_actor_id,'idempotency_key',p_key,'request',p_request,'request_fingerprint',encode(extensions.digest(convert_to(p_request::text,'UTF8'),'sha256'),'hex'),
   'snapshot_count',jsonb_array_length(p_plan),'created_at',stamp));
 INSERT INTO app.asset_depreciation_batches_570 VALUES(p_tenant_id,p_key,p_actor_id,oid,p_request,p_plan,result,stamp);
 RETURN result;
END $depreciation_write570$;

DROP TRIGGER trg_cuota_revisada_572 ON public.depreciaciones;
DROP TRIGGER trg_z_estimacion_activo_572 ON public.activos_fijos;
DROP FUNCTION app.validar_cuota_revisada_572();
DROP FUNCTION app.revisar_estimacion_activo_572();
DROP FUNCTION app.calcular_revision_activo_572(public.activos_fijos);
DROP FUNCTION app.cuota_activo_572(public.activos_fijos,integer,integer);
\if :prior_depreciation_select
GRANT SELECT ON public.depreciaciones TO service_role;
\else
REVOKE SELECT ON public.depreciaciones FROM service_role;
\endif
COMMIT;
