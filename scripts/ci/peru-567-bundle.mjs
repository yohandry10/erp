import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru567Bundle(filename,body) {
  assert.equal(filename,'567__peru_sales_creation_intents.sql');
  assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
  assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);assert.match(body,/COMMIT;\s*$/);
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN RAISE EXCEPTION 'PERU_567_WRONG_ENVIRONMENT'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 566 THEN RAISE EXCEPTION 'PERU_567_UNEXPECTED_HISTORY'; END IF;
END $guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('567',ARRAY[${quote(body)}],'peru_sales_creation_intents');
DO $ready$ BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>567)->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PERU_567_READINESS_FAILED'; END IF;
 IF to_regprocedure('public.crear_cotizacion_idempotente_tx_567(uuid,uuid,text,text,uuid,date,text,text,text,numeric,numeric,numeric,jsonb)') IS NULL
  OR to_regprocedure('public.crear_pedido_idempotente_tx_567(uuid,uuid,text,text,jsonb,jsonb,jsonb)') IS NULL THEN RAISE EXCEPTION 'PERU_567_SALES_BOUNDARY_MISSING'; END IF;
 IF NOT has_table_privilege('service_role','public.v_kpis_sunat_multitenant','SELECT') THEN RAISE EXCEPTION 'PERU_567_KPI_READ_MISSING'; END IF;
END $ready$;
NOTIFY pgrst,'reload schema'; COMMIT;
`;
}
