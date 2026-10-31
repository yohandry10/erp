-- Una revisión de vida útil/residual congela la base pendiente y su cuota.
-- No modifica depreciaciones ni asientos ya registrados. Sólo se aplica al
-- cambiar una estimación por el writer479; su RETURNING y recibo incluyen la
-- misma revisión dentro del commit. El lock de activo serializa con454.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION app.calcular_revision_activo_572(p_activo public.activos_fijos)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
DECLARE
 inicio date; ultimo date; siguiente date; transcurridos integer; restantes integer;
 pendiente numeric; adquisicion numeric; acumulada numeric; residual numeric;
BEGIN
 inicio:=date_trunc('month',coalesce(p_activo.fecha_inicio_depreciacion,p_activo.fecha_adquisicion))::date;
 IF inicio IS NULL OR coalesce(p_activo.vida_util_meses,0)<=0 THEN
   RAISE EXCEPTION 'ASSET_VALUES_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT max((d.periodo||'-01')::date) INTO ultimo
 FROM public.depreciaciones d
 WHERE d.tenant_id=p_activo.tenant_id AND d.activo_id=p_activo.id AND coalesce(d.activo,true)
   AND lower(d.estado::text) IN ('pendiente','procesada')
   AND d.periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$';
 siguiente:=CASE WHEN ultimo IS NULL THEN inicio ELSE greatest(inicio,(ultimo+interval '1 month')::date) END;
 transcurridos:=(extract(year FROM siguiente)::integer-extract(year FROM inicio)::integer)*12
               +extract(month FROM siguiente)::integer-extract(month FROM inicio)::integer;
 restantes:=p_activo.vida_util_meses-transcurridos;
 adquisicion:=round(p_activo.valor_adquisicion*100);
 acumulada:=round(coalesce(p_activo.depreciacion_acumulada,0)*100);
 residual:=round(coalesce(p_activo.valor_residual,0)*100);
 pendiente:=greatest(adquisicion-acumulada-residual,0);
 IF restantes<=0 AND pendiente>0 THEN
   RAISE EXCEPTION 'ASSET_USEFUL_LIFE_EXHAUSTED' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object(
     'version',572,'periodo_inicio',to_char(siguiente,'YYYY-MM'),
     'meses_restantes',greatest(restantes,0),'base_centimos',pendiente,
     'cuota_centimos',CASE WHEN restantes>0 THEN round(pendiente/restantes) ELSE 0 END,
     'acumulada_anterior_centimos',acumulada,'adquisicion_centimos',adquisicion,
     'residual_centimos',residual,'revisada_en',clock_timestamp());
END;
$function$;

CREATE OR REPLACE FUNCTION app.revisar_estimacion_activo_572()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
BEGIN
 IF NEW.vida_util_meses IS NOT DISTINCT FROM OLD.vida_util_meses
    AND NEW.valor_residual IS NOT DISTINCT FROM OLD.valor_residual THEN RETURN NEW; END IF;
 NEW.metadata:=coalesce(NEW.metadata,'{}'::jsonb)||jsonb_build_object(
   'depreciacion_revision_572',app.calcular_revision_activo_572(NEW));
 RETURN NEW;
END;
$function$;

-- Se ejecuta después de los normalizadores existentes. Cambiar nombre o centro
-- sin cambiar la estimación no reinicia la cuota ni su base de redondeo.
CREATE TRIGGER trg_z_estimacion_activo_572
BEFORE UPDATE OF vida_util_meses,valor_residual ON public.activos_fijos
FOR EACH ROW EXECUTE FUNCTION app.revisar_estimacion_activo_572();

-- Una única regla SQL valida cuotas individuales y el lote durable570.
-- La API calcula independientemente su plan; un cambio concurrente produce40001.
CREATE OR REPLACE FUNCTION app.cuota_activo_572(p_activo public.activos_fijos,p_anio integer,p_mes integer)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp AS $quota572$
DECLARE revision jsonb:=p_activo.metadata->'depreciacion_revision_572';inicio date;indice integer;meses integer;
 pendiente numeric;mensual numeric;
