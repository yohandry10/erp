import assert from 'node:assert/strict';
import {peru564StateSql} from './peru-564-state.mjs';
export function peru565StateSql(requiredSchema) {
  assert.ok([564,565].includes(requiredSchema));
  const tables=['cpe','cuentas_por_cobrar','documento_detalles','outbox_events'];
  const rows=tables.map(name=>`'${name}',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${name} t)`).join(',');
  return peru564StateSql(564)
    .replace('p_required_schema_version=>564',`p_required_schema_version=>${requiredSchema}`)
    .replace("'existingData',jsonb_build_object(",`'existingData',jsonb_build_object(${rows},`)
    .replace("AND NOT (n.nspname='app' AND p.proname='seed_pos_payment_catalog_564') AND NOT (n.nspname='public' AND p.proname='configurar_certificado_pos_tx')","AND NOT (n.nspname='public' AND p.proname='emitir_cpe_directo_peru_tx')")
    .replace(" AND t.tgname<>'seed_pos_payment_catalog_564'",'')
    .replace("'posBoundary',",`'directBoundary',(SELECT json_build_object(
      'security',jsonb_build_array(p.prosecdef,p.provolatile,pg_get_userbyid(p.proowner),p.proconfig),
      'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
      'guarded',position('assert_actor_461' IN p.prosrc)>0 AND position('PE_DIRECT_CPE_PERMISSION_REQUIRED' IN p.prosrc)>0 AND position('pg_advisory_xact_lock' IN p.prosrc)>0 AND position('PE_DIRECT_CPE_IDEMPOTENCY_CONFLICT' IN p.prosrc)>0 AND position('emitir_factura_cliente_tx' IN p.prosrc)>0 AND position('PE_DIRECT_CPE_POSTCONDITION_FAILED' IN p.prosrc)>0,
      'hash',md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid=to_regprocedure('public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text)')),
      'posBoundary',`);
}
export function assertPeru565Preserved(before,after) {
  for(const key of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers','readSources','posBoundary','catalogTrigger'])assert.deepEqual(after[key],before[key],`La migración alteró ${key}`);
  assert.equal(before.directBoundary,null);
  assert.equal(after.directBoundary.guarded,true);
  for(const role of ['anon','authenticated','public'])assert.equal(after.directBoundary[role],false);
  assert.equal(after.directBoundary.service,true);
  assert.deepEqual(after.directBoundary.security,[true,'v','postgres',['search_path=pg_catalog, public, app, extensions, pg_temp']]);
  assert.equal(after.schema,565);assert.equal(after.ready,true);
}
export function summarizePeru565State(state) {
  const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,readSources,...summary}=state;
  return {...summary,comparedData:Object.keys(existingData).sort()};
}
