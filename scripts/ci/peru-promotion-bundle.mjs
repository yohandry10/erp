import assert from 'node:assert/strict';

const literal = value => "'" + value.replaceAll("'", "''") + "'";

// Recibe exclusivamente las migraciones canónicas ya contrastadas con historia
// y respaldo. No conecta a ninguna base ni contiene credenciales o fixtures.
export function buildPeruPromotionBundle(migrations) {
  assert.deepEqual(migrations.map(item => item.version), Array.from({ length: 17 }, (_, i) => 537 + i));
  const parts = [
    '-- Promoción Perú 536 -> 553. Exige preflight PROD, respaldo fresco y CI verde.',
    '-- Generado desde supabase/migrations; no ejecutar verificadores con fixtures en PROD.',
    'BEGIN ISOLATION LEVEL REPEATABLE READ;',
    "SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s';",
    `DO $preflight$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM app.deployment_environment WHERE singleton
        AND environment='PROD' AND project_ref='wypnbcptofqdmoynlonq') THEN
        RAISE EXCEPTION 'PERU_PROMOTION_WRONG_DEPLOYMENT';
      END IF;
      IF (SELECT max(CASE WHEN version ~ '^[0-9]{1,9}$' THEN version::integer END)
        FROM supabase_migrations.schema_migrations) IS DISTINCT FROM 536 THEN
        RAISE EXCEPTION 'PERU_PROMOTION_UNEXPECTED_SCHEMA';
      END IF;
    END $preflight$;`,
  ];
  for (const { version, filename, body } of migrations) {
    assert.equal((body.match(/^BEGIN;[ \t]*\r?$/gm) || []).length, 1, `BEGIN inesperado: ${filename}`);
    assert.equal((body.match(/^COMMIT;[ \t]*\r?$/gm) || []).length, 1, `COMMIT inesperado: ${filename}`);
    assert.match(body, /COMMIT;\s*$/);
    const statement = body.replace(/^BEGIN;[ \t]*\r?\n/m, '').replace(/COMMIT;\s*$/, '');
    const name = filename.replace(/^\d+_/, '').replace(/\.sql$/, '');
    parts.push(`-- ${filename}\n${statement}`,
      `INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES (${literal(String(version))},ARRAY[${literal(body)}],${literal(name)});`);
  }
  parts.push(`DO $ready$ BEGIN
    IF NOT coalesce((public.outbox_runtime_health_492(p_required_schema_version => 553)->>'ready')::boolean,false) THEN
      RAISE EXCEPTION 'PERU_PROMOTION_READINESS_FAILED';
    END IF;
  END $ready$;`, "NOTIFY pgrst, 'reload schema';", 'COMMIT;');
  return parts.join('\n\n') + '\n';
}
