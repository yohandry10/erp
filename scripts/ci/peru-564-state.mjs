import assert from 'node:assert/strict';
const sources=['ajustes_consolidacion','mapeos_cuentas_consolidacion','tipos_cambio_consolidacion'];
export function peru564StateSql(requiredSchema){
 assert.ok([563,564].includes(requiredSchema));
 const tables=['metodos_pago','sucursales','usuario_sucursales','configuration_operation_intents','empresa_config','centros_costo','tenants','usuarios_sistema','user_roles','roles','rol_permisos','permisos','audit_log','documento_series','documentos','cajas','sesiones_caja','ventas_pos','almacenes','productos','movimientos_inventario','producto_stock_sucursal','asientos_contables','detalle_asientos','plan_cuentas','cuentas_bancarias','rrhh_peru_fichas_laborales','rrhh_peru_presentaciones_planilla','tributos_declaraciones_mensuales','tributos_declaraciones_anuales','tributos_operaciones_562','grupos_consolidacion','grupos_consolidacion_miembros','reportes_contables_configurables','reportes_contables_lineas',...sources];
 const rows=tables.map(name=>`'${name}',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) FROM public.${name} t)`).join(',');
 const targetList=sources.map(s=>`'${s}'`).join(',');
 return `SELECT json_build_object(
 'project',(SELECT project_ref FROM app.deployment_environment WHERE singleton),'environment',(SELECT environment FROM app.deployment_environment WHERE singleton),
 'schema',(SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$'),
 'ready',coalesce((public.outbox_runtime_health_492(p_required_schema_version=>${requiredSchema})->>'ready')::boolean,false),
 'existingData',jsonb_build_object(${rows}),
 'tableSecurity',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl)::text,'' ORDER BY n.nspname,c.relname),'')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p') AND n.nspname IN('public','app','auth','storage')),
 'policies',(SELECT md5(coalesce(string_agg(to_jsonb(p)::text,'' ORDER BY p.schemaname,p.tablename,p.policyname),'')) FROM pg_policies p WHERE schemaname IN('public','app','auth','storage')),
 'existingFunctions',(SELECT md5(coalesce(string_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl)::text,'' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN('public','app') AND NOT (n.nspname='app' AND p.proname='seed_pos_payment_catalog_564') AND NOT (n.nspname='public' AND p.proname='configurar_certificado_pos_tx')),
 'existingTriggers',(SELECT md5(coalesce(string_agg(pg_get_triggerdef(t.oid,true),'' ORDER BY t.tgrelid::regclass::text,t.tgname),'')) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN('public','app') AND t.tgname<>'seed_pos_payment_catalog_564'),
 'posBoundary',(SELECT json_build_object('security',jsonb_build_array(p.prosecdef,p.provolatile,pg_get_userbyid(p.proowner),p.proconfig),'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'guarded',position('POS_CERTIFICATE_PERMISSION_REQUIRED' IN p.prosrc)>0 AND position('configuration_intent_replay_464' IN p.prosrc)>0 AND position('configuration_intent_finish_464' IN p.prosrc)>0,'hash',md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE p.oid=to_regprocedure('public.configurar_certificado_pos_tx(uuid,uuid,text,text,bytea,text,timestamp with time zone)')),
 'catalogTrigger',(SELECT count(*) FROM pg_trigger WHERE tgrelid='public.empresa_config'::regclass AND tgname='seed_pos_payment_catalog_564' AND tgenabled='O'),
 'readSources',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
   'serviceRead',has_table_privilege('service_role',c.oid,'SELECT'),'serviceWrite',has_table_privilege('service_role',c.oid,'INSERT') OR has_table_privilege('service_role',c.oid,'UPDATE') OR has_table_privilege('service_role',c.oid,'DELETE') OR has_table_privilege('service_role',c.oid,'TRUNCATE'),
   'anonRead',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedRead',has_table_privilege('authenticated',c.oid,'SELECT'),
   'acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]') FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a)
  ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN(${targetList}))
 );`;
}
export function assertPeru564Preserved(before,after){
 for(const key of ['existingData','tableSecurity','policies','existingFunctions','existingTriggers','readSources'])assert.deepEqual(after[key],before[key],`La migración alteró ${key}`);
 assert.equal(before.posBoundary,null);assert.equal(before.catalogTrigger,0);
 assert.equal(after.catalogTrigger,1);assert.equal(after.posBoundary.guarded,true);
 assert.equal(after.posBoundary.service,true);assert.equal(after.posBoundary.anon,false);assert.equal(after.posBoundary.authenticated,false);assert.equal(after.posBoundary.public,false);
 assert.deepEqual(after.posBoundary.security,[true,'v','postgres',['search_path=pg_catalog, public, app, extensions, pg_temp']]);
 assert.equal(after.schema,564);assert.equal(after.ready,true);
}
export function summarizePeru564State(state){const {existingData,existingFunctions,existingTriggers,tableSecurity,policies,readSources,...summary}=state;return {...summary,comparedData:Object.keys(existingData).sort()};}
