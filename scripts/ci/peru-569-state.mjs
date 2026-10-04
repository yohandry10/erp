import assert from 'node:assert/strict';
import {peru568StateSql} from './peru-568-state.mjs';
const newFunctions=['conciliacion_partidas_replay_569','conciliar_partidas_idempotente_tx_569','plan_cuentas_conciliable_pe_569'];
const replaceOnce=(text,search,replacement)=>{
  assert.equal(text.split(search).length,2,`Fragmento de estado no encontrado una sola vez: ${search.slice(0,60)}`);
  return text.replace(search,()=>replacement);
};
export function peru569StateSql(requiredSchema) {
  assert.ok([568,569].includes(requiredSchema));
  let sql=peru568StateSql(568);
  sql=replaceOnce(sql,'p_required_schema_version=>568',`p_required_schema_version=>${requiredSchema}`);
  // La marca conciliable se compara aparte: el backfill sólo puede encender las cuentas PE de terceros.
  sql=replaceOnce(sql,"'plan_cuentas',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.plan_cuentas t)",
    "'plan_cuentas',(SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-'conciliable'-'updated_at')::text),'' ORDER BY (to_jsonb(t)-'conciliable'-'updated_at')::text),'')) FROM public.plan_cuentas t)");
  // La tabla de intenciones es nueva y el listado gana SELECT: ambos se comprueban en reconciliationBoundary.
  sql=replaceOnce(sql,"c.relname IN('cambios_turno','retiros_caja','sales_creation_intents'))",
    "c.relname IN('cambios_turno','retiros_caja','sales_creation_intents','accounting_reconciliation_intents','conciliaciones_partidas'))");
  sql=replaceOnce(sql,"AND NOT (schemaname='public' AND tablename='sales_creation_intents')",
    "AND NOT (schemaname='public' AND tablename IN('sales_creation_intents','accounting_reconciliation_intents'))");
  sql=replaceOnce(sql,"AND p.proname<>'actualizar_recepcion_tx_568'",`AND p.proname NOT IN(${newFunctions.map(n=>`'${n}'`).join(',')})`);
  sql=replaceOnce(sql,"t.tgname<>'seed_peru_cash_account_config_566'","t.tgname NOT IN('seed_peru_cash_account_config_566','trg_plan_cuentas_conciliable_pe_569')");
  return replaceOnce(sql,"'posBoundary',",`'conciliableFlags',(SELECT coalesce(jsonb_object_agg(id::text,conciliable),'{}'::jsonb) FROM public.plan_cuentas),
    'pendingConciliable',(SELECT coalesce(jsonb_agg(p.id::text ORDER BY p.id),'[]'::jsonb) FROM public.plan_cuentas p
      WHERE NOT p.conciliable AND p.codigo ~ '^(12|16|42|46)' AND EXISTS(SELECT 1 FROM public.empresa_config c WHERE c.tenant_id=p.tenant_id AND upper(btrim(c.pais))='PE')),
    'reconciliationBoundary',(SELECT CASE WHEN to_regclass('public.accounting_reconciliation_intents') IS NULL THEN NULL ELSE jsonb_build_object(
      'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'secdef',p.prosecdef,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig,
        'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
        'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app') AND p.proname IN(${newFunctions.map(n=>`'${n}'`).join(',')})),
      'table',(SELECT jsonb_build_object('rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
        'serviceRead',has_table_privilege('service_role',c.oid,'SELECT'),'serviceWrite',has_table_privilege('service_role',c.oid,'INSERT') OR has_table_privilege('service_role',c.oid,'UPDATE') OR has_table_privilege('service_role',c.oid,'DELETE'),
        'anonRead',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedRead',has_table_privilege('authenticated',c.oid,'SELECT'),
        'policies',(SELECT jsonb_agg(jsonb_build_object('name',policyname,'qual',qual,'check',with_check) ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='accounting_reconciliation_intents'))
        FROM pg_class c WHERE c.oid=to_regclass('public.accounting_reconciliation_intents')),
      'trigger',(SELECT pg_get_triggerdef(t.oid,true) FROM pg_trigger t WHERE t.tgrelid='public.plan_cuentas'::regclass AND t.tgname='trg_plan_cuentas_conciliable_pe_569')) END),
    'reconciliationList',(SELECT jsonb_build_object('rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'serviceRead',has_table_privilege('service_role',c.oid,'SELECT'),
      'serviceWrite',has_table_privilege('service_role',c.oid,'INSERT') OR has_table_privilege('service_role',c.oid,'UPDATE') OR has_table_privilege('service_role',c.oid,'DELETE'),
      'anonRead',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedRead',has_table_privilege('authenticated',c.oid,'SELECT'))
      FROM pg_class c WHERE c.oid='public.conciliaciones_partidas'::regclass),
    'posBoundary',`);
}
export function assertPeru569Preserved(before,after) {
  for(const key of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers','readSources','posBoundary','catalogTrigger','directBoundary','cashReads','cashBoundary','salesBoundary','kpiRead','receiptBoundary'])assert.deepEqual(after[key],before[key],`La migración alteró ${key}`);
  // Sólo se encienden las cuentas PE de terceros pendientes; ninguna se apaga ni cambia otra.
  assert.deepEqual(Object.keys(after.conciliableFlags).sort(),Object.keys(before.conciliableFlags).sort(),'La migración alteró las cuentas');
  const flips=new Set(before.pendingConciliable);
  for(const [id,flag] of Object.entries(after.conciliableFlags))assert.equal(flag,flips.has(id)?true:before.conciliableFlags[id],`La migración alteró conciliable de ${id}`);
  assert.deepEqual(after.pendingConciliable,[]);
  assert.equal(before.reconciliationBoundary,null);
  assert.equal(after.reconciliationBoundary.functions.length,3);
  for(const fn of after.reconciliationBoundary.functions){
    assert.equal(fn.secdef,true,fn.name);assert.equal(fn.owner,'postgres',fn.name);
    for(const role of ['anon','authenticated','public'])assert.equal(fn[role],false,`${fn.name}.${role}`);
    assert.equal(fn.service,fn.name!=='plan_cuentas_conciliable_pe_569',`${fn.name}.service`);
  }
  assert.deepEqual(after.reconciliationBoundary.table,{rls:true,forced:true,serviceRead:false,serviceWrite:false,anonRead:false,authenticatedRead:false,
    policies:[{name:'accounting_reconciliation_intents_private_569',qual:'false',check:'false'}]});
  assert.match(after.reconciliationBoundary.trigger,/BEFORE INSERT ON (public\.)?plan_cuentas FOR EACH ROW EXECUTE FUNCTION app\.plan_cuentas_conciliable_pe_569\(\)/);
  // El listado gana sólo lectura; escritura, RLS y roles de cliente no cambian.
  assert.deepEqual({...after.reconciliationList,serviceRead:before.reconciliationList.serviceRead},before.reconciliationList);
  assert.equal(after.reconciliationList.serviceRead,true);
  assert.equal(after.schema,569);assert.equal(after.ready,true);
}
export function summarizePeru569State(state) {
  const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,readSources,conciliableFlags,...summary}=state;
  return {...summary,comparedData:Object.keys(existingData).sort(),comparedAccounts:Object.keys(conciliableFlags).length};
}
