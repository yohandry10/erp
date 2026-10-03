import assert from 'node:assert/strict';
const quote=value=>`'${value.replaceAll("'","''")}'`;
export function buildPeru564Bundle(filename,body){
 assert.equal(filename,'564__pos_first_client_readiness.sql');
 assert.equal((body.match(/^BEGIN;\s*$/gm)||[]).length,1);
 assert.equal((body.match(/^COMMIT;\s*$/gm)||[]).length,1);assert.match(body,/COMMIT;\s*$/);
 const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
 return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.deployment_environment WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN RAISE EXCEPTION 'PERU_564_WRONG_ENVIRONMENT'; END IF;
 IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 563 THEN RAISE EXCEPTION 'PERU_564_UNEXPECTED_HISTORY'; END IF;
END $guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('564',ARRAY[${quote(body)}],'pos_first_client_readiness');
DO $ready$ BEGIN
 IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version=>564)->>'ready')::boolean,false) THEN RAISE EXCEPTION 'PERU_564_READINESS_FAILED'; END IF;
 IF to_regprocedure('public.configurar_certificado_pos_tx(uuid,uuid,text,text,bytea,text,timestamp with time zone)') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.empresa_config'::regclass AND tgname='seed_pos_payment_catalog_564' AND tgenabled='O') THEN RAISE EXCEPTION 'PERU_564_POS_BOUNDARY_MISSING'; END IF;
END $ready$;
NOTIFY pgrst,'reload schema'; COMMIT;
`;
}
