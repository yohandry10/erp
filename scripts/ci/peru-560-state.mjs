import assert from 'node:assert/strict';

export function peru560StateSql(requiredSchema) {
  assert.ok([559,560].includes(requiredSchema));
  const tables=['sucursales','usuario_sucursales','configuration_operation_intents','empresa_config',
    'centros_costo','tenants','usuarios_sistema','user_roles','roles','rol_permisos','permisos','audit_log',
    'documento_series','documentos','cajas','sesiones_caja','ventas_pos','almacenes','productos',
    'movimientos_inventario','producto_stock_sucursal','asientos_contables','detalle_asientos','plan_cuentas',
    'cuentas_bancarias','rrhh_peru_fichas_laborales','rrhh_peru_presentaciones_planilla'];
  const rows=tables.map(name=>`'${name}',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${name} t)`).join(',');
  return `SELECT json_build_object(
    'project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),
    'environment',(SELECT environment FROM app.deployment_environment WHERE singleton),
    'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
    'ready',coalesce((public.outbox_runtime_health_492(p_required_schema_version => ${requiredSchema})->>'ready')::boolean,false),
    'existingData',jsonb_build_object(${rows}),
    'tableSecurity',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app','auth','storage')),
    'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN ('public','app','auth','storage')),
    'existingFunctions',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl)::text,'' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','app') AND NOT (n.nspname='public' AND p.proname='mutar_sucursal_tx')),
    'existingTriggers',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(t.oid,true),'' ORDER BY t.tgrelid::regclass::text,t.tgname),'')) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','app')),
    'writer',(SELECT json_build_object('hash',md5(pg_get_functiondef(p.oid)),
      'guarded',position('SUCURSAL_PERMISSION_REQUIRED' IN p.prosrc)>0 AND position('configuration_intent_replay_464' IN p.prosrc)>0,
      'security',jsonb_build_array(p.prosecdef,p.provolatile,p.proacl,pg_get_userbyid(p.proowner),p.proconfig),
      'service',has_function_privilege('service_role',p.oid,'EXECUTE'),
      'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'))
      FROM pg_proc p WHERE p.oid=to_regprocedure('public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)'))
  );`;
}

export function assertPeru560Preserved(before,after) {
  for(const name of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers']) {
    assert.deepEqual(after[name],before[name],`La migración alteró ${name}`);
  }
  assert.equal(before.writer,null,'El writer no debe existir antes de 560');
  assert.equal(after.writer.guarded,true);
  assert.equal(after.writer.service,true);
  assert.equal(after.writer.anon,false);
  assert.equal(after.writer.authenticated,false);
  assert.equal(after.writer.security[0],true);
  assert.equal(after.writer.security[1],'v');
  assert.equal(after.writer.security[3],'postgres');
  assert.deepEqual(after.writer.security[4],['search_path=pg_catalog, public, app, extensions, pg_temp']);
  assert.equal(after.schema,560);assert.equal(after.ready,true);
}

export function summarizePeru560State(state) {
  const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,...summary}=state;
  return {...summary,comparedData:Object.keys(existingData).sort()};
}
