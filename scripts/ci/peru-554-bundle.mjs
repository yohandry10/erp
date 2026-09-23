import assert from 'node:assert/strict';

const quote = value => `'${value.replaceAll("'", "''")}'`;

export function buildPeru554Bundle(filename, body) {
  assert.match(filename, /^554__[^/\\]+\.sql$/);
  assert.equal((body.match(/^BEGIN;\s*$/gm) ?? []).length, 1);
  assert.equal((body.match(/^COMMIT;\s*$/gm) ?? []).length, 1);
  assert.match(body, /COMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/);
  const statements = body.replace(/^BEGIN;\s*\r?\n/m, '')
    .replace(/COMMIT;\s*NOTIFY pgrst, 'reload schema';\s*$/, '');
  const name = filename.replace(/^554__/, '').replace(/\.sql$/, '');
  return `-- Promoción atómica 553 -> 554 desde la migración canónica.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.deployment_environment
    WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
    RAISE EXCEPTION 'PERU_554_WRONG_ENVIRONMENT';
  END IF;
  IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations
    WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 553 THEN
    RAISE EXCEPTION 'PERU_554_UNEXPECTED_HISTORY';
  END IF;
END;
$guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES ('554',ARRAY[${quote(body)}],${quote(name)});
DO $ready$
BEGIN
  IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version => 554)->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'PERU_554_READINESS_FAILED';
  END IF;
END;
$ready$;
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
}
