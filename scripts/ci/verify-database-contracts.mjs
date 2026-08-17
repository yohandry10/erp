import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../..");
const migrationsDir = path.join(rootDir, "supabase", "migrations");
const verifiersDir = path.join(rootDir, "supabase", "verify");
const planOnly = process.argv.includes("--plan");
const migrationPattern = /^(\d{3,})__.+\.sql$/;

const verifierFloor = Number.parseInt(
  process.env.SQL_VERIFY_FLOOR ?? "491",
  10,
);

function fail(message) {
  throw new Error(`[database-contracts] ${message}`);
}

function discover(directory, kind) {
  const sqlEntries = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"));
  const invalidNames = sqlEntries.filter(
    (entry) => !migrationPattern.test(entry.name),
  );
  if (kind === "migraciones" && invalidNames.length > 0) {
    fail(
      `migraciones fuera del contrato NNN__nombre.sql: ${invalidNames.map(({ name }) => name).join(", ")}`,
    );
  }

  const entries = sqlEntries
    .map((entry) => {
      const match = entry.name.match(migrationPattern);
      return match
        ? {
            version: Number.parseInt(match[1], 10),
            versionText: match[1],
            name: entry.name,
            file: path.join(directory, entry.name),
          }
        : null;
    })
    .filter(Boolean);

  const byVersion = new Map();
  for (const entry of entries) {
    const matches = byVersion.get(entry.version) ?? [];
    matches.push(entry);
    byVersion.set(entry.version, matches);
  }
  const duplicates = [...byVersion.entries()].filter(
    ([, matches]) => matches.length > 1,
  );
  if (duplicates.length > 0) {
    fail(
      `${kind} con prefijo duplicado: ${duplicates.map(([version, matches]) => `${version} (${matches.map((entry) => entry.name).join(", ")})`).join("; ")}`,
    );
  }

  return entries.sort(
    (left, right) =>
      left.version - right.version || left.name.localeCompare(right.name),
  );
}

const migrations = discover(migrationsDir, "migraciones");
const verifiers = discover(verifiersDir, "verificadores");
if (migrations.length === 0) fail("no se encontraron migraciones");
if (!Number.isInteger(verifierFloor) || verifierFloor < 0)
  fail("SQL_VERIFY_FLOOR debe ser un entero positivo");

const verifierByVersion = new Map(
  verifiers.map((entry) => [entry.version, entry]),
);
const latestMigration = migrations.at(-1).version;
const requiredSchemaVersion = Number.parseInt(
  process.env.REQUIRED_DATABASE_SCHEMA_VERSION ?? String(latestMigration),
  10,
);
if (
  !Number.isInteger(requiredSchemaVersion) ||
  requiredSchemaVersion !== latestMigration
) {
  fail(
    `REQUIRED_DATABASE_SCHEMA_VERSION debe coincidir con la última migración (${latestMigration}), recibido: ${process.env.REQUIRED_DATABASE_SCHEMA_VERSION ?? "(vacío)"}`,
  );
}

const renderBlueprint = fs.readFileSync(
  path.join(rootDir, "render.yaml"),
  "utf8",
);
const renderSchemaMatch = renderBlueprint.match(
  /-\s+key:\s*REQUIRED_DATABASE_SCHEMA_VERSION\s*\r?\n\s+value:\s*["']?(\d+)["']?/,
);
if (Number.parseInt(renderSchemaMatch?.[1] ?? "", 10) !== latestMigration) {
  fail(
    `render.yaml debe exigir el esquema ${latestMigration}, recibido: ${renderSchemaMatch?.[1] ?? "(ausente)"}`,
  );
}
if (!/^\s*autoDeployTrigger:\s*checksPass\s*$/m.test(renderBlueprint)) {
  fail("Render debe esperar a que los checks de CI pasen antes de desplegar");
}
if (/^\s*plan:\s*free\s*$/m.test(renderBlueprint)) {
  fail("Render no puede dormir la API que ejecuta workers/outbox");
}

const requiredNewVersions = migrations
  .filter(({ version }) => version >= verifierFloor)
  .map(({ version }) => version);

for (const version of requiredNewVersions) {
  if (!verifierByVersion.has(version)) {
    fail(
      `la migración ${version} no tiene un verificador SQL con el mismo prefijo`,
    );
  }
}

const selectedVersions = [...new Set(requiredNewVersions)].sort(
  (left, right) => left - right,
);
const selectedVerifiers = selectedVersions.map((version) => {
  const verifier = verifierByVersion.get(version);
  if (!verifier) fail(`falta el verificador de regresión ${version}`);
  return verifier;
});

const plan = {
  postgres: 16,
  latestMigration,
  requiredSchemaVersion,
  migrationCount: migrations.length,
  verifierFloor,
  verifiers: selectedVerifiers.map(({ name }) => name),
};

if (planOnly) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

if (process.env.E2E_EPHEMERAL_LOCAL_DB !== "1") {
  fail(
    "E2E_EPHEMERAL_LOCAL_DB=1 es obligatorio; esta tarea nunca opera una base remota",
  );
}

const host = process.env.PGHOST ?? "127.0.0.1";
const port = process.env.PGPORT ?? "5432";
const user = process.env.PGUSER ?? "postgres";
const database = process.env.PGDATABASE ?? "";
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!allowedHosts.has(host)) fail(`PGHOST debe ser local, recibido: ${host}`);
if (database !== "erp_e2e")
  fail(
    `PGDATABASE debe ser exactamente erp_e2e, recibido: ${database || "(vacío)"}`,
  );

