import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru569Bundle(filename,body) {
  assert.equal(filename,'569__peru_accounting_reconciliation_intents.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
  assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);assert.match(body,/COMMIT;\s*$/);
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN RAISE EXCEPTION 'PERU_569_WRONG_ENVIRONMENT'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 568 THEN RAISE EXCEPTION 'PERU_569_UNEXPECTED_HISTORY'; END IF;
END $guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('569',ARRAY[${quote(body)}],'peru_accounting_reconciliation_intents');
DO $ready$ BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>569)->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PERU_569_READINESS_FAILED'; END IF;
 IF to_regprocedure('public.conciliar_partidas_idempotente_tx_569(uuid,uuid,text,text,uuid,text,numeric,date,text,jsonb,numeric)') IS NULL THEN RAISE EXCEPTION 'PERU_569_RECONCILIATION_WRITER_MISSING'; END IF;
END $ready$;
NOTIFY pgrst,'reload schema'; COMMIT;
`;
}
