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

// El propio workflow fija REQUIRED_DATABASE_SCHEMA_VERSION a mano, y esa copia
// también tiene que cuadrar con la última migración. No estaba comprobada, y por
// eso derivó: al promover la 499 y la 500 se actualizaron render.yaml y los
// valores por defecto del código, pero no el workflow, que se quedó en 498. En
// local no se nota —sin la variable en el entorno, la compuerta toma la última
// migración por defecto y pasa—, así que el fallo sólo aparecía en CI. Aquí se
// comprueba el fichero, no el entorno, para que salte también en local.
const ciWorkflow = fs.readFileSync(
  path.join(rootDir, ".github", "workflows", "ci.yml"),
  "utf8",
);
const ciSchemaMatch = ciWorkflow.match(
  /REQUIRED_DATABASE_SCHEMA_VERSION:\s*["']?(\d+)["']?/,
);
if (Number.parseInt(ciSchemaMatch?.[1] ?? "", 10) !== latestMigration) {
  fail(
    `.github/workflows/ci.yml debe exigir el esquema ${latestMigration}, recibido: ${ciSchemaMatch?.[1] ?? "(ausente)"}`,
  );
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

// El `name` se sella con la misma convención que producción y el CLI de Supabase:
// el nombre del fichero sin el prefijo numérico y sin la extensión, de modo que
// `401__peru_plame_contador_rbac.sql` queda como `_peru_plame_contador_rbac`.
//
// Antes se guardaba el nombre completo del fichero, así que la base de CI no era
// una réplica fiel del historial de producción y cualquier verificador que
// comprobara `name` fallaba aquí y pasaba allí. Cuatro lo hacen —401, 402, 410 y
// 411—, y esa discrepancia es parte de por qué acabaron por debajo del suelo.
const historyName = (name) => name.replace(/^\d+_/, "").replace(/\.sql$/, "");

const migrationHistoryValues = migrations
  .map(({ versionText, name }) => {
    const stamped = historyName(name).replaceAll("'", "''");
    return `('${versionText}', ARRAY['CI fresh-chain ${name.replaceAll("'", "''")}'], '${stamped}')`;
  })
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

// ---------------------------------------------------------------------------
// Segunda pasada: los verificadores históricos
// ---------------------------------------------------------------------------
// El suelo hacía dos trabajos a la vez y sólo uno era suyo. Uno es legítimo:
// exigir que toda migración nueva traiga verificador, y por eso empieza en 491,
// que es cuando arrancó la práctica —417 de las 497 migraciones no tienen uno—.
// El otro no: como la selección parte de las migraciones, ningún verificador por
// debajo del suelo llegaba a ejecutarse nunca.
//
// El resultado era que 76 de los 86 verificadores del repositorio no corrían. Se
// probaron todos contra una base recién migrada: **66 pasan**. Es decir, 66
// protecciones escritas, mantenidas en el repositorio y silenciosamente
// inactivas. Aquí se ejecutan.
//
// Los que no pasan se enumeran abajo con el motivo. Están fuera a conciencia, no
// por omisión, y la lista es corta a propósito: si crece, es que se está tapando
// algo en vez de arreglarlo.
const HISTORICOS_QUE_NO_PASAN = new Map([
  [
    "410__contador_operational_read_rbac.sql",
    "El alta de tenants dejó de sembrar el rol CONTADOR en una migración posterior; el verificador no se actualizó.",
  ],
  [
    "432__accounting_production_closure.sql",
    "Comprueba privilegios de una firma de guardar_calculo_planilla_tx que cambió después.",
  ],
  [
    "437__runtime_validation_orchestrator_contract_alignment.sql",
    "Señala que las funciones validar_*_runtime tienen EXECUTE para anon. Es descuido de configuración, no un agujero: corren como INVOKER y anon no puede leer lo que tocan por dentro (comprobado: cero SECURITY DEFINER en public alcanzables por anon).",
  ],
  [
    "448__cpe_credit_note_cancellation_atomic_finalization.sql",
    "La migración 494 endureció la aceptación de notas referenciadas; el fixture de este verificador es anterior.",
  ],
  [
    "466__customer_refund_reversal_atomic.sql",
    "Mismo motivo que el 448.",
  ],
  [
    "470__cxc_aging_and_kardex_canonical_reports.sql",
    "Su fixture mezcla monedas en una misma antigüedad de CxC, que es justo lo que el propio verificador prohíbe.",
  ],
  [
    "490__demo_admin_custom_rbac_capability.sql",
    "Espera que un ADMIN de demo no reciba un permiso global, y el sembrado actual se lo da.",
  ],
]);

// `discover` sólo reconoce ficheros `NNN__nombre.sql`, así que los verificadores
// sin número quedaban invisibles para la compuerta. Dos de los tres no afirman
// nada —`verify_anon_access` y `verify_grants_matrix` son inventarios de
// privilegios, sin un solo RAISE, y su cabecera lo dice—, pero el tercero sí:
// `verify_outbox_integrity` comprueba seis invariantes de las que depende todo el
// sistema de eventos —columnas del outbox, índice único de idempotencia, claves
// duplicadas, RLS habilitado y forzado, política presente y las RPC runtime— y
// nunca se había ejecutado. Se nombra explícitamente porque no le corresponde
// ninguna migración: no es un verificador de regresión, es de invariante.
const SIN_NUMERO_QUE_AFIRMAN = [
  "verify_outbox_integrity.sql",
  // El techo RBAC vivía sólo dentro de `superadmin-tenant-rbac-rls.spec.ts`, una
  // de las 22 e2e que CI no ejecuta —necesitan el API levantado con base y
  // credenciales reales, y el job de Playwright sólo levanta la web—. Aquella
  // prueba fija además los permisos por rol con números que ya derivaron: espera
  // ADMIN 195, CONTADOR 64 y VENDEDOR 51, y en producción son 251–256, 99 y 56.
  "verify_rbac_ceiling.sql",
];

const yaEjecutados = new Set(selectedVerifiers.map(({ file }) => file));
const historicos = [
  ...verifiers
    .filter(({ file }) => !yaEjecutados.has(file))
    .filter(({ name }) => !HISTORICOS_QUE_NO_PASAN.has(name)),
  ...SIN_NUMERO_QUE_AFIRMAN.map((name) => ({
    name,
    file: path.join(verifiersDir, name),
  })),
];

for (const verifier of historicos) {
  if (!fs.existsSync(verifier.file)) {
    fail(`el verificador ${verifier.name} está enumerado pero no existe`);
  }
  runPsql(["--file", verifier.file], `verificador histórico ${verifier.name}`);
}
process.stdout.write(
  `[database-contracts] ${historicos.length} verificadores históricos ejecutados, ` +
    `${HISTORICOS_QUE_NO_PASAN.size} enumerados como obsoletos\n`,
);

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