const psql = process.env.PSQL_BIN ?? "psql";
const baseArgs = [
  "-X",
  "--set",
  "ON_ERROR_STOP=1",
  "-h",
  host,
  "-p",
  port,
  "-U",
  user,
  "-d",
  database,
];

function runPsql(args, description, { capture = false, input } = {}) {
  const result = spawnSync(psql, [...baseArgs, ...args], {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
    input,
    stdio:
      input === undefined
        ? capture
          ? ["ignore", "pipe", "pipe"]
          : "inherit"
        : ["pipe", capture ? "pipe" : "inherit", capture ? "pipe" : "inherit"],
  });
  if (result.error) fail(`${description}: ${result.error.message}`);
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    fail(`${description} terminó con código ${result.status}`);
  }
  return capture ? String(result.stdout ?? "").trim() : "";
}

const preflight = runPsql(
  [
    "--no-align",
    "--tuples-only",
    "-c",
    "SELECT current_database() || '|' || current_setting('server_version_num') || '|' || (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public');",
  ],
  "preflight PostgreSQL",
  { capture: true },
);
const [actualDatabase, serverVersionRaw, publicTableCountRaw] =
  preflight.split("|");
const serverVersion = Number.parseInt(serverVersionRaw, 10);
const publicTableCount = Number.parseInt(publicTableCountRaw, 10);
if (actualDatabase !== "erp_e2e")
  fail(`la conexión resolvió la base inesperada ${actualDatabase}`);
if (
  !Number.isInteger(serverVersion) ||
  serverVersion < 160000 ||
  serverVersion >= 170000
) {
  fail(`se requiere PostgreSQL 16, server_version_num=${serverVersionRaw}`);
}
if (publicTableCount !== 0) {
  fail(
    `erp_e2e no está limpia (${publicTableCountRaw} tablas públicas); cree una base local efímera nueva`,
  );
}

runPsql(
  [
    "-c",
    "DO $bootstrap$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $bootstrap$;",
  ],
  "bootstrap de roles Supabase locales",
);

for (const migration of migrations) {
  process.stdout.write(`[database-contracts] apply ${migration.name}\n`);
  runPsql(["--file", migration.file], `migración ${migration.name}`, {
    capture: true,
  });
}

const migrationHistoryValues = migrations
  .map(
    ({ versionText, name }) =>
      `('${versionText}', ARRAY['CI fresh-chain ${name.replaceAll("'", "''")}'], '${name.replaceAll("'", "''")}')`,
  )
  .join(",\n");
runPsql([], "registro local del historial de migraciones", {
  capture: true,
  input: `
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[] NOT NULL DEFAULT '{}'::text[],
      name text
    );
    INSERT INTO supabase_migrations.schema_migrations(version, statements, name)
    VALUES ${migrationHistoryValues}
    ON CONFLICT (version) DO UPDATE
    SET statements = EXCLUDED.statements, name = EXCLUDED.name;
  `,
});

for (const verifier of selectedVerifiers) {
  process.stdout.write(`[database-contracts] verify ${verifier.name}\n`);
  runPsql(["--file", verifier.file], `verificador ${verifier.name}`);
}

runPsql([], `readiness del esquema requerido ${requiredSchemaVersion}`, {
  capture: true,
  input: `
      DO $schema_gate$
      DECLARE v_health jsonb;
      BEGIN
        v_health := public.outbox_runtime_health_492(5000, 900, 100, 900, ${requiredSchemaVersion});
        IF coalesce((v_health->>'ready')::boolean, false) IS DISTINCT FROM true
           OR coalesce((v_health #>> '{contract,required_schema_applied}')::boolean, false) IS DISTINCT FROM true
           OR coalesce((v_health #>> '{contract,schema_version}')::integer, 0) < ${requiredSchemaVersion} THEN
          RAISE EXCEPTION 'CI_REQUIRED_SCHEMA_UNREADY:%', v_health;
        END IF;
      END
      $schema_gate$;
    `,
});

process.stdout.write(
  `[database-contracts] OK PostgreSQL 16: ${migrations.length} migraciones hasta ${latestMigration}, ${selectedVerifiers.length} verificadores\n`,
);
