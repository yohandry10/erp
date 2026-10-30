import assert from 'node:assert/strict';
export function buildPeru571Bundle(filename, body) {
  assert.equal(filename, '571__customer_update_durable_intents.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm) || []).length, 1);
  assert.equal((body.match(/^COMMIT;\s*$/gm) || []).length, 1);
  assert.match(body, /COMMIT;\s*$/);
  const statements = body.replace(/^BEGIN;\s*\r?\n/m, '').replace(/COMMIT;\s*$/, '');
  const literal = value => `'${value.replaceAll("'", "''")}'`;
  return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN RAISE EXCEPTION 'PERU_571_WRONG_ENVIRONMENT'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 570 THEN RAISE EXCEPTION 'PERU_571_UNEXPECTED_HISTORY'; END IF;
END $guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
 VALUES('571',ARRAY[${literal(body)}],'customer_update_durable_intents');
DO $ready$ BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>571)->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PERU_571_READINESS_FAILED'; END IF;
 IF to_regprocedure('public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)') IS NULL THEN RAISE EXCEPTION 'PERU_571_WRITER_MISSING'; END IF;
END $ready$;
NOTIFY pgrst,'reload schema'; COMMIT;
`;
}
