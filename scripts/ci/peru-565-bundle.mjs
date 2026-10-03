import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru565Bundle(filename,body) {
  assert.equal(filename,'565__peru_direct_cpe_intents.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
  assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);assert.match(body,/COMMIT;\s*$/);
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN RAISE EXCEPTION 'PERU_565_WRONG_ENVIRONMENT'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 564 THEN RAISE EXCEPTION 'PERU_565_UNEXPECTED_HISTORY'; END IF;
END $guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('565',ARRAY[${quote(body)}],'peru_direct_cpe_intents');
DO $ready$ BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>565)->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PERU_565_READINESS_FAILED'; END IF;
 IF to_regprocedure('public.emitir_cpe_directo_peru_tx(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text)') IS NULL THEN RAISE EXCEPTION 'PERU_565_DIRECT_CPE_BOUNDARY_MISSING'; END IF;
END $ready$;
NOTIFY pgrst,'reload schema'; COMMIT;
`;
}
