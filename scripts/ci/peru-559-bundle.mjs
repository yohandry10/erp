import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru559Bundle(filename,body) {
  assert.equal(filename,'559__peru_plame_package_idempotency.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
  assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);
  assert.match(body,/COMMIT;\s*$/);
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  return `-- Promoción atómica 558 -> 559 desde la migración canónica.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $guard$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
    RAISE EXCEPTION 'PERU_559_WRONG_ENVIRONMENT';
  END IF;
  IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 558 THEN
    RAISE EXCEPTION 'PERU_559_UNEXPECTED_HISTORY';
  END IF;
END;
$guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES('559',ARRAY[${quote(body)}],'peru_plame_package_idempotency');
DO $ready$
BEGIN
  IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>559)->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'PERU_559_READINESS_FAILED';
  END IF;
  IF NOT has_function_privilege('service_role','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','app.guardar_rrhh_peru_presentacion_tx(uuid,uuid,jsonb)','EXECUTE')
    OR has_table_privilege('service_role','public.rrhh_operaciones_475','INSERT') THEN
    RAISE EXCEPTION 'PERU_559_PRIVILEGES_INVALID';
  END IF;
END;
$ready$;
NOTIFY pgrst,'reload schema';
COMMIT;
`;
}
