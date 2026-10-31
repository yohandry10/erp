#!/usr/bin/env node
// Exportación integral de una empresa al terminar el servicio (F09): todas sus
// filas en CSV desde una sola instantánea de sólo lectura, sus archivos de
// Storage y un manifiesto con conteos y SHA-256. Las credenciales y secretos
// se exportan vacíos. Nunca escribe en la base.
//
// PROD:  node scripts/datos/exportar-tenant.mjs --tenant <uuid> --env-file .env.production --pg-bin <PostgreSQL 17\bin> [--con-archivos]
// Local: E2E_EPHEMERAL_LOCAL_DB=1 PGHOST=127.0.0.1 PGPORT=<puerto> PGDATABASE=erp_e2e PSQL_BIN=<psql> \
//        node scripts/datos/exportar-tenant.mjs --tenant <uuid> [--salida <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { clienteStorage, sha256 } from './storage-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROD = 'wypnbcptofqdmoynlonq';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SECRETO = /(password|contrasena|secret|token|private_key|clave_privada|pfx|api_key)/i;

// Plan de exportación desde el catálogo: tablas con tenant_id y tablas hijas
// (sin tenant_id) enlazadas por una clave foránea de una columna.
const PLAN_SQL = `
WITH tablas AS (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
), con_tenant AS (
  SELECT t.* FROM tablas t WHERE EXISTS (SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = t.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
), hijas AS (
  SELECT DISTINCT ON (t.oid) t.oid, t.relname, pa.attname AS fk, p.relname AS padre, rf.attname AS ref
  FROM tablas t
  JOIN pg_constraint k ON k.conrelid = t.oid AND k.contype = 'f' AND cardinality(k.conkey) = 1
  JOIN con_tenant p ON p.oid = k.confrelid
  JOIN pg_attribute pa ON pa.attrelid = t.oid AND pa.attnum = k.conkey[1]
  JOIN pg_attribute rf ON rf.attrelid = k.confrelid AND rf.attnum = k.confkey[1]
  WHERE t.oid NOT IN (SELECT oid FROM con_tenant) AND t.relname <> 'tenants'
  -- Una columna obligatoria alcanza todas las filas; una opcional dejaría fuera las que no la usan.
  ORDER BY t.oid, pa.attnotnull DESC, k.conname
)
SELECT json_build_object(
  'tablas', (SELECT json_agg(json_build_object('tabla', x.relname, 'modo', x.modo, 'fk', x.fk, 'padre', x.padre, 'ref', x.ref,
      'columnas', (SELECT json_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a
        WHERE a.attrelid = x.oid AND a.attnum > 0 AND NOT a.attisdropped)) ORDER BY x.relname)
    FROM (SELECT oid, relname, 'TENANT' AS modo, NULL::name AS fk, NULL::name AS padre, NULL::name AS ref FROM con_tenant
      UNION ALL SELECT oid, relname, 'HIJA', fk, padre, ref FROM hijas
      UNION ALL SELECT oid, relname, 'EMPRESA', NULL, NULL, NULL FROM tablas WHERE relname = 'tenants') x),
  'fuera', (SELECT json_agg(t.relname ORDER BY t.relname) FROM tablas t
    WHERE t.oid NOT IN (SELECT oid FROM con_tenant) AND t.oid NOT IN (SELECT oid FROM hijas) AND t.relname <> 'tenants')
)`;

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

export function consultaTabla(t, tenant) {
  const cols = t.columnas.map((c) => (SECRETO.test(c) ? `NULL AS ${ident(c)}` : ident(c))).join(', ');
  const lit = `'${tenant}'::uuid`;
  if (t.modo === 'EMPRESA') return `SELECT ${cols} FROM public.tenants WHERE id = ${lit}`;
  if (t.modo === 'TENANT') return `SELECT ${cols} FROM public.${ident(t.tabla)} WHERE tenant_id = ${lit}`;
  return `SELECT ${cols} FROM public.${ident(t.tabla)} h WHERE h.${ident(t.fk)} IN `
    + `(SELECT p.${ident(t.ref)} FROM public.${ident(t.padre)} p WHERE p.tenant_id = ${lit})`;
}

function conexionProd(argv) {
  const arg = (n) => argv[argv.indexOf(n) + 1];
  const envFile = path.resolve(arg('--env-file'));
  if (path.basename(envFile) !== '.env.production') throw new Error('Sólo .env.production es operativo');
  const values = createRequire(path.join(root, 'apps/erp-api/package.json'))('dotenv').parse(fs.readFileSync(envFile));
  if (values.DEPLOYMENT_ENV !== 'PROD' || values.EXPECTED_SUPABASE_PROJECT_REF !== PROD
    || new URL(values.SUPABASE_URL).origin !== `https://${PROD}.supabase.co`) {
    throw new Error('Exportación bloqueada: origen fuera del único PROD autorizado');
  }
  const preflight = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/db-environment-preflight.ps1'),
    '-Environment', 'PROD', '-EnvFile', envFile], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (preflight.status !== 0) throw new Error('El preflight PROD no pasó; no se inició la exportación');
  const c = new URL(values.DATABASE_URL);
  return {
    psql: path.join(path.resolve(arg('--pg-bin')), process.platform === 'win32' ? 'psql.exe' : 'psql'),
    env: { ...process.env, PGHOST: c.hostname, PGPORT: c.port || '5432', PGDATABASE: decodeURIComponent(c.pathname.slice(1)),
      PGUSER: decodeURIComponent(c.username), PGPASSWORD: decodeURIComponent(c.password), PGSSLMODE: 'require',
      PGAPPNAME: 'erp-tenant-export', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=600000' },
    storage: { url: `${values.SUPABASE_URL}/storage/v1`, clave: values.SUPABASE_SERVICE_ROLE_KEY },
    origen: 'PROD',
  };
}

