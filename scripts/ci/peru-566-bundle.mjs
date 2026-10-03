import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru566Bundle(filename,body) {
  assert.equal(filename,'566__peru_cash_first_client_account.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
  assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);assert.match(body,/COMMIT;\s*$/);
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN RAISE EXCEPTION 'PERU_566_WRONG_ENVIRONMENT'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 565 THEN RAISE EXCEPTION 'PERU_566_UNEXPECTED_HISTORY'; END IF;
END $guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('566',ARRAY[${quote(body)}],'peru_cash_first_client_account');
DO $ready$ BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>566)->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PERU_566_READINESS_FAILED'; END IF;
 IF to_regprocedure('app.seed_peru_cash_account_config_566()') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.empresa_config'::regclass AND tgname='seed_peru_cash_account_config_566' AND tgenabled='O') THEN RAISE EXCEPTION 'PERU_566_CASH_ACCOUNT_TRIGGER_MISSING'; END IF;
 IF NOT has_table_privilege('service_role','public.cambios_turno','SELECT') OR NOT has_table_privilege('service_role','public.retiros_caja','SELECT') THEN RAISE EXCEPTION 'PERU_566_CASH_READS_MISSING'; END IF;
END $ready$;
NOTIFY pgrst,'reload schema'; COMMIT;
`;
}
