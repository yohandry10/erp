#!/usr/bin/env node
// Ensayo local de respaldo y restauración de archivos de Storage (F09).
// Crea dos Storage efímeros (origen y destino) con PostgreSQL 16, PostgREST y
// storage-api fijados por digest; no toma URLs ni claves de Supabase y sólo
// retira los contenedores y la red que creó.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { respaldar } from '../datos/respaldar-storage.mjs';
import { restaurar } from '../datos/restaurar-storage.mjs';
import { clienteStorage, sha256 } from '../datos/storage-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const network = `erp-storage-backup-${runId}`;
const SECRET = 'local-storage-backup-key-only-never-production-20261028';
const IMAGENES = {
  pg: 'postgres:16',
  rest: 'postgrest/postgrest@sha256:85258123312dc496ad4c2ed832154a65e9746f84df0d6d09b44229ff9230c08e',
  storage: 'supabase/storage-api@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85',
};
const containers = [];
let createdNetwork = false;

const docker = (args, input) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 120000, input }).trim();
const jwt = (role) => {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const cuerpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, exp: Math.floor(Date.now() / 1000) + 7200 })}`;
  return `${cuerpo}.${createHmac('sha256', SECRET).update(cuerpo).digest('base64url')}`;
};
const SERVICE_KEY = jwt('service_role');

function contenedor(args) {
  const id = docker(['run', '--rm', '--detach', '--label', `com.erp.local-test=${runId}`, ...args]);
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('Docker no devolvió un ID de contenedor');
  containers.push(id);
  return id;
}
async function esperar(etiqueta, prueba) {
  const limite = Date.now() + 90000;
  while (Date.now() < limite) {
    try { if (await prueba()) return; } catch { /* aún arrancando */ }
    await delay(700);
  }
  throw new Error(`${etiqueta} no estuvo listo en 90 segundos`);
}

const PREPARAR = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator NOINHERIT LOGIN; GRANT anon, authenticated, service_role TO authenticator;
CREATE ROLE supabase_storage_admin NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE SCHEMA storage;
`;
const PERMISOS = `GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role; GRANT ALL ON ALL FUNCTIONS IN SCHEMA storage TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO service_role;`;

async function entorno(nombre, base) {
  const pgName = `${network}-${nombre}-pg`;
  const pg = contenedor(['--name', pgName, '--network', network, '--publish', `127.0.0.1:${base}:5432`,
    '--env', 'POSTGRES_DB=storage_local', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGENES.pg]);
  await esperar(`PostgreSQL ${nombre}`, () => docker(['exec', pg, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'storage_local']).includes('accepting'));
  await esperar(`PostgreSQL ${nombre} listo`, () => docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'storage_local', '-qAt', '-c', 'select 1']) === '1');
  docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'storage_local', '-v', 'ON_ERROR_STOP=1', '-q'], PREPARAR);
  contenedor(['--name', `${network}-${nombre}-rest`, '--network', network,
    '--env', `PGRST_DB_URI=postgres://postgres@${pgName}:5432/storage_local`, '--env', 'PGRST_DB_ANON_ROLE=anon',
    '--env', 'PGRST_DB_SCHEMAS=public', '--env', `PGRST_JWT_SECRET=${SECRET}`, IMAGENES.rest]);
  const puerto = base + 2;
  contenedor(['--name', `${network}-${nombre}-storage`, '--network', network, '--publish', `127.0.0.1:${puerto}:5000`,
    '--env', `ANON_KEY=${jwt('anon')}`, '--env', `SERVICE_KEY=${SERVICE_KEY}`, '--env', `AUTH_JWT_SECRET=${SECRET}`,
    '--env', `DATABASE_URL=postgres://postgres@${pgName}:5432/storage_local`, '--env', `POSTGREST_URL=http://${network}-${nombre}-rest:3000`,
    '--env', 'STORAGE_BACKEND=file', '--env', 'FILE_STORAGE_BACKEND_PATH=/var/lib/storage', '--env', 'TENANT_ID=local-backup-only',
    '--env', 'REGION=local', '--env', 'GLOBAL_S3_BUCKET=local-ephemeral', '--env', 'FILE_SIZE_LIMIT=10485760',
    '--env', 'ENABLE_IMAGE_TRANSFORMATION=false', IMAGENES.storage]);
  const url = `http://127.0.0.1:${puerto}`;
  await esperar(`Storage ${nombre}`, async () => (await fetch(`${url}/status`, { signal: AbortSignal.timeout(2000) })).ok);
  docker(['exec', '-i', pg, 'psql', '-U', 'postgres', '-d', 'storage_local', '-v', 'ON_ERROR_STOP=1', '-q'], PERMISOS);
  return { url, storage: clienteStorage(url, SERVICE_KEY) };
}

async function limpiar() {
  for (const id of containers.reverse()) {
    try { docker(['stop', '--time', '2', id]); } catch (e) { console.error(`No se pudo detener ${id}: ${e.message}`); }
  }
  if (createdNetwork) {
    try { docker(['network', 'rm', network]); } catch (e) { console.error(`No se pudo retirar ${network}: ${e.message}`); }
  }
}

