import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru560Bundle(filename,body) {
  assert.equal(filename,'560__sucursales_atomic_recovery.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
  assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);
  assert.match(body,/COMMIT;\s*$/);
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  return `-- Promoción atómica 559 -> 560 desde la migración canónica.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
    RAISE EXCEPTION 'PERU_560_WRONG_ENVIRONMENT';
  END IF;
  IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 559
    OR to_regprocedure('public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'PERU_560_UNEXPECTED_HISTORY_OR_EXISTING_WRITER';
  END IF;
END;
$guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES('560',ARRAY[${quote(body)}],'sucursales_atomic_recovery');
DO $ready$
BEGIN
  IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>560)->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'PERU_560_READINESS_FAILED';
  END IF;
  IF NOT has_function_privilege('service_role','public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.mutar_sucursal_tx(uuid,uuid,text,text,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'PERU_560_PRIVILEGES_INVALID';
  END IF;
END;
$ready$;
NOTIFY pgrst,'reload schema';
COMMIT;
`;
}
