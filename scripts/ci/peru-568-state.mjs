import assert from 'node:assert/strict';
import {peru567StateSql} from './peru-567-state.mjs';
const replaceOnce=(text,search,replacement)=>{
  assert.equal(text.split(search).length,2,`Fragmento de estado no encontrado una sola vez: ${search.slice(0,60)}`);
  return text.replace(search,()=>replacement);
};
export function peru568StateSql(requiredSchema) {
  assert.ok([567,568].includes(requiredSchema));
  const tables=['recepciones','recepcion_items','ordenes_compra'];
  const rows=tables.map(name=>`'${name}',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${name} t)`).join(',');
  let sql=peru567StateSql(567);
  sql=replaceOnce(sql,'p_required_schema_version=>567',`p_required_schema_version=>${requiredSchema}`);
  sql=replaceOnce(sql,"'existingData',jsonb_build_object(",`'existingData',jsonb_build_object(${rows},`);
  sql=replaceOnce(sql,"AND p.proname NOT IN('crear_cotizacion_idempotente_tx_567','crear_pedido_idempotente_tx_567','sales_creation_intent_replay_567')",
    "AND p.proname<>'actualizar_recepcion_tx_568'");
  return replaceOnce(sql,"'posBoundary',",`'receiptBoundary',(SELECT jsonb_build_object('secdef',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,
      'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
      'guarded',position('assert_actor_461' IN p.prosrc)>0 AND position('RECEPCION_NOT_EDITABLE' IN p.prosrc)>0 AND position('FOR UPDATE' IN p.prosrc)>0)
      FROM pg_proc p WHERE p.oid=to_regprocedure('public.actualizar_recepcion_tx_568(uuid,uuid,uuid,text)')),
    'posBoundary',`);
}
export function assertPeru568Preserved(before,after) {
  for(const key of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers','readSources','posBoundary','catalogTrigger','directBoundary','cashReads','cashBoundary','salesBoundary','kpiRead'])assert.deepEqual(after[key],before[key],`La migración alteró ${key}`);
  assert.equal(before.receiptBoundary,null);
  assert.deepEqual(after.receiptBoundary,{secdef:true,owner:'postgres',config:['search_path=pg_catalog, public, app, pg_temp'],service:true,anon:false,authenticated:false,public:false,guarded:true});
  assert.equal(after.schema,568);assert.equal(after.ready,true);
}
export function summarizePeru568State(state) {
  const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,readSources,...summary}=state;
  return {...summary,comparedData:Object.keys(existingData).sort()};
}
