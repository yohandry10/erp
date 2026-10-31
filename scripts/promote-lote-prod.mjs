// Promueve un rango de migraciones a PROD en una sola transacción. Sin --apply sólo comprueba las
// compuertas y no conecta con PROD. Con --apply exige un respaldo de menos de 24 horas, un ensayo
// exitoso de estos mismos bytes sobre ese respaldo, y CI completo y en verde en este commit.
//
//   node scripts/promote-lote-prod.mjs --desde 570 --hasta 590 --pr 149 \
//     --backup artifacts/peru-prod-backup-<id>.json --rehearsal artifacts/promocion-ensayo-.../informe.json \
//     [--apply --env-file <.env.production> --pg-bin "<PostgreSQL 17>/bin"]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PROYECTO_PROD, compararEstados, construirLote, consultaColumnas, consultaEsquema, consultaHuellas, consultaSalud,
  leerHuellas, sha256,
} from './ci/lote-promocion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opcion = (nombre) => {
  const i = args.indexOf(nombre);
  assert.ok(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'), `Falta ${nombre}`);
  return args[i + 1];
};
const comando = (ejecutable, parametros) => {
  const r = spawnSync(ejecutable, parametros, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 0, `Falló ${path.basename(ejecutable)}`);
  return r.stdout.trim();
};
const artefacto = (nombre) => {
  const f = fs.realpathSync(path.resolve(root, nombre));
  assert.ok(f.startsWith(fs.realpathSync(path.join(root, 'artifacts')) + path.sep), 'El informe debe estar en artifacts/');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};

const desde = Number(opcion('--desde'));
const hasta = Number(opcion('--hasta'));
const lote = construirLote(root, desde, hasta);

// Respaldo reciente e íntegro.
const respaldo = artefacto(opcion('--backup'));
assert.equal(respaldo.project, PROYECTO_PROD);
assert.equal(respaldo.remoteWrites, false);
const edad = Date.now() - Date.parse(respaldo.completedAt);
assert.ok(edad >= 0 && edad < 24 * 3600000, 'El respaldo debe tener menos de 24 horas');
const archivo = fs.readFileSync(fs.realpathSync(respaldo.archive));
assert.equal(archivo.length, respaldo.bytes);
assert.equal(sha256(archivo), respaldo.sha256);

// Ensayo de estos mismos bytes sobre ese respaldo.
const ensayo = artefacto(opcion('--rehearsal'));
assert.equal(ensayo.exito, true, 'El ensayo no terminó bien');
assert.equal(ensayo.archiveSha256, respaldo.sha256, 'El ensayo no se hizo sobre este respaldo');
assert.equal(ensayo.loteSha256, lote.sha256, 'El lote cambió después del ensayo');
assert.equal(ensayo.redDelContenedor, 'none');
assert.equal(ensayo.rollbackSinRastro, true);
assert.equal(ensayo.esquemaDelRespaldo, lote.anterior);
assert.equal(ensayo.esquemaFinal, hasta);
assert.equal(ensayo.verificadoresFallidos, 0);
assert.deepEqual(ensayo.tablasPerdidas, []);
assert.deepEqual(ensayo.columnasPerdidas, []);

// CI completo y en verde en este commit, sin cambios locales.
const commit = comando('git', ['rev-parse', 'HEAD']);
const pr = opcion('--pr');
assert.match(pr, /^\d+$/);
const pull = JSON.parse(comando('gh', ['pr', 'view', pr, '--json', 'headRefOid,baseRefName,state']));
assert.equal(pull.headRefOid, commit, 'El PR no está en este commit');
assert.equal(pull.baseRefName, 'main');
assert.equal(pull.state, 'OPEN');
const checks = JSON.parse(comando('gh', ['pr', 'checks', pr, '--json', 'name,state']));
assert.ok(checks.length > 0 && checks.every((c) => ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(c.state)), 'Los checks del PR deben estar completos y en verde');
for (const nombre of ['Tests', 'Build', 'Security audit', 'Type-check', 'Lint', 'Peru API, browser and backup recovery',
  'Peru company logo with real local Storage', 'PostgreSQL 16 fresh schema + SQL contracts', 'Playwright isolated browser contracts']) {
  assert.ok(checks.some((c) => c.name === nombre && c.state === 'SUCCESS'), `Falta ${nombre}`);
}
const fuentes = ['scripts', 'supabase', 'patches', 'package.json', 'pnpm-lock.yaml', 'apps/erp-api/Dockerfile', 'apps/worker/Dockerfile', 'render.yaml'];
assert.equal(comando('git', ['diff', 'HEAD', '--name-only', '--', ...fuentes]), '', 'Hay cambios locales sin subir');
assert.equal(comando('git', ['ls-files', '--others', '--exclude-standard', '--', ...fuentes]), '', 'Hay archivos sin versionar');

const informe = { commit, pr: Number(pr), proyecto: PROYECTO_PROD, desde, hasta, migraciones: lote.migraciones,
  respaldoSha256: respaldo.sha256, loteSha256: lote.sha256, exito: false, escriturasRemotas: false };
