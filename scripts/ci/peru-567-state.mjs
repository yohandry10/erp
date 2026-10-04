import assert from 'node:assert/strict';
import {peru566StateSql} from './peru-566-state.mjs';
const newFunctions=['crear_cotizacion_idempotente_tx_567','crear_pedido_idempotente_tx_567','sales_creation_intent_replay_567'];
const replaceOnce=(text,search,replacement)=>{
  assert.equal(text.split(search).length,2,`Fragmento de estado no encontrado una sola vez: ${search.slice(0,60)}`);
  return text.replace(search,()=>replacement);
};
export function peru567StateSql(requiredSchema) {
  assert.ok([566,567].includes(requiredSchema));
  const tables=['cotizaciones','cotizacion_detalles','pedidos_venta','pedidos_venta_detalle'];
  const rows=tables.map(name=>`'${name}',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${name} t)`).join(',');
  let sql=peru566StateSql(566);
  sql=replaceOnce(sql,'p_required_schema_version=>566',`p_required_schema_version=>${requiredSchema}`);
  sql=replaceOnce(sql,"'existingData',jsonb_build_object(",`'existingData',jsonb_build_object(${rows},`);
  // La tabla de intenciones es nueva; su seguridad se comprueba en salesBoundary.
  sql=replaceOnce(sql,"AND NOT (n.nspname='public' AND c.relname IN('cambios_turno','retiros_caja'))",
    "AND NOT (n.nspname='public' AND c.relname IN('cambios_turno','retiros_caja','sales_creation_intents'))");
  sql=replaceOnce(sql,"FROM pg_policies p WHERE schemaname IN('public','app','auth','storage')","FROM pg_policies p WHERE schemaname IN('public','app','auth','storage') AND NOT (schemaname='public' AND tablename='sales_creation_intents')");
  sql=replaceOnce(sql,"AND NOT (n.nspname='app' AND p.proname='seed_peru_cash_account_config_566')",
    `AND p.proname NOT IN(${newFunctions.map(n=>`'${n}'`).join(',')})`);
  return replaceOnce(sql,"'posBoundary',",`'salesBoundary',(SELECT CASE WHEN to_regclass('public.sales_creation_intents') IS NULL THEN NULL ELSE jsonb_build_object(
      'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'secdef',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,
        'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
        'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app') AND p.proname IN(${newFunctions.map(n=>`'${n}'`).join(',')})),
      'table',(SELECT jsonb_build_object('rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
        'serviceRead',has_table_privilege('service_role',c.oid,'SELECT'),'serviceWrite',has_table_privilege('service_role',c.oid,'INSERT') OR has_table_privilege('service_role',c.oid,'UPDATE') OR has_table_privilege('service_role',c.oid,'DELETE'),
        'anonRead',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedRead',has_table_privilege('authenticated',c.oid,'SELECT'),
        'policies',(SELECT jsonb_agg(jsonb_build_object('name',policyname,'qual',qual,'check',with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='sales_creation_intents'))
        FROM pg_class c WHERE c.oid='public.sales_creation_intents'::regclass)) END),
    'kpiRead',has_table_privilege('service_role','public.v_kpis_sunat_multitenant','SELECT'),
    'posBoundary',`);
}
export function assertPeru567Preserved(before,after) {
  for(const key of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers','readSources','posBoundary','catalogTrigger','directBoundary','cashReads','cashBoundary'])assert.deepEqual(after[key],before[key],`La migración alteró ${key}`);
  assert.equal(before.salesBoundary,null);
  assert.equal(after.salesBoundary.functions.length,3);
  for(const fn of after.salesBoundary.functions){
    assert.equal(fn.secdef,true,fn.name);assert.equal(fn.owner,'postgres',fn.name);
    for(const role of ['anon','authenticated','public'])assert.equal(fn[role],false,`${fn.name}.${role}`);
    assert.equal(fn.service,fn.name!=='sales_creation_intent_replay_567',`${fn.name}.service`);
  }
  assert.deepEqual(after.salesBoundary.table,{rls:true,forced:true,serviceRead:false,serviceWrite:false,anonRead:false,authenticatedRead:false,
    policies:[{name:'sales_creation_intents_private_567',qual:'false',check:'false'}]});
  assert.equal(after.kpiRead,true);
  assert.equal(after.schema,567);assert.equal(after.ready,true);
}
export function summarizePeru567State(state) {
  const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,readSources,...summary}=state;
  return {...summary,comparedData:Object.keys(existingData).sort()};
}
