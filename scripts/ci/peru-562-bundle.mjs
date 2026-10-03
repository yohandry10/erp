import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru562Bundle(filename,body) {
  assert.equal(filename,'562__peru_tax_intents.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
  assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);
  assert.match(body,/COMMIT;\s*$/);
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  return `-- Promoción atómica 560 -> 562 desde la migración canónica.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
    RAISE EXCEPTION 'PERU_562_WRONG_ENVIRONMENT';
  END IF;
  IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 560
    OR to_regclass('public.tributos_operaciones_562') IS NOT NULL
    OR to_regprocedure('public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'PERU_562_UNEXPECTED_HISTORY_OR_EXISTING_WRITER';
  END IF;
END;
$guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES('562',ARRAY[${quote(body)}],'peru_tax_intents');
DO $ready$
BEGIN
  IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>562)->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'PERU_562_READINESS_FAILED';
  END IF;
  IF NOT has_function_privilege('service_role','public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.mutar_tributo_peru_tx(uuid,uuid,text,text,uuid,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'PERU_562_PRIVILEGES_INVALID';
  END IF;
END;
$ready$;
NOTIFY pgrst,'reload schema';
COMMIT;
`;
}
