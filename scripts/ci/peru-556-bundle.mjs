import assert from 'node:assert/strict';

const quote = value => `'${value.replaceAll("'", "''")}'`;

export function buildPeru556Bundle(filename, body) {
  assert.match(filename, /^556__[^/\\]+\.sql$/);
  assert.equal((body.match(/^BEGIN;\s*$/gm) ?? []).length, 1);
  assert.equal((body.match(/^COMMIT;\s*$/gm) ?? []).length, 1);
  assert.match(body, /COMMIT;\s*$/);
  const statements = body.replace(/^BEGIN;\s*\r?\n/m, '').replace(/COMMIT;\s*$/, '');
  const name = filename.replace(/^556__/, '').replace(/\.sql$/, '');
  return `-- Promoción atómica 555 -> 556 desde la migración canónica.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.deployment_environment
    WHERE singleton AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
    RAISE EXCEPTION 'PERU_556_WRONG_ENVIRONMENT';
  END IF;
  IF (SELECT max(version::integer) FROM supabase_migrations.schema_migrations
    WHERE version ~ '^[0-9]{1,9}$') IS DISTINCT FROM 555 THEN
    RAISE EXCEPTION 'PERU_556_UNEXPECTED_HISTORY';
  END IF;
END;
$guard$;
${statements}
INSERT INTO supabase_migrations.schema_migrations(version,statements,name)
VALUES ('556',ARRAY[${quote(body)}],${quote(name)});
DO $ready$
BEGIN
  IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version => 556)->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'PERU_556_READINESS_FAILED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.empresa_config ec
    CROSS JOIN unnest(ARRAY['421','422','4699','629','19','10','1041','1042','12','122','18','20','33','39','63','65','75','40','40113','40114','42','49','68','676','69','70','76','776','403','407','411','621','627']::text[]) codes(code)
    WHERE upper(btrim(ec.pais))='PE' AND NOT EXISTS (
      SELECT 1 FROM public.plan_cuentas pc WHERE pc.tenant_id=ec.tenant_id AND pc.codigo=codes.code)) THEN
    RAISE EXCEPTION 'PERU_556_OPERATIONAL_ACCOUNTS_MISSING';
  END IF;
END;
$ready$;
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
}
