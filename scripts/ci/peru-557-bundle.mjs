import assert from 'node:assert/strict';

const quote = value => `'${value.replaceAll("'", "''")}'`;

export function buildPeru557Bundle(filename, body) {
  assert.equal(filename, '557__manual_accounting_idempotency.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm) ?? []).length, 1);
  assert.equal((body.match(/^COMMIT;\s*$/gm) ?? []).length, 1);
  assert.match(body, /COMMIT;\s*$/);
  const statements = body.replace(/^BEGIN;\s*\r?\n/m, '').replace(/COMMIT;\s*$/, '');
  return `-- Promoción atómica 556 -> 557 desde la migración canónica.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.deployment_environment
    WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
    RAISE EXCEPTION 'PERU_557_WRONG_ENVIRONMENT';
  END IF;
  IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations
    WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 556 THEN
    RAISE EXCEPTION 'PERU_557_UNEXPECTED_HISTORY';
  END IF;
END;
$guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES ('557',ARRAY[${quote(body)}],'manual_accounting_idempotency');
DO $ready$
BEGIN
  IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version => 557)->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'PERU_557_READINESS_FAILED';
  END IF;
  IF NOT has_function_privilege('service_role','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
     OR has_function_privilege('anon','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.crear_asiento_manual_tx(uuid,uuid,jsonb,text)','EXECUTE')
     OR has_function_privilege('service_role','app.crear_asiento_manual_tx_557(uuid,uuid,jsonb,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PERU_557_PRIVILEGES_INVALID';
  END IF;
  IF NOT has_function_privilege('service_role','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.reabrir_periodo_contable_admin_tx(uuid,integer,integer,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'PERU_557_ADMIN_PRIVILEGES_INVALID';
  END IF;
END;
$ready$;
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
}