function conexionLocal() {
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || !['127.0.0.1', 'localhost'].includes(process.env.PGHOST ?? '')
    || process.env.PGDATABASE !== 'erp_e2e' || !process.env.PSQL_BIN) {
    throw new Error('Exportación local: requiere E2E_EPHEMERAL_LOCAL_DB=1, PGHOST de loopback, PGDATABASE=erp_e2e y PSQL_BIN');
  }
  return { psql: process.env.PSQL_BIN, env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' }, storage: null, origen: 'LOCAL' };
}

function psql(conexion, script) {
  const r = spawnSync(conexion.psql, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    env: conexion.env, input: script, encoding: 'utf8', windowsHide: true, timeout: 1_800_000, maxBuffer: 50 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql falló: ${(r.stderr || '').split('\n').slice(0, 3).join(' ')}`);
  return r.stdout.trim();
}

export async function exportar({ tenant, conexion, salida, conArchivos = false }) {
  if (!UUID.test(tenant)) throw new Error('--tenant debe ser un UUID');
  fs.mkdirSync(path.join(salida, 'tablas'), { recursive: true });
  const plan = JSON.parse(psql(conexion, `${PLAN_SQL};`));
  const existe = psql(conexion, `SELECT count(*) FROM public.tenants WHERE id = '${tenant}'::uuid;`);
  if (existe !== '1') throw new Error('La empresa no existe en esta base');
  const ruta = (t) => path.join(salida, 'tablas', `${t.tabla}.csv`).replace(/\\/g, '/').replace(/'/g, "''");
  // Una sola instantánea: todas las tablas y sus conteos en la misma transacción.
  const script = [
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    ...plan.tablas.map((t) => `\\copy (${consultaTabla(t, tenant)}) TO '${ruta(t)}' WITH (FORMAT csv, HEADER)`),
    `SELECT json_object_agg(x.tabla, x.n) FROM (${plan.tablas.map((t) =>
      `SELECT '${t.tabla}' AS tabla, (SELECT count(*) FROM (${consultaTabla(t, tenant)}) q) AS n`).join(' UNION ALL ')}) x;`,
    'COMMIT;',
  ].join('\n');
  const conteos = JSON.parse(psql(conexion, script));
  const tablas = plan.tablas.map((t) => {
    const archivo = path.join(salida, 'tablas', `${t.tabla}.csv`);
    return { tabla: t.tabla, modo: t.modo, ...(t.modo === 'HIJA' ? { via: `${t.fk} -> ${t.padre}.${t.ref}` } : {}),
      filas: Number(conteos[t.tabla] ?? 0), sha256: sha256(fs.readFileSync(archivo)),
      redactadas: t.columnas.filter((c) => SECRETO.test(c)) };
  });
  const archivos = [];
  if (conArchivos && conexion.storage) {
    const storage = clienteStorage(conexion.storage.url, conexion.storage.clave);
    for (const b of await storage.buckets())
      for (const o of await storage.objetos(b.id, `${tenant}/`)) {
        const { datos } = await storage.descargar(b.id, o.nombre);
        const destino = path.join(salida, 'archivos', b.id, ...o.nombre.split('/'));
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, datos);
        archivos.push({ bucket: b.id, nombre: o.nombre, bytes: datos.length, sha256: sha256(datos) });
      }
  }
  const manifiesto = {
    generado_en: new Date().toISOString(), origen: conexion.origen, tenant,
    tablas, archivos, fuera_de_alcance: plan.fuera ?? [],
    totales: { tablas: tablas.length, filas: tablas.reduce((s, t) => s + t.filas, 0), archivos: archivos.length },
    formato: 'CSV UTF-8 con encabezado por tabla; columnas de credenciales y secretos vacías',
  };
  const texto = JSON.stringify(manifiesto, null, 2);
  fs.writeFileSync(path.join(salida, 'manifiesto.json'), texto);
  return { manifiesto, sha256_manifiesto: sha256(Buffer.from(texto)) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const tenant = arg('--tenant');
  const conexion = argv.includes('--env-file') ? conexionProd(argv) : conexionLocal();
  const runId = new Date().toISOString().replace(/[^0-9]/g, '');
  // Contiene datos del cliente: carpeta ignorada por Git.
  const salida = path.resolve(arg('--salida') ?? path.join(root, 'artifacts/exportaciones', `${tenant}-${runId}`));
  const { manifiesto, sha256_manifiesto } = await exportar({ tenant, conexion, salida, conArchivos: argv.includes('--con-archivos') });
  console.log(JSON.stringify({ salida, sha256_manifiesto, totales: manifiesto.totales,
    fuera_de_alcance: manifiesto.fuera_de_alcance.length }, null, 2));
}
