import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru563Bundle(filename,body){
 assert.equal(filename,'563__consolidation_report_read_privileges.sql');
 assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);assert.match(body,/COMMIT;\s*$/);
 const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
 return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN RAISE EXCEPTION 'PERU_563_WRONG_ENVIRONMENT'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 562 THEN RAISE EXCEPTION 'PERU_563_UNEXPECTED_HISTORY'; END IF;
END $guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('563',ARRAY[${quote(body)}],'consolidation_report_read_privileges');
DO $ready$ DECLARE source regclass; BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>563)->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PERU_563_READINESS_FAILED'; END IF;
 FOREACH source IN ARRAY ARRAY['public.mapeos_cuentas_consolidacion'::regclass,'public.tipos_cambio_consolidacion'::regclass,'public.ajustes_consolidacion'::regclass] LOOP
  IF NOT has_table_privilege('service_role',source,'SELECT') OR has_table_privilege('service_role',source,'INSERT') OR has_table_privilege('service_role',source,'UPDATE') OR has_table_privilege('service_role',source,'DELETE') OR has_table_privilege('service_role',source,'TRUNCATE') OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=source) THEN RAISE EXCEPTION 'PERU_563_PRIVILEGES_INVALID'; END IF;
 END LOOP;
END $ready$;
NOTIFY pgrst,'reload schema'; COMMIT;
`;
}
