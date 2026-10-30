import assert from 'node:assert/strict';
// Compara todas las filas y fronteras existentes, incluidos los ledgers570.
// Sólo se separan la tabla y función que introduce571; no normaliza columnas.
export function peru571PreservedStateSql() {
  const relations = "n.nspname IN('public','app','auth','storage') AND c.relname<>'customer_update_intents'";
  const acl = (value, owner, kind) => `(SELECT coalesce(jsonb_agg(jsonb_build_array(
    pg_get_userbyid(permissions.grantor),CASE WHEN permissions.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(permissions.grantee) END,
    permissions.privilege_type,permissions.is_grantable) ORDER BY pg_get_userbyid(permissions.grantor),
    CASE WHEN permissions.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(permissions.grantee) END,permissions.privilege_type,permissions.is_grantable),'[]'::jsonb)
    FROM unnest(coalesce(${value},${kind ? `acldefault('${kind}',${owner})` : "'{}'::aclitem[]"})) AS entries(entry)
    CROSS JOIN LATERAL aclexplode(ARRAY[entries.entry]) permissions)`;
  return `SELECT jsonb_build_object(
 'data',(SELECT jsonb_object_agg(n.nspname||'.'||c.relname,
   md5(query_to_xml(format('SELECT coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY to_jsonb(t)::text),'''') AS fingerprint FROM %I.%I t',n.nspname,c.relname),false,true,'')::text))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p') AND ${relations}),
 'tables',(SELECT jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_array(pg_get_userbyid(c.relowner),${acl('c.relacl','c.relowner','r')},c.relrowsecurity,c.relforcerowsecurity))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p') AND ${relations}),
 'columns',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,${acl('a.attacl','c.relowner',null)},pg_get_expr(d.adbin,d.adrelid))::text,'' ORDER BY n.nspname,c.relname,a.attnum),''))
   FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
   WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN('r','p') AND ${relations}),
 'functions',(SELECT jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
   md5(jsonb_build_array(pg_get_userbyid(p.proowner),${acl('p.proacl','p.proowner','f')},p.proconfig,pg_get_functiondef(p.oid))::text))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','app') AND p.prokind IN('f','p') AND p.proname<>'actualizar_cliente_idempotente_tx_571'),
 'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),''))
   FROM pg_policies p WHERE schemaname IN('public','app','auth','storage') AND tablename<>'customer_update_intents'),
 'constraints',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid,true))::text,'' ORDER BY n.nspname,c.relname,k.conname),''))
   FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE ${relations}),
 'triggers',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true))::text,'' ORDER BY n.nspname,c.relname,t.tgname),''))
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND ${relations}),
 'views',(SELECT jsonb_object_agg(n.nspname||'.'||c.relname,md5(jsonb_build_array(pg_get_viewdef(c.oid,true),pg_get_userbyid(c.relowner),${acl('c.relacl','c.relowner','r')})::text))
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('v','m') AND ${relations})
);`;
}
export function assertPeru571Preserved(before, after) {
  assert.deepEqual(after, before, '571 debe conservar cada fila, columna, función y frontera existente');
}
export const peru571PrivateBoundarySql = `SELECT jsonb_build_object(
 'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations),
 'rows',(SELECT count(*) FROM public.customer_update_intents),
 'rls',(SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.customer_update_intents'::regclass),
 'serviceRead',has_table_privilege('service_role','public.customer_update_intents','SELECT'),
 'serviceWrite',has_table_privilege('service_role','public.customer_update_intents','INSERT,UPDATE,DELETE'),
 'authenticatedRead',has_table_privilege('authenticated','public.customer_update_intents','SELECT'),
 'anonRead',has_table_privilege('anon','public.customer_update_intents','SELECT'),
 'serviceExecute',has_function_privilege('service_role','public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)','EXECUTE'),
 'authenticatedExecute',has_function_privilege('authenticated','public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)','EXECUTE'),
 'anonExecute',has_function_privilege('anon','public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)','EXECUTE')
);`;
export function assertPeru571PrivateBoundary(boundary) {
  assert.deepEqual(boundary, { schema:571, rows:0, rls:true, serviceRead:false, serviceWrite:false,
    authenticatedRead:false, anonRead:false, serviceExecute:true, authenticatedExecute:false, anonExecute:false });
}
