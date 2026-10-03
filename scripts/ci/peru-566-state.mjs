import assert from 'node:assert/strict';
import {peru565StateSql} from './peru-565-state.mjs';
const cashReads=['cambios_turno','retiros_caja'];
const replaceOnce=(text,search,replacement)=>{
  assert.equal(text.split(search).length,2,`Fragmento de estado no encontrado una sola vez: ${search.slice(0,60)}`);
  return text.replace(search,()=>replacement);
};
export function peru566StateSql(requiredSchema) {
  assert.ok([565,566].includes(requiredSchema));
  const tables=['movimientos_caja','cortes_caja',...cashReads];
  const rows=tables.map(name=>`'${name}',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${name} t)`).join(',');
  const targetList=cashReads.map(name=>`'${name}'`).join(',');
  let sql=peru565StateSql(565);
  sql=replaceOnce(sql,'p_required_schema_version=>565',`p_required_schema_version=>${requiredSchema}`);
  sql=replaceOnce(sql,"'existingData',jsonb_build_object(",`'existingData',jsonb_build_object(${rows},`);
  // Las dos fuentes reciben SELECT del backend; su ACL se compara aparte sin esa única concesión.
  sql=replaceOnce(sql,"WHERE c.relkind IN('r','p') AND n.nspname IN('public','app','auth','storage')",
    `WHERE c.relkind IN('r','p') AND n.nspname IN('public','app','auth','storage') AND NOT (n.nspname='public' AND c.relname IN(${targetList}))`);
  sql=replaceOnce(sql,"AND NOT (n.nspname='public' AND p.proname='emitir_cpe_directo_peru_tx')","AND NOT (n.nspname='app' AND p.proname='seed_peru_cash_account_config_566')");
  sql=replaceOnce(sql,"WHERE NOT t.tgisinternal AND n.nspname IN('public','app')","WHERE NOT t.tgisinternal AND n.nspname IN('public','app') AND t.tgname<>'seed_peru_cash_account_config_566'");
  return replaceOnce(sql,"'posBoundary',",`'cashReads',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
      'serviceRead',has_table_privilege('service_role',c.oid,'SELECT'),
      'serviceWrite',has_table_privilege('service_role',c.oid,'INSERT') OR has_table_privilege('service_role',c.oid,'UPDATE') OR has_table_privilege('service_role',c.oid,'DELETE') OR has_table_privilege('service_role',c.oid,'TRUNCATE'),
      'anonRead',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedRead',has_table_privilege('authenticated',c.oid,'SELECT'),
      'aclWithoutBackendRead',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]')
        FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE NOT (pg_get_userbyid(a.grantee)='service_role' AND a.privilege_type='SELECT'))
    ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN(${targetList})),
    'cashBoundary',(SELECT json_build_object(
      'security',jsonb_build_array(p.prosecdef,p.provolatile,pg_get_userbyid(p.proowner),p.proconfig),
      'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
      'guarded',position('ensure_fiscal_account_465' IN p.prosrc)>0 AND position('10111' IN p.prosrc)>0 AND position('''PE''' IN p.prosrc)>0,
      'trigger',(SELECT count(*) FROM pg_trigger t WHERE t.tgrelid='public.empresa_config'::regclass AND t.tgname='seed_peru_cash_account_config_566' AND t.tgenabled='O' AND t.tgfoid=p.oid),
      'hash',md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid=to_regprocedure('app.seed_peru_cash_account_config_566()')),
    'posBoundary',`);
}
export function assertPeru566Preserved(before,after) {
  for(const key of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers','readSources','posBoundary','catalogTrigger','directBoundary'])assert.deepEqual(after[key],before[key],`La migración alteró ${key}`);
  assert.equal(before.cashBoundary,null);
  assert.equal(after.cashReads.length,2);
  for(const [index,table] of after.cashReads.entries()){
    const previous=before.cashReads[index];
    assert.equal(table.table,previous.table);
    assert.equal(table.serviceRead,true,`Falta SELECT backend en ${table.table}`);
    for(const key of ['owner','rls','forced','serviceWrite','anonRead','authenticatedRead','aclWithoutBackendRead'])assert.deepEqual(table[key],previous[key],`La migración alteró ${table.table}.${key}`);
  }
  assert.equal(after.cashBoundary.guarded,true);
  assert.equal(after.cashBoundary.trigger,1);
  for(const role of ['service','anon','authenticated','public'])assert.equal(after.cashBoundary[role],false);
  assert.deepEqual(after.cashBoundary.security,[true,'v','postgres',['search_path=pg_catalog, public, app, pg_temp']]);
  assert.equal(after.schema,566);assert.equal(after.ready,true);
}
export function summarizePeru566State(state) {
  const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,readSources,...summary}=state;
  return {...summary,comparedData:Object.keys(existingData).sort()};
}
