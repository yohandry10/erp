import assert from 'node:assert/strict';

// Huellas privadas se comparan en memoria; los informes sólo publican conteos.
export function peru556StateSql(requiredSchema) {
  assert.ok([555, 556].includes(requiredSchema));
  return `SELECT json_build_object(
    'project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),
    'environment',(SELECT environment FROM app.deployment_environment WHERE singleton),
    'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
    'ready',coalesce((public.outbox_runtime_health_492(p_required_schema_version => ${requiredSchema})->>'ready')::boolean,false),
    'accounts',coalesce((SELECT jsonb_object_agg(id::text,md5(to_jsonb(pc)::text)) FROM public.plan_cuentas pc),'{}'::jsonb),
    'permissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' ORDER BY p.tenant_id,p.codigo),'')) FROM public.permisos p),
    'rolePermissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(rp)::text),'' ORDER BY rp.role_id,rp.permiso_id),'')) FROM public.rol_permisos rp),
    'tableSecurity',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app','auth','storage')),
    'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN ('public','app','auth','storage')),
    'functions556',coalesce((SELECT jsonb_object_agg(p.proname,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('seed_peru_operating_accounts_556','seed_peru_operating_config_556')),'{}'::jsonb),
    'triggers556',(SELECT count(*) FROM pg_trigger WHERE tgname='trg_seed_peru_operating_accounts_556' AND tgrelid='public.empresa_config'::regclass),
    'missingOperatingAccounts',(SELECT count(*) FROM public.empresa_config ec CROSS JOIN unnest(ARRAY['421','422','4699','629','19','10','1041','1042','12','122','18','20','33','39','63','65','75','40','40113','40114','42','49','68','676','69','70','76','776','403','407','411','621','627']::text[]) codes(code) WHERE upper(btrim(ec.pais))='PE' AND NOT EXISTS (SELECT 1 FROM public.plan_cuentas pc WHERE pc.tenant_id=ec.tenant_id AND pc.codigo=codes.code))
  );`;
}

export function assertPeru556Preserved(before, after) {
  for (const key of ['permissions', 'rolePermissions', 'tableSecurity', 'policies']) {
    assert.equal(after[key], before[key], `La migración alteró ${key}`);
  }
  for (const [id, hash] of Object.entries(before.accounts)) {
    assert.equal(after.accounts[id], hash, 'La migración alteró una cuenta previamente configurada');
  }
  assert.equal(after.schema, 556);
  assert.equal(after.ready, true);
  assert.equal(after.missingOperatingAccounts, 0);
  assert.equal(Object.keys(after.functions556).length, 2);
  assert.equal(after.triggers556, 1);
}

export function summarizePeru556State(state) {
  const { accounts, functions556, ...summary } = state;
  return { ...summary, accountCount: Object.keys(accounts).length, functions556: Object.keys(functions556).sort() };
}
