#!/usr/bin/env node
// Respaldo de los archivos de Supabase Storage: buckets, objetos y manifiesto
// con SHA-256. Complementa backup-peru-prod.mjs, que respalda la base pero no
// los objetos. Sólo lectura sobre el origen.
//
// PROD:  node scripts/datos/respaldar-storage.mjs --env-file .env.production
// Local: node scripts/datos/respaldar-storage.mjs --storage-url http://127.0.0.1:<puerto> --clave-env <VARIABLE> [--salida <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { clienteStorage, exigirLoopback, sha256 } from './storage-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROD = 'wypnbcptofqdmoynlonq';

/** Resuelve origen y clave sin imprimirla. */
export function origen(argv, entorno = process.env) {
  const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  if (argv.includes('--env-file')) {
    const envFile = path.resolve(arg('--env-file'));
    if (path.basename(envFile) !== '.env.production') throw new Error('Sólo .env.production es operativo');
    const values = createRequire(path.join(root, 'apps/erp-api/package.json'))('dotenv').parse(fs.readFileSync(envFile));
    if (values.DEPLOYMENT_ENV !== 'PROD' || values.EXPECTED_SUPABASE_PROJECT_REF !== PROD
      || new URL(values.SUPABASE_URL).origin !== `https://${PROD}.supabase.co`) {
      throw new Error('Respaldo bloqueado: origen fuera del único PROD autorizado');
    }
    const preflight = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/db-environment-preflight.ps1'),
      '-Environment', 'PROD', '-EnvFile', envFile], { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
    if (preflight.status !== 0) throw new Error('El preflight PROD no pasó; no se inició el respaldo');
    if (!values.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.production');
    return { modo: 'PROD', proyecto: PROD, url: `${values.SUPABASE_URL}/storage/v1`, clave: values.SUPABASE_SERVICE_ROLE_KEY };
  }
  const url = arg('--storage-url');
  const variable = arg('--clave-env');
  if (!url || !variable) throw new Error('Use --env-file .env.production o --storage-url con --clave-env');
  exigirLoopback(url);
  if (!entorno[variable]) throw new Error(`La variable ${variable} está vacía`);
  return { modo: 'LOCAL', proyecto: 'local', url, clave: entorno[variable] };
}

export async function respaldar({ url, clave, modo, proyecto }, salida) {
  const storage = clienteStorage(url, clave);
  const inicio = Date.now();
  const buckets = await storage.buckets();
  const objetos = [];
  for (const b of buckets) {
    for (const o of await storage.objetos(b.id)) {
      const { datos, tipo } = await storage.descargar(b.id, o.nombre);
      const destino = path.join(salida, 'objetos', b.id, ...o.nombre.split('/'));
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, datos);
      objetos.push({ bucket: b.id, nombre: o.nombre, bytes: datos.length, sha256: sha256(datos), tipo: o.tipo ?? tipo });
    }
  }
  const manifiesto = {
    generado_en: new Date().toISOString(),
    origen: { modo, proyecto },
    buckets: buckets.map((b) => ({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit ?? null,
      allowed_mime_types: b.allowed_mime_types ?? null })),
    objetos,
    totales: { buckets: buckets.length, objetos: objetos.length, bytes: objetos.reduce((s, o) => s + o.bytes, 0) },
    duracion_ms: Date.now() - inicio,
  };
  const texto = JSON.stringify(manifiesto, null, 2);
  fs.writeFileSync(path.join(salida, 'manifiesto.json'), texto);
  return { manifiesto, sha256_manifiesto: sha256(Buffer.from(texto)) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const o = origen(argv);
  const runId = new Date().toISOString().replace(/[^0-9]/g, '');
  // Los objetos pueden contener datos del cliente: carpeta ignorada por Git.
  const salida = path.resolve(argv.includes('--salida') ? argv[argv.indexOf('--salida') + 1] : path.join(root, 'artifacts/storage-backups', runId));
  fs.mkdirSync(salida, { recursive: true });
  const { manifiesto, sha256_manifiesto } = await respaldar(o, salida);
  const informe = { origen: manifiesto.origen, salida, sha256_manifiesto, totales: manifiesto.totales, duracion_ms: manifiesto.duracion_ms,
    alcance: 'Objetos y configuración de buckets de Storage. La base se respalda con backup-peru-prod.mjs.' };
  if (o.modo === 'PROD') fs.writeFileSync(path.join(root, 'artifacts', `storage-backup-${runId}.json`), JSON.stringify(informe, null, 2));
  console.log(JSON.stringify(informe, null, 2));
}
