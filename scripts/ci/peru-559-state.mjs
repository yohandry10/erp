import assert from 'node:assert/strict';

// Sólo huellas y metadatos; las filas y definiciones permanecen en memoria.
export function peru559StateSql(requiredSchema) {
  assert.ok([558,559].includes(requiredSchema));
  const tables=['rrhh_operaciones_475','rrhh_peru_presentaciones_planilla','rrhh_peru_fichas_laborales',
    'planillas','empleado_planilla','empleados','contratos','pagos_empleados','rrhh_pagos','historial_pagos_planilla',
    'depositos_cts','liquidaciones','pagos_liquidaciones','cuentas_bancarias','asientos_contables','detalle_asientos',
    'plan_cuentas','audit_log','permisos','rol_permisos','user_roles','usuarios_sistema','empresa_config'];
  const rows=tables.map(name=>`'${name}',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${name} t)`).join(',');
  return `SELECT json_build_object(
    'project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),
    'environment',(SELECT environment FROM app.deployment_environment WHERE singleton),
    'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
    'ready',coalesce((public.outbox_runtime_health_492(p_required_schema_version => ${requiredSchema})->>'ready')::boolean,false),
    'existingData',jsonb_build_object(${rows}),
    'tableSecurity',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app','auth','storage')),
    'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN ('public','app','auth','storage')),
    'existingFunctions',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl)::text,'' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','app') AND p.proname<>'guardar_rrhh_peru_presentacion_tx'),
    'privateImplementation',(SELECT md5(jsonb_build_array(pg_get_functiondef(p.oid),p.prosecdef,p.provolatile,p.proconfig,p.prorettype::regtype::text)::text) FROM pg_proc p WHERE p.oid='app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)'::regprocedure),
    'existingTriggers',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(t.oid),'' ORDER BY n.nspname,c.relname,t.tgname),'')) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','app')),
    'wrapper',(SELECT jsonb_build_object('hash',md5(pg_get_functiondef(p.oid)),
      'guarded',position('PLAME_IDEMPOTENCY_CONFLICT' IN pg_get_functiondef(p.oid))>0 AND position('PERU_PACKAGE_CREATE' IN pg_get_functiondef(p.oid))>0 AND position('app.assert_rrhh_permission_495' IN pg_get_functiondef(p.oid))>0,
      'security',jsonb_build_array(p.prosecdef,p.provolatile,p.proacl,p.prorettype::regtype::text))
      FROM pg_proc p WHERE p.oid='public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)'::regprocedure),
    'privilegesValid',has_function_privilege('service_role','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
      AND NOT has_function_privilege('anon','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
      AND NOT has_function_privilege('service_role','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
      AND NOT has_function_privilege('anon','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
      AND NOT has_function_privilege('authenticated','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
      AND NOT has_table_privilege('service_role','public.rrhh_operaciones_475','INSERT')
      AND NOT has_table_privilege('authenticated','public.rrhh_operaciones_475','SELECT'),
    'privileges',jsonb_build_object(
      'wrapperService',has_function_privilege('service_role','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE'),
      'wrapperAnon',has_function_privilege('anon','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE'),
      'wrapperAuthenticated',has_function_privilege('authenticated','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE'),
      'privateService',has_function_privilege('service_role','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE'),
      'privateAnon',has_function_privilege('anon','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE'),
      'privateAuthenticated',has_function_privilege('authenticated','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE'),
      'intentServiceInsert',has_table_privilege('service_role','public.rrhh_operaciones_475','INSERT'),
      'intentAuthenticatedSelect',has_table_privilege('authenticated','public.rrhh_operaciones_475','SELECT'))
  );`;
}

export function assertPeru559Preserved(before,after) {
  for(const name of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers','privateImplementation']) {
    assert.deepEqual(after[name],before[name],`La migración alteró ${name}`);
  }
  assert.deepEqual(after.wrapper.security,before.wrapper.security,'La seguridad del wrapper cambió');
  assert.notEqual(after.wrapper.hash,before.wrapper.hash,'La implementación del wrapper debe cambiar');
  assert.equal(after.wrapper.guarded,true);
  assert.equal(after.schema,559);assert.equal(after.ready,true);assert.equal(after.privilegesValid,true);
}

export function summarizePeru559State(state) {
  const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,...summary}=state;
  return {...summary,comparedData:Object.keys(existingData).sort()};
}
