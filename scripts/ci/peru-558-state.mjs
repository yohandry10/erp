import assert from 'node:assert/strict';

// Se comparan huellas y metadatos en memoria. El resumen no publica filas ni IDs.
export function peru558StateSql(requiredSchema) {
  assert.ok([557, 558].includes(requiredSchema));
  return `SELECT json_build_object(
    'project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),
    'environment',(SELECT environment FROM app.deployment_environment WHERE singleton),
    'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
    'ready',coalesce((public.outbox_runtime_health_492(p_required_schema_version => ${requiredSchema})->>'ready')::boolean,false),
    'accounts',coalesce((SELECT jsonb_object_agg(id::text,jsonb_build_object('hash',md5(to_jsonb(t)::text),'pair',t.tenant_id::text||':'||t.codigo)) FROM public.plan_cuentas t),'{}'::jsonb),
    'missingPairs',coalesce((SELECT jsonb_agg(ec.tenant_id::text||':'||code ORDER BY ec.tenant_id,code) FROM public.empresa_config ec CROSS JOIN unnest(ARRAY['59','89']) codes(code) WHERE upper(btrim(ec.pais))='PE' AND NOT EXISTS(SELECT 1 FROM public.plan_cuentas pc WHERE pc.tenant_id=ec.tenant_id AND pc.codigo=code)),'[]'::jsonb),
    'existingData',jsonb_build_object(
      'entries',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.asientos_contables t),
      'details',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.detalle_asientos t),
      'periods',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.periodos_contables t),
      'intents',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.financial_master_operations t),
      'company',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.tenant_id),'')) FROM public.empresa_config t),
      'permissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.tenant_id,t.codigo),'')) FROM public.permisos t),
      'rolePermissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.role_id,t.permiso_id),'')) FROM public.rol_permisos t)),
    'tableSecurity',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app','auth','storage')),
    'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN ('public','app','auth','storage')),
    'existingFunctions',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl)::text,'' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','app') AND NOT (n.nspname='public' AND p.proname='balance_general_live') AND NOT (n.nspname='app' AND p.proname IN ('seed_peru_year_close_accounts_558','seed_peru_year_close_config_558'))),
    'balanceFunction',(SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'security',jsonb_build_array(p.prosecdef,p.provolatile,p.proconfig,p.proacl)) FROM pg_proc p WHERE p.oid='public.balance_general_live(uuid,integer,integer)'::regprocedure),
    'existingTriggers',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(t.oid),'' ORDER BY n.nspname,c.relname,t.tgname),'')) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','app') AND t.tgname<>'trg_seed_peru_year_close_accounts_558'),
    'functions558',coalesce((SELECT jsonb_object_agg(p.proname,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('seed_peru_year_close_accounts_558','seed_peru_year_close_config_558')),'{}'::jsonb),
    'trigger558',(SELECT count(*) FROM pg_trigger WHERE tgname='trg_seed_peru_year_close_accounts_558' AND tgrelid='public.empresa_config'::regclass),
    'privilegesValid',CASE WHEN to_regprocedure('app.seed_peru_year_close_accounts_558(uuid)') IS NULL THEN false ELSE
      NOT has_function_privilege('service_role','app.seed_peru_year_close_accounts_558(uuid)','EXECUTE')
      AND NOT has_function_privilege('anon','app.seed_peru_year_close_accounts_558(uuid)','EXECUTE')
      AND NOT has_function_privilege('authenticated','app.seed_peru_year_close_accounts_558(uuid)','EXECUTE')
      AND NOT has_function_privilege('service_role','app.seed_peru_year_close_config_558()','EXECUTE')
      AND NOT has_function_privilege('anon','app.seed_peru_year_close_config_558()','EXECUTE')
      AND NOT has_function_privilege('authenticated','app.seed_peru_year_close_config_558()','EXECUTE')
      AND has_function_privilege('service_role','public.balance_general_live(uuid,integer,integer)','EXECUTE')
      AND NOT has_function_privilege('anon','public.balance_general_live(uuid,integer,integer)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.balance_general_live(uuid,integer,integer)','EXECUTE') END
  );`;
}

export function assertPeru558Preserved(before, after) {
  for (const name of ['existingData', 'tableSecurity', 'policies', 'existingFunctions', 'existingTriggers']) {
    assert.deepEqual(after[name], before[name], `La migración alteró ${name}`);
  }
  for (const [id, account] of Object.entries(before.accounts)) assert.deepEqual(after.accounts[id], account, 'Cuenta existente modificada');
  const added = Object.entries(after.accounts).filter(([id]) => !(id in before.accounts)).map(([, account]) => account.pair).sort();
  assert.deepEqual(added, before.missingPairs.slice().sort(), 'Sólo deben nacer los códigos PE 59/89 previamente ausentes');
  assert.deepEqual(after.missingPairs, []);
  const previous = "abs(COALESCE(sum(CASE WHEN codigo ~ '^(56|57|58|59)' THEN least(saldo, 0) ELSE 0 END), 0))";
  const corrected = "COALESCE(sum(CASE WHEN codigo ~ '^(56|57|58|59)' THEN -saldo ELSE 0 END), 0)";
  const normalize = value => value.replaceAll('\r\n', '\n');
  assert.equal(normalize(before.balanceFunction.definition).split(previous).length, 2, 'La función anterior debe tener la expresión conocida');
  assert.equal(normalize(after.balanceFunction.definition), normalize(before.balanceFunction.definition).replace(previous, corrected), 'El reporte sólo debe cambiar el signo de resultados acumulados');
  assert.deepEqual(after.balanceFunction.security, before.balanceFunction.security, 'ACL y atributos del reporte deben conservarse');
  assert.equal(after.schema, 558);
  assert.equal(after.ready, true);
  assert.equal(after.privilegesValid, true);
  assert.equal(after.trigger558, 1);
  assert.equal(Object.keys(after.functions558).length, 2);
}

export function summarizePeru558State(state) {
  const { accounts, missingPairs, existingData, existingFunctions, existingTriggers, tableSecurity, policies, balanceFunction, functions558, ...summary } = state;
  return { ...summary, accountCount: Object.keys(accounts).length, missingClosingAccounts: missingPairs.length,
    comparedData: Object.keys(existingData).sort(), functions558: Object.keys(functions558).sort() };
}