const evidencia = path.join(root, 'artifacts', 'alkhofar-f09-recuperacion');
let ok = false;
try {
  docker(['network', 'create', '--label', `com.erp.local-test=${runId}`, network]);
  createdNetwork = true;
  const [origen, destino] = [await entorno('origen', 55620), await entorno('destino', 55630)];

  const A = '58100000-0000-4000-8000-00000000000a';
  const B = '58100000-0000-4000-8000-00000000000b';
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a3ad0000000049454e44ae426082', 'hex');
  const archivos = [
    ['company-logos', `${A}/logo.png`, png, 'image/png'],
    ['supply-contract-files', `${A}/contratos/c1/acta de conformidad 2026 (firmada).pdf`, Buffer.from('%PDF-1.4\nacta A\n'), 'application/pdf'],
    ['supply-contract-files', `${A}/contratos/c1/adendas/adenda-1.pdf`, Buffer.from('%PDF-1.4\nadenda A\n'), 'application/pdf'],
    ['supply-contract-files', `${B}/contratos/c2/oc.pdf`, Buffer.from('%PDF-1.4\noc B\n'), 'application/pdf'],
  ];
  await origen.storage.crearBucket({ id: 'company-logos', public: true, allowed_mime_types: ['image/png', 'image/jpeg'] });
  await origen.storage.crearBucket({ id: 'supply-contract-files', public: false, file_size_limit: 10485760 });
  for (const [bucket, nombre, datos, tipo] of archivos) await origen.storage.subir(bucket, nombre, datos, tipo);

  // 1. Respaldo con manifiesto y hashes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-respaldo-'));
  let t0 = Date.now();
  const { manifiesto, sha256_manifiesto } = await respaldar({ url: origen.url, clave: SERVICE_KEY, modo: 'LOCAL', proyecto: 'local' }, dir);
  const tiempoRespaldo = Date.now() - t0;
  if (manifiesto.totales.objetos !== 4 || manifiesto.totales.buckets !== 2) throw new Error(`Respaldo incompleto: ${JSON.stringify(manifiesto.totales)}`);
  for (const [bucket, nombre, datos] of archivos) {
    if (manifiesto.objetos.find((o) => o.bucket === bucket && o.nombre === nombre)?.sha256 !== sha256(datos))
      throw new Error(`Hash del respaldo distinto para ${bucket}/${nombre}`);
  }

  // 2. Un respaldo alterado no se restaura.
  const alterado = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-alterado-'));
  fs.cpSync(dir, alterado, { recursive: true });
  fs.appendFileSync(path.join(alterado, 'objetos', 'supply-contract-files', B, 'contratos', 'c2', 'oc.pdf'), 'x');
  let rechazado = false;
  try { await restaurar({ respaldo: alterado, url: destino.url, clave: SERVICE_KEY }); } catch (e) { rechazado = /Respaldo alterado/.test(e.message); }
  if (!rechazado || (await destino.storage.buckets()).length) throw new Error('Un respaldo alterado llegó a escribirse');

  // 3. Restauración acotada a una empresa y luego completa, verificadas por hash.
  const soloB = await restaurar({ respaldo: dir, url: destino.url, clave: SERVICE_KEY, prefijo: `${B}/` });
  const listadoB = await destino.storage.objetos('supply-contract-files');
  if (soloB.verificados !== 1 || listadoB.length !== 1 || !listadoB[0].nombre.startsWith(B))
    throw new Error('La restauración por empresa trajo objetos ajenos');
  t0 = Date.now();
  const completa = await restaurar({ respaldo: dir, url: destino.url, clave: SERVICE_KEY });
  const tiempoRestauracion = Date.now() - t0;
  if (completa.verificados !== 4 || completa.restaurados !== 3 || completa.ya_presentes !== 1)
    throw new Error(`Restauración completa inesperada: ${JSON.stringify(completa)}`);
  const buckets = await destino.storage.buckets();
  if (buckets.find((b) => b.id === 'company-logos')?.public !== true || buckets.find((b) => b.id === 'supply-contract-files')?.public !== false)
    throw new Error('La visibilidad de los buckets no se conservó');

  // 4. Nunca hacia un destino remoto.
  let remoto = false;
  try { await restaurar({ respaldo: dir, url: 'https://ejemplo.supabase.co/storage/v1', clave: 'x' }); } catch (e) { remoto = /rechazado/.test(e.message); }
  if (!remoto) throw new Error('Se aceptó un destino remoto');

  fs.mkdirSync(evidencia, { recursive: true });
  const informe = {
    ensayo: 'respaldo y restauración de Storage en contenedores efímeros',
    imagenes: IMAGENES, sha256_manifiesto, totales: manifiesto.totales,
    restauracion_por_empresa: soloB, restauracion_completa: completa,
    tiempos_ms: { respaldo: tiempoRespaldo, restauracion_y_verificacion: tiempoRestauracion },
    controles: ['respaldo alterado rechazado antes de escribir', 'destino remoto rechazado', 'visibilidad de buckets conservada',
      'nombres con espacios y paréntesis'],
    alcance: 'Tiempos de un ensayo local con 4 objetos; no acreditan el RTO de PROD.',
  };
  fs.writeFileSync(path.join(evidencia, 'storage-restore-local.json'), JSON.stringify(informe, null, 2));
  console.log(JSON.stringify(informe, null, 2));
  ok = true;
} finally {
  await limpiar();
}
process.exit(ok ? 0 : 1);
