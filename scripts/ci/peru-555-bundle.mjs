import assert from 'node:assert/strict';

const quote = value => `'${value.replaceAll("'", "''")}'`;

export function buildPeru555Bundle(filename, body) {
  assert.match(filename, /^555__[^/\\]+\.sql$/);
  assert.equal((body.match(/^BEGIN;\s*$/gm) ?? []).length, 1);
  assert.equal((body.match(/^COMMIT;\s*$/gm) ?? []).length, 1);
  assert.match(body, /COMMIT;\s*$/);
  const statements = body.replace(/^BEGIN;\s*\r?\n/m, '').replace(/COMMIT;\s*$/, '');
  const name = filename.replace(/^555__/, '').replace(/\.sql$/, '');
  return `-- Promoción atómica 554 -> 555 desde la migración canónica.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.deployment_environment
    WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
    RAISE EXCEPTION 'PERU_555_WRONG_ENVIRONMENT';
  END IF;
  IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations
    WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 554 THEN
    RAISE EXCEPTION 'PERU_555_UNEXPECTED_HISTORY';
  END IF;
END;
$guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES ('555',ARRAY[${quote(body)}],${quote(name)});
DO $ready$
BEGIN
  IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version => 555)->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'PERU_555_READINESS_FAILED';
  END IF;
  IF NOT has_table_privilege('service_role','public.sucursales','SELECT,INSERT,UPDATE')
     OR NOT has_table_privilege('service_role','public.usuario_sucursales','SELECT,INSERT,DELETE') THEN
    RAISE EXCEPTION 'PERU_555_ACL_FAILED';
  END IF;
END;
$ready$;
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
}