BEGIN
 pendiente:=greatest(round((p_activo.valor_adquisicion-p_activo.valor_residual-p_activo.depreciacion_acumulada)*100),0);
 IF revision IS NULL THEN
  inicio:=coalesce(p_activo.fecha_inicio_depreciacion,p_activo.fecha_adquisicion);
  meses:=p_activo.vida_util_meses;
  mensual:=round(round((p_activo.valor_adquisicion-p_activo.valor_residual)*100)/meses);
 ELSE
  IF revision->>'version' IS DISTINCT FROM '572'
   OR coalesce(revision->>'periodo_inicio','') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
   OR jsonb_typeof(revision->'meses_restantes') IS DISTINCT FROM 'number'
   OR jsonb_typeof(revision->'cuota_centimos') IS DISTINCT FROM 'number'
   OR (revision->>'meses_restantes')::numeric<>trunc((revision->>'meses_restantes')::numeric)
   OR (revision->>'cuota_centimos')::numeric<>trunc((revision->>'cuota_centimos')::numeric)
   OR (revision->>'meses_restantes')::numeric<0 OR (revision->>'cuota_centimos')::numeric<0 THEN
   RAISE EXCEPTION 'DEPRECIACION_REVISION_INVALIDA' USING ERRCODE='40001';
  END IF;
  inicio:=((revision->>'periodo_inicio')||'-01')::date;
  meses:=(revision->>'meses_restantes')::integer;mensual:=(revision->>'cuota_centimos')::numeric;
 END IF;
 indice:=(p_anio-extract(year FROM inicio)::integer)*12+p_mes-extract(month FROM inicio)::integer;
 IF indice<0 OR indice>=meses OR pendiente<=0 THEN RETURN 0;END IF;
 RETURN least(CASE WHEN indice=meses-1 THEN pendiente ELSE mensual END,pendiente)/100;
END $quota572$;

CREATE OR REPLACE FUNCTION app.validar_cuota_revisada_572()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,app,pg_temp
AS $function$
DECLARE
 asset public.activos_fijos%ROWTYPE; revision jsonb; inicio date; periodo date;
 indice integer; meses integer; pendiente numeric; cuota numeric;
BEGIN
 -- registrar_depreciacion_tx ya mantiene este lock hasta cuota+outbox+commit.
 SELECT * INTO asset FROM public.activos_fijos
 WHERE tenant_id=NEW.tenant_id AND id=NEW.activo_id FOR UPDATE;
  revision:=asset.metadata->'depreciacion_revision_572';
  IF revision IS NULL THEN RETURN NEW; END IF;
  cuota:=app.cuota_activo_572(asset,split_part(NEW.periodo,'-',1)::integer,split_part(NEW.periodo,'-',2)::integer);
  IF cuota<=0 OR NEW.monto_depreciacion IS DISTINCT FROM cuota THEN
    RAISE EXCEPTION 'DEPRECIACION_REVISION_CAMBIO_CONCURRENTEMENTE' USING ERRCODE='40001';
  END IF;
 RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_cuota_revisada_572 BEFORE INSERT ON public.depreciaciones
FOR EACH ROW EXECUTE FUNCTION app.validar_cuota_revisada_572();

-- Las estimaciones anteriores al release también parten del saldo realmente
-- registrado. Sólo se añade metadata; no se toca cuota, asiento, evento ni recibo.
-- Si un activo vigente ya agotó su horizonte con saldo pendiente, la migración
-- falla de forma atómica para que el ensayo de compatibilidad lo identifique.
UPDATE public.activos_fijos a SET metadata=coalesce(a.metadata,'{}'::jsonb)||
 jsonb_build_object('depreciacion_revision_572',app.calcular_revision_activo_572(a))
WHERE a.situacion='ACTIVO' AND NOT (coalesce(a.metadata,'{}'::jsonb)?'depreciacion_revision_572')
 AND EXISTS(SELECT 1 FROM public.depreciaciones d WHERE d.tenant_id=a.tenant_id AND d.activo_id=a.id
            AND coalesce(d.activo,true) AND lower(d.estado::text) IN ('pendiente','procesada'));

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
   SELECT app.cuota_activo_572(a,(p_request->>'anio')::int,(p_request->>'mes')::int) INTO cuota
   FROM public.activos_fijos a WHERE a.tenant_id=p_tenant_id AND a.id=(source->>'id')::uuid;
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

REVOKE ALL ON FUNCTION app.cuota_activo_572(public.activos_fijos,integer,integer),app.calcular_revision_activo_572(public.activos_fijos),app.revisar_estimacion_activo_572(),app.validar_cuota_revisada_572()
FROM PUBLIC,anon,authenticated,service_role;
-- Supabase concede escritura por defecto; la depreciación sólo se escribe por su RPC.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.depreciaciones FROM service_role;
GRANT SELECT ON public.depreciaciones TO service_role;

COMMENT ON FUNCTION app.revisar_estimacion_activo_572() IS
 'Snapshot prospectivo por cambio de estimación; recibo479 incluye la revisión. El backfill sólo añade bases futuras, sin reescribir historia.';
COMMENT ON FUNCTION app.validar_cuota_revisada_572() IS
 'Revalida la cuota bajo el lock454 frente a una estimación concurrente; el replay existente sigue en454 antes del INSERT.';
COMMIT;
