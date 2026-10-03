import assert from 'node:assert/strict';

// Las huellas de filas y funciones se comparan en memoria, sin publicar datos.
export function peru557StateSql(requiredSchema) {
  assert.ok([556, 557].includes(requiredSchema));
  return `SELECT json_build_object(
    'project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),
    'environment',(SELECT environment FROM app.deployment_environment WHERE singleton),
    'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
    'ready',coalesce((public.outbox_runtime_health_492(p_required_schema_version => ${requiredSchema})->>'ready')::boolean,false),
    'existingData',jsonb_build_object(
      'accounts',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.plan_cuentas t),
      'entries',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.asientos_contables t),
      'details',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.detalle_asientos t),
      'intents',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.financial_master_operations t),
      'periods',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM public.periodos_contables t),
      'permissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.tenant_id,t.codigo),'')) FROM public.permisos t),
      'rolePermissions',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.role_id,t.permiso_id),'')) FROM public.rol_permisos t)),
    'tableSecurity',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app','auth','storage')),
    'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN ('public','app','auth','storage')),
    'existingFunctions',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl)::text,'' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','app') AND p.proname NOT IN ('crear_asiento_manual_tx','crear_asiento_manual_tx_557','reabrir_periodo_contable_admin_tx')),
    'functions557',coalesce((SELECT jsonb_object_agg(n.nspname||'.'||p.proname,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='app' AND p.proname='crear_asiento_manual_tx_557') OR (n.nspname='public' AND p.proname IN ('crear_asiento_manual_tx','reabrir_periodo_contable_admin_tx'))),'{}'::jsonb),
    'manualPrivilegesValid',CASE WHEN to_regprocedure('public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)') IS NULL THEN false ELSE
      has_function_privilege('service_role','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
      AND NOT has_function_privilege('anon','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
      AND NOT has_function_privilege('service_role','app.crear_asiento_manual_tx_557(uuid,uuid,jsonb,text)','EXECUTE') END,
    'adminPrivilegesValid',CASE WHEN to_regprocedure('public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)') IS NULL THEN false ELSE
      has_function_privilege('service_role','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE')
      AND NOT has_function_privilege('anon','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE') END
  );`;
}

export function assertPeru557Preserved(before, after) {
  for (const name of ['existingData', 'tableSecurity', 'policies', 'existingFunctions']) {
    assert.deepEqual(after[name], before[name], `La migración alteró ${name}`);
  }
  assert.equal(after.schema, 557);
  assert.equal(after.ready, true);
  assert.equal(after.manualPrivilegesValid, true);
  assert.equal(after.adminPrivilegesValid, true);
  assert.equal(Object.keys(after.functions557).length, 3);
}

export function summarizePeru557State(state) {
  const { existingData, existingFunctions, tableSecurity, policies, functions557, ...summary } = state;
  return { ...summary, comparedData: Object.keys(existingData).sort(),
    functions557: Object.keys(functions557).sort() };
}