if (!args.includes('--apply')) {
  console.log(JSON.stringify({ ...informe, preparado: true, mensaje: 'Compuertas completas; sin conexión a PROD.' }, null, 2));
  process.exit(0);
}

const envFile = fs.realpathSync(path.resolve(opcion('--env-file')));
assert.equal(path.basename(envFile), '.env.production');
const valores = createRequire(path.join(root, 'apps/erp-api/package.json'))('dotenv').parse(fs.readFileSync(envFile));
assert.equal(valores.DEPLOYMENT_ENV, 'PROD');
assert.equal(valores.EXPECTED_SUPABASE_PROJECT_REF, PROYECTO_PROD);
assert.equal(new URL(valores.SUPABASE_URL).origin, `https://${PROYECTO_PROD}.supabase.co`);
comando('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/db-environment-preflight.ps1'), '-Environment', 'PROD', '-EnvFile', envFile]);
const psql = path.join(path.resolve(opcion('--pg-bin')), 'psql.exe');
assert.match(comando(psql, ['--version']), /PostgreSQL\) 17\./);
const conexion = new URL(valores.DATABASE_URL);
const entorno = { ...process.env, PGHOST: conexion.hostname, PGPORT: conexion.port || '5432',
  PGDATABASE: decodeURIComponent(conexion.pathname.slice(1)), PGUSER: decodeURIComponent(conexion.username),
  PGPASSWORD: decodeURIComponent(conexion.password), PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20',
  PGAPPNAME: `erp-promocion-${desde}-${hasta}`, PGOPTIONS: '-c statement_timeout=120000 -c lock_timeout=10000' };
delete entorno.PGSERVICE;
delete entorno.PGSERVICEFILE;
const id = new Date().toISOString().replace(/[^0-9]/g, '');
const sql = (texto, paso) => {
  const r = spawnSync(psql, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { cwd: root, input: texto, env: entorno, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 1 << 28 });
  // Diagnóstico privado: artifacts/db-backups/*.log está ignorado por Git.
  fs.writeFileSync(path.join(root, 'artifacts/db-backups', `promocion-${desde}-${hasta}-${id}-${paso}.log`), r.stderr || '');
  assert.equal(r.status, 0, `Falló ${paso}; revisar el diagnóstico privado y la historia remota antes de reintentar`);
  return r.stdout.trim();
};
const lectura = (texto, paso) => sql(`BEGIN READ ONLY;\n${texto}\nCOMMIT;`, paso);
const salida = path.join(root, 'artifacts', `promocion-prod-${desde}-${hasta}-${id}.json`);
try {
  const esquemaAntes = Number(lectura(consultaEsquema, 'esquema-antes'));
  assert.equal(esquemaAntes, lote.anterior, `PROD debe estar en ${lote.anterior}: no se reaplica`);
  const saludAntes = JSON.parse(lectura(consultaSalud(lote.anterior), 'salud-antes'));
  assert.equal(saludAntes.ready, true, 'PROD no está listo antes de promover');
  const columnas = JSON.parse(lectura(consultaColumnas, 'columnas-antes'));
  const antes = leerHuellas(lectura(consultaHuellas(columnas), 'huellas-antes'));
  informe.antes = { esquema: esquemaAntes, salud: saludAntes, tablas: Object.keys(antes).length, filas: Object.values(antes).reduce((s, x) => s + x.filas, 0) };

  informe.escriturasRemotas = true; // Si se pierde la respuesta del COMMIT, el resultado es incierto.
  const t0 = Date.now();
  sql(lote.sql, 'aplicar');
  informe.aplicarMs = Date.now() - t0;

  const esquemaDespues = Number(lectura(consultaEsquema, 'esquema-despues'));
  const saludDespues = JSON.parse(lectura(consultaSalud(hasta), 'salud-despues'));
  const columnasDespues = JSON.parse(lectura(consultaColumnas, 'columnas-despues'));
  const comparables = Object.fromEntries(Object.entries(columnas).filter(([t]) => columnasDespues[t]).map(([t, cs]) => [t, cs.filter((c) => columnasDespues[t].includes(c))]));
  const despues = leerHuellas(lectura(consultaHuellas(comparables), 'huellas-despues'));
  const comparacion = compararEstados(columnas, columnasDespues, antes, despues);
  const esperadas = new Set((ensayo.tablasConDatosCambiados ?? []).map((t) => t.tabla));
  informe.despues = { esquema: esquemaDespues, salud: saludDespues, ...comparacion,
    cambiosNoVistosEnElEnsayo: comparacion.tablasConDatosCambiados.filter((t) => !esperadas.has(t.tabla)) };
  assert.equal(esquemaDespues, hasta);
  assert.equal(saludDespues.ready, true);
  assert.deepEqual(comparacion.tablasPerdidas, []);
  assert.deepEqual(comparacion.columnasPerdidas, []);
  informe.exito = true;
} finally {
  informe.terminado = new Date().toISOString();
  fs.writeFileSync(salida, `${JSON.stringify(informe, null, 2)}\n`);
}
console.log(JSON.stringify(informe, null, 2));
