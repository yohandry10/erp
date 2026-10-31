#!/usr/bin/env node
// Simulación integral de la migración desde otro sistema contra infraestructura efímera:
// PostgreSQL 16 con la cadena completa de migraciones, PostgREST y el API Nest
// real (guards, permisos, ValidationPipe). Un ERP sintético entrega su
// extracto con errores reales; se perfila, transforma, archiva, ensaya,
// corrige, importa, concilia, se reintenta y se comprueba el aislamiento.
// Nunca usa .env ni secretos operativos y sólo habla con 127.0.0.1.
//
// Uso: PSQL_BIN=<psql> node scripts/migracion/simulacion/simular-migracion-local.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { generarExtracto } from './generar-extracto.mjs';
import { perfilarCarpeta } from '../perfilar.mjs';
import { ARCHIVOS, cargarTablas, escribir, transformar } from '../transformar.mjs';
import { archivarCarpeta } from '../archivar.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runId = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14) + '-' + process.pid;
const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'migracion-simulacion-'));
const evidenciaDir = path.join(root, 'artifacts', 'migracion-simulacion');
fs.mkdirSync(evidenciaDir, { recursive: true });
const PG = '55482', REST = '55483', API_PORT = '3182';
const API = `http://127.0.0.1:${API_PORT}`;
const red = `erp-migracion-simulacion-${runId}`;
const PSQL = process.env.PSQL_BIN || 'psql';
const CLAVE_LOCAL = 'Local-Migracion-2026-Only!';
const apiDir = path.join(root, 'apps/erp-api');
const apiRequire = createRequire(path.join(apiDir, 'package.json'));

const env = { ...process.env };
for (const k of Object.keys(env))
  if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|EXPECTED_SUPABASE_|SUNAT_|OSE_|SMTP_|PFX_|CERT_|CERTIFICATE_|STRIPE_|SIRE_|DIAN_|ARCA_|REDIS_|PG)/.test(k)) delete env[k];
delete env.REQUIRED_DATABASE_SCHEMA_VERSION;
Object.assign(env, {
  E2E_EPHEMERAL_LOCAL_DB: '1', PGHOST: '127.0.0.1', PGPORT: PG, PGUSER: 'postgres', PGPASSWORD: '', PGDATABASE: 'erp_e2e', PSQL_BIN: PSQL,
  LOCAL_POSTGREST_URL: `http://127.0.0.1:${REST}`, LOCAL_API_PORT: API_PORT, LOCAL_WEB_URL: 'http://127.0.0.1:3181',
});

const contenedores = [];
const procesos = [];
let redCreada = false;
const docker = (args, timeout = 120000) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout }).trim();
const sql = (script) => {
  const r = spawnSync(PSQL, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: script, encoding: 'utf8', env, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr);
  // psql en Windows termina las líneas con \r\n.
  return r.stdout.replace(/\r\n/g, '\n').trim();
};
const fases = [];
const trazas = [];
async function fase(nombre, fn) {
  const t0 = Date.now();
  console.log(`[migracion-simulacion] ${nombre}`);
  const resultado = await fn();
  // Una fase que devuelve datos de trabajo declara aparte lo que va a la evidencia.
  const { resumen, ...resto } = resultado ?? {};
  fases.push({ fase: nombre, ms: Date.now() - t0, ...(resumen ?? resto) });
  console.log(`[migracion-simulacion]   ok en ${Math.round((Date.now() - t0) / 1000)} s`);
  return resultado;
}

async function ejecutar(etiqueta, ejecutable, args, cwd = root) {
  const log = path.join(trabajo, `${etiqueta}.log`);
  const fd = fs.openSync(log, 'w');
  const hijo = spawn(ejecutable, args, { cwd, env, windowsHide: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  const codigo = await new Promise((ok, mal) => { hijo.once('error', mal); hijo.once('exit', ok); });
  if (codigo !== 0) throw new Error(`${etiqueta} terminó con ${codigo}:\n${fs.readFileSync(log, 'utf8').slice(-4000)}`);
  return fs.readFileSync(log, 'utf8');
}
async function esperar(etiqueta, sonda, ms = 120000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try { if (await sonda()) return; } catch { /* todavía inicia */ }
    await delay(500);
  }
  throw new Error(`${etiqueta} no estuvo listo en ${ms / 1000} s`);
}

/** HTTP sin límite de espera de cabeceras: una importación grande responde al terminar. */
function pedir(metodo, ruta, { token, body, headers = {} } = {}) {
  const cuerpo = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((ok, mal) => {
    const req = http.request(`${API}/api/${ruta}`, { method: metodo, headers: { 'content-type': 'application/json',
      ...(cuerpo ? { 'content-length': cuerpo.length } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const texto = Buffer.concat(partes).toString('utf8');
        let data = null;
        try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }
        ok({ status: res.statusCode, data, retryAfter: Number(res.headers['retry-after']) });
      });
    });
    req.on('error', mal);
    if (cuerpo) req.write(cuerpo);
    req.end();
  });
}
async function llamar(metodo, ruta, opciones = {}, esperados = [200, 201]) {
  for (let intento = 0; intento < 8; intento++) {
    const r = await pedir(metodo, ruta, opciones);
    trazas.push({ metodo, ruta: ruta.split('?')[0], status: r.status });
    // El limitador real se respeta: se espera lo que indica y se reintenta.
    if (r.status === 429) { await delay(Math.min(Math.max(r.retryAfter || 5, 1), 65) * 1000); continue; }
    if (esperados && !esperados.includes(r.status))
      throw new Error(`${metodo} ${ruta} → ${r.status}: ${JSON.stringify(r.data).slice(0, 800)}`);
    return r;
  }
  throw new Error(`${metodo} ${ruta}: agotó los reintentos del límite HTTP`);
}
const fetchApi = async (url, init) => {
  const u = new URL(url);
  const r = await pedir(init.method, u.pathname.replace(/^\/api\//, '') + u.search, { headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
  trazas.push({ metodo: init.method, ruta: u.pathname, status: r.status });
  return { ok: r.status < 300, status: r.status, text: async () => (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)) };
};

async function limpiar() {
  for (const p of procesos.reverse()) {
    if (!p.pid || p.exitCode !== null) continue;
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else p.kill('SIGTERM');
    } catch { /* ya terminó */ }
  }
  for (const id of contenedores.reverse()) try { docker(['stop', '--time', '2', id]); } catch (e) { console.error(`No se detuvo ${id}: ${e.message}`); }
  if (redCreada) try { docker(['network', 'rm', red]); } catch (e) { console.error(`No se retiró ${red}: ${e.message}`); }
}
for (const [s, c] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(s, async () => { await limpiar(); process.exit(c); });

const b64 = (archivo) => fs.readFileSync(archivo).toString('base64');
const mapeo = JSON.parse(fs.readFileSync(path.join(root, 'scripts/migracion/simulacion/mapeo-simulacion.json'), 'utf8'));
const FECHA_CORTE = mapeo.fechaCorte;
const ORIGEN = 'ERP SINTETICO';
// Ruta de importación de cada salida del transformador, en el orden real.
const IMPORTAR = [
  ['clientes', 'clientes/import'], ['proveedores', 'proveedores/import'], ['almacenes', 'origen/almacenes/import'],
  ['plan_cuentas', 'origen/plan_cuentas/import'], ['productos', 'origen/productos/import'], ['cuentas_bancarias', 'origen/cuentas_bancarias/import'],
  ['listas_precios', 'origen/listas_precios/import'], ['cxc', 'cxc/import', true], ['cxp', 'cxp/import', true],
  ['balance', 'balance-apertura/import', true], ['contratos', 'contratos-suministro/import'], ['oc', 'oc-suministro/import'],
  ['cronograma', 'cronograma-suministro/import'], ['oc_compra', 'origen/oc_compra/import'], ['pedidos_venta', 'origen/pedidos_venta/import'],
  ['stock', 'stock-inicial/import', true],
];
const ENSAYO_CLAVE = { clientes: 'clientes', proveedores: 'proveedores', almacenes: 'almacenes', plan_cuentas: 'plan_cuentas', productos: 'productos',
  cuentas_bancarias: 'cuentas_bancarias', listas_precios: 'listas_precios', cxc: 'cxc', cxp: 'cxp', balance: 'balance', contratos: 'contratos',
  oc: 'oc', cronograma: 'cronograma', oc_compra: 'oc_compra', pedidos_venta: 'pedidos_venta', stock: 'stock' };

function entrega(nombre, opciones) {
  const extracto = path.join(trabajo, `extracto-${nombre}`);
  const salida = path.join(trabajo, `plantillas-${nombre}`);
  const generado = generarExtracto(extracto, { fechaCorte: FECHA_CORTE, ...opciones });
  const resultado = transformar(mapeo, cargarTablas(extracto, { codificacion: mapeo.codificacion }));
  escribir(resultado, salida, mapeo);
  return { extracto, salida, generado, resultado, archivo: (s) => path.join(salida, ARCHIVOS[s]) };
}
const ensayoBody = (e) => ({ ...Object.fromEntries(Object.keys(ENSAYO_CLAVE).map((s) => [ENSAYO_CLAVE[s], b64(e.archivo(s))])),
  fechaCorte: FECHA_CORTE, control: e.resultado.control });

const evidencia = { alcance: 'Simulación integral de la migración desde otro sistema', fecha: new Date().toISOString().slice(0, 10),
  entorno: 'PostgreSQL 16, PostgREST y API Nest efímeros en 127.0.0.1; ERP sintético; nada remoto', remoteWrites: false };
let exito = false;
try {
  const v1 = await fase('Extracto v1: generar, perfilar y transformar', async () => {
    const extracto = path.join(trabajo, 'extracto-v1');
    generarExtracto(extracto, { fechaCorte: FECHA_CORTE });
    const perfil = perfilarCarpeta(extracto, { codificacion: 'cp850' });
    // Primera iteración del mapeo: una unidad sin homologar detiene el transformador con el valor exacto.
    const sinGalon = structuredClone(mapeo);
    delete sinGalon.salidas.productos.columnas.unidad_medida.valores.GLN;
    assert.throws(() => transformar(sinGalon, cargarTablas(extracto, { codificacion: 'cp850' })), /Valor "GLN" sin correspondencia/);
    const e = entrega('v1', {});
    const alertas = perfil.tablas.flatMap((t) => t.alertas.map((a) => `${t.archivo}: ${a}`));
    assert.ok(alertas.some((a) => /USUARIOS\.DBF: CLAVE: dato sensible/.test(a)), 'El perfil debe marcar la clave de USUARIOS');
    evidencia.extracto = { tablas: perfil.tablas.length, filas: perfil.tablas.reduce((s, t) => s + t.registros, 0),
      borrados: perfil.tablas.reduce((s, t) => s + t.registros_borrados, 0), plantados: e.generado.plantados };
    return { ...e, resumen: { tablas: perfil.tablas.length, alertas_sensibles: alertas.filter((a) => /sensible/.test(a)),
      mapeo_v1: 'GLN sin correspondencia: detenido', plantados: e.generado.plantados.length, control: e.resultado.control } };
  });

  await fase('Infraestructura efímera: PostgreSQL 16 con la cadena, PostgREST y API Nest', async () => {
    for (const lib of ['dtos', 'crypto'])
      await ejecutar(`build-${lib}`, process.execPath, [apiRequire.resolve('typescript/bin/tsc'), '--project', 'tsconfig.json'], path.join(root, 'libs', lib));
    // Sin rangos libres en Docker (redes de otras ejecuciones) se usa la red por defecto y la IP del contenedor.
    try {
      docker(['network', 'create', '--label', `com.erp.local-test=${runId}`, red]);
      redCreada = true;
    } catch (error) {
      if (!/address pools/.test(String(error.stderr ?? error.message))) throw error;
      console.log('[migracion-simulacion]   sin rangos de red libres: se usa la red bridge por defecto');
    }
    const enRed = redCreada ? ['--network', red] : [];
    const pg = `${red}-pg`;
    contenedores.push(docker(['run', '--rm', '--detach', '--name', pg, ...enRed, '--publish', `127.0.0.1:${PG}:5432`,
      '--env', 'POSTGRES_DB=erp_e2e', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16']));
    await esperar('PostgreSQL', () => docker(['exec', contenedores[0], 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'erp_e2e']).includes('accepting'));
    const cadena = await ejecutar('cadena', process.execPath, ['scripts/ci/verify-database-contracts.mjs']);
    const ok = /OK PostgreSQL 16: (\d+) migraciones hasta (\d+), (\d+) verificadores/.exec(cadena);
    assert.ok(ok, 'La cadena de migraciones no terminó en verde');
    assert.equal(ok[2], '590');
    const usuarios = JSON.parse(sql(fs.readFileSync(path.join(root, 'scripts/migracion/simulacion/fixture-simulacion.sql'), 'utf8')).split('\n').at(-1));
    const pgHost = redCreada ? pg : docker(['inspect', '-f', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}', contenedores[0]]);
    contenedores.push(docker(['run', '--rm', '--detach', '--name', `${red}-rest`, ...enRed, '--publish', `127.0.0.1:${REST}:3000`,
      '--env', `PGRST_DB_URI=postgres://postgres@${pgHost}:5432/erp_e2e`, '--env', 'PGRST_DB_ANON_ROLE=anon', '--env', 'PGRST_DB_SCHEMAS=public',
      '--env', 'PGRST_JWT_SECRET=local-integration-key-only-never-production-20260905', '--env', 'GHCRTS=-N2',
      'postgrest/postgrest@sha256:85258123312dc496ad4c2ed832154a65e9746f84df0d6d09b44229ff9230c08e']));
    await esperar('PostgREST', async () => (await fetch(env.LOCAL_POSTGREST_URL)).status < 500);
    const log = path.join(trabajo, 'api.log');
    const fd = fs.openSync(log, 'w');
    const api = spawn(process.execPath, [apiRequire.resolve('ts-node/dist/bin.js'), '--transpile-only', 'tests/e2e/helpers/local-api-harness.ts'],
      { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
    procesos.push(api);
    await esperar('API', () => fs.readFileSync(log, 'utf8').includes('LOCAL_INTEGRATED_API_READY'), 240000);
    evidencia.base = { migraciones: Number(ok[1]), hasta: Number(ok[2]), verificadores: Number(ok[3]) };
    return { migraciones: Number(ok[1]), hasta: Number(ok[2]), verificadores: Number(ok[3]), usuarios: usuarios.length };
  });

  const sesiones = {};
  for (const quien of ['admin-1', 'aprobador-1', 'auditor-1', 'vendedor-1', 'admin-2']) {
    const r = await llamar('POST', 'auth/login', { body: { email: `mig-sim-${quien}@example.test`, password: CLAVE_LOCAL } });
    sesiones[quien] = { token: r.data.access_token, tenant: r.data.user.tenant_id };
    assert.ok(sesiones[quien].token, `Sin sesión para ${quien}`);
  }
  const T1 = sesiones['admin-1'].tenant;
  const adm = { token: sesiones['admin-1'].token };
  const cuenta = (consulta) => Number(sql(consulta));

  await fase('Archivo íntegro v1: carga interrumpida y descarte con motivo', async () => {
    let tandas = 0;
    const cortado = async (url, init) => {
      if (url.endsWith('/filas') && ++tandas > 3) throw new Error('corte de red simulado');
      return fetchApi(url, init);
    };
    await assert.rejects(archivarCarpeta({ origen: ORIGEN, carpeta: v1.extracto, api: `${API}/api`, token: adm.token, lote: `sim-${runId}-v1`, tanda: 2000, fetch: cortado }),
      /corte de red simulado/);
    const lote = JSON.parse(sql(`SELECT jsonb_build_object('id', id, 'estado', estado) FROM public.migracion_archivo_lotes WHERE tenant_id='${T1}' ORDER BY created_at LIMIT 1;`));
    assert.equal(lote.estado, 'CARGANDO');
    const r = await llamar('POST', `migration/origen/archivo/lotes/${lote.id}/descartar`, { ...adm, body: { motivo: 'Primera entrega con errores; el cliente reenvía el extracto' },
      headers: { 'idempotency-key': `sim-${runId}-v1:descartar` } });
    assert.equal(r.data.data.estado, 'DESCARTADO');
    return { tandas_antes_del_corte: 3, estado: 'DESCARTADO' };
  });

  const ensayoV1 = await fase('Ensayo integral v1: errores reales detectados, nada persiste', async () => {
    const r = await llamar('POST', 'migration/origen/ensayo', { ...adm, body: { ...ensayoBody(v1), sistemaOrigen: ORIGEN } });
    const d = r.data.data;
    fs.writeFileSync(path.join(trabajo, 'ensayo-v1.json'), JSON.stringify(d, null, 1));
    const errores = d.registros.filter((x) => !x.ok);
    // Cada error se explica por un problema sembrado o por un registro que depende de él.
    const s = v1.resultado.salidas;
    const contratosC7 = new Set(s.contratos.filter((x) => x.cliente_codigo === 'C00007').map((x) => String(x.id_origen_contrato)));
    const ocC7 = new Set(s.oc.filter((x) => contratosC7.has(String(x.id_origen_contrato))).map((x) => String(x.id_origen_oc)));
    const explicados = new Set(['P0003', 'med-0099', '3', 'CXC-199999', ...v1.generado.plantados.filter((p) => p.archivo === 'stock').map((p) => p.id),
      ...s.cxc.filter((x) => x.external_id_cliente === 'C00007').map((x) => x.external_id),
      ...s.cxp.filter((x) => x.external_id_proveedor === 'P0003').map((x) => x.external_id),
      ...s.oc_compra.filter((x) => x.proveedor_codigo === 'P0003').map((x) => String(x.id_origen_oc)),
      ...s.pedidos_venta.filter((x) => x.cliente_codigo === 'C00007').map((x) => String(x.id_origen_pedido)),
      ...contratosC7, ...ocC7, ...s.cronograma.filter((x) => ocC7.has(String(x.id_origen_oc))).map((x) => String(x.id_origen_entrega))]);
    const sinExplicar = errores.filter((x) => !explicados.has(String(x.id_origen)));
    assert.deepEqual(sinExplicar, [], 'Errores del ensayo sin causa sembrada');
    const buscar = (entidad, id, patron) => assert.ok(errores.some((x) => x.entidad === entidad && String(x.id_origen) === id && patron.test(x.error)),
      `Falta el error ${entidad} ${id} ${patron}`);
    buscar('PRODUCTO', 'med-0099', /enlazado a otro código de origen/);
    buscar('CONTRATO', '3', /No tiene saldo abierto/);
    buscar('CXC', 'CXC-199999', /no existe/);
    const [sinLote, repetido] = v1.generado.plantados.filter((p) => p.archivo === 'stock').map((p) => p.id);
    buscar('STOCK', sinLote, /controla lotes/);
    buscar('STOCK', repetido, /otro vencimiento/);
    // El correo se valida en el archivo, antes de la base: el registro no llega al ensayo.
    assert.ok(d.errores_archivo.some((x) => x.archivo === 'clientes' && x.field === 'email'), 'Falta el correo inválido de clientes');
    assert.ok(d.errores_archivo.some((x) => x.archivo === 'proveedores' && x.externalId === 'P0003' && x.field === 'email'), 'Falta el proveedor sin correo');
    assert.ok(errores.some((x) => x.entidad === 'CXP' && /no existe/.test(x.error)), 'Falta la cascada del proveedor sin correo');
    assert.equal(d.conciliacion.cuadra, false);
    assert.equal(cuenta(`SELECT count(*) FROM public.migracion_correspondencias WHERE tenant_id='${T1}';`), 0);
    assert.equal(cuenta(`SELECT count(*) FROM public.migration_row_operations WHERE tenant_id='${T1}';`), 0);
    assert.equal(cuenta(`SELECT count(*) FROM public.clientes WHERE tenant_id='${T1}' AND external_id LIKE 'C0%';`), 0);
    const porEntidad = {};
    for (const x of errores) porEntidad[x.entidad] = (porEntidad[x.entidad] ?? 0) + 1;
    return { registros: d.registros.length, errores: errores.length, errores_archivo: d.errores_archivo.length, por_entidad: porEntidad,
      conciliacion_cuadra: d.conciliacion.cuadra, persistido: 0 };
  });
  evidencia.ensayo_v1 = fases.at(-1);

  const v2 = await fase('Extracto v2: reentrega corregida por el cliente', async () => {
    const e = entrega('v2', { corregido: true });
    assert.deepEqual(e.generado.plantados, []);
    return { ...e, resumen: { plantados: 0, control: e.resultado.control } };
  });

  await fase('Archivo íntegro v2: carga reanudable, cierre por conteo y consulta', async () => {
    let tandas = 0;
    const lote = `sim-${runId}-v2`;
    const cortado = async (url, init) => {
      if (url.endsWith('/filas') && ++tandas === 12) throw new Error('corte de red simulado');
      return fetchApi(url, init);
    };
    await assert.rejects(archivarCarpeta({ origen: ORIGEN, carpeta: v2.extracto, api: `${API}/api`, token: adm.token, lote, tanda: 2000, fetch: cortado }), /corte/);
    const r = await archivarCarpeta({ origen: ORIGEN, carpeta: v2.extracto, api: `${API}/api`, token: adm.token, lote, tanda: 2000, fetch: fetchApi });
    assert.equal(r.estado, 'COMPLETO');
    const total = Object.values(r.tablas).reduce((s, n) => s + n, 0);
    assert.ok(r.existentes > 0, 'La reanudación debe reconocer lo ya cargado');
    assert.equal(r.nuevas + r.existentes, total);
    assert.equal(cuenta(`SELECT count(*) FROM public.migracion_archivo a JOIN public.migracion_archivo_lotes l ON l.id=a.lote_id WHERE l.tenant_id='${T1}' AND l.estado='COMPLETO';`), total);
    assert.deepEqual(r.redactados, { USUARIOS: ['CLAVE'] });
    const usuarios = await llamar('GET', 'migration/origen/archivo?tabla=USUARIOS&limite=50', adm);
    assert.ok(usuarios.data.data.filas.length > 0 && usuarios.data.data.filas.every((f) => f.fila.CLAVE === '[REDACTADO]'));
    // Los borrados del sistema anterior quedan en el archivo, en su orden de registro: los de CLIENTES son los últimos.
    const borradas = await llamar('GET', `migration/origen/archivo?tabla=CLIENTES&limite=200&pagina=4`, adm);
    assert.deepEqual(borradas.data.data.filas.map((f) => [f.clave, f.fila._borrado === true]), [['601', true], ['602', true], ['603', true]]);
    const totalBorrados = Object.values(r.borrados).reduce((s, n) => s + n, 0);
    assert.equal(cuenta(`SELECT count(*) FROM public.migracion_archivo a JOIN public.migracion_archivo_lotes l ON l.id=a.lote_id
      WHERE l.tenant_id='${T1}' AND l.estado='COMPLETO' AND a.fila->>'_borrado'='true';`), totalBorrados);
    const busqueda = await llamar('GET', `migration/origen/archivo?${new URLSearchParams({ tabla: 'KARDEX', texto: '"ingreso por compra" importación', limite: '5' })}`, adm);
    assert.ok(busqueda.data.data.total > 0 && busqueda.data.data.filas.every((f) => /importación/.test(f.fila.GLOSA)));
    const porDefecto = await llamar('GET', 'migration/origen/archivo?limite=1', { token: sesiones['auditor-1'].token });
    assert.equal(porDefecto.data.data.lote_id, r.lote_id);
    evidencia.archivo = { tablas: Object.keys(r.tablas).length, filas: total, tandas: r.tandas, redactados: r.redactados,
      busqueda_kardex: busqueda.data.data.total };
    return { lote: r.lote_id, tablas: Object.keys(r.tablas).length, filas: total, nuevas: r.nuevas, existentes_tras_reanudar: r.existentes };
  });

  await fase('Ensayo integral v2: sin errores, conciliación y cruce bancario cuadran', async () => {
    const r = await llamar('POST', 'migration/origen/ensayo', { ...adm, body: { ...ensayoBody(v2), sistemaOrigen: ORIGEN } });
    const d = r.data.data;
    fs.writeFileSync(path.join(trabajo, 'ensayo-v2.json'), JSON.stringify(d, null, 1));
    const errores = d.registros.filter((x) => !x.ok);
    assert.deepEqual([...d.errores_archivo, ...errores].slice(0, 20), [], 'El ensayo corregido debe quedar limpio');
    assert.equal(d.conciliacion.cuadra, true, JSON.stringify(d.conciliacion.entidades.filter((x) => !x.cuadra)));
    assert.equal(d.conciliacion.cruces.bancos_vs_apertura.cuadra, true);
    assert.equal(cuenta(`SELECT count(*) FROM public.migracion_correspondencias WHERE tenant_id='${T1}';`), 0);
    return { registros: d.registros.length, errores: 0, cruce_bancos: d.conciliacion.cruces.bancos_vs_apertura };
  });

  const antes = JSON.parse(sql(`SELECT jsonb_build_object('outbox', (SELECT count(*) FROM public.outbox_events WHERE tenant_id='${T1}'),
    'asientos', (SELECT count(*) FROM public.asientos_contables WHERE tenant_id='${T1}'),
    'cpe', (SELECT count(*) FROM public.cpe WHERE tenant_id='${T1}'));`));
  const importacion = await fase('Importación real v2 por HTTP, archivo por archivo y en orden', async () => {
    const resumen = [];
    for (const [salida, ruta, corte] of IMPORTAR) {
      const t0 = Date.now();
      const r = await llamar('POST', `migration/${ruta}`, { ...adm, body: { sistemaOrigen: ORIGEN, fileBase64: b64(v2.archivo(salida)), filename: ARCHIVOS[salida],
        ...(corte ? { fechaCorte: FECHA_CORTE } : {}) } });
      const x = r.data.result;
      assert.equal(r.data.status, 'completed', `${salida}: ${JSON.stringify(x.errors.slice(0, 5))}`);
      resumen.push({ archivo: ARCHIVOS[salida], filas: x.totalRows, correctas: x.okRows, creadas: x.created, enlazadas: x.updated, errores: x.errorRows,
        ms: Date.now() - t0 });
    }
    evidencia.importacion = resumen;
    return { archivos: resumen.length, filas: resumen.reduce((s, x) => s + x.filas, 0) };
  });

  const conciliado = await fase('Conciliación por HTTP y verificación independiente en SQL', async () => {
    const r = await llamar('POST', 'migration/origen/conciliacion', { ...adm, body: { sistemaOrigen: ORIGEN, control: v2.resultado.control } });
    const d = r.data.data;
    assert.equal(d.cuadra, true, JSON.stringify(d.entidades.filter((x) => !x.cuadra)));
    assert.equal(d.cruces.bancos_vs_apertura.cuadra, true);
    const c = v2.resultado.control;
    // Contra las tablas del ERP, sin pasar por la conciliación.
    const independiente = JSON.parse(sql(`SELECT jsonb_build_object(
      'clientes', (SELECT count(*) FROM public.clientes WHERE tenant_id='${T1}' AND external_id ~ '^C[0-9]{5}$'),
      'productos', (SELECT count(*) FROM public.migracion_correspondencias WHERE tenant_id='${T1}' AND entidad='PRODUCTO'),
      'cxc_saldo', (SELECT round(sum(x.saldo_pendiente), 2) FROM public.cuentas_por_cobrar x WHERE x.tenant_id='${T1}' AND x.external_id LIKE 'CXC-%'),
      'stock_lotes', (SELECT count(DISTINCT l.codigo) FROM public.inventario_lote_saldos s JOIN public.inventario_lotes l ON l.id=s.lote_id
        WHERE s.tenant_id='${T1}' AND s.stock_actual > 0),
      'oc_borrador', (SELECT count(*) FROM public.ordenes_compra o JOIN public.migracion_correspondencias m ON m.erp_id=o.id
        WHERE m.tenant_id='${T1}' AND m.entidad='OC_COMPRA' AND o.estado='BORRADOR'),
      'movimientos_banco', (SELECT count(*) FROM public.movimientos_bancarios WHERE tenant_id='${T1}' AND categoria='APERTURA_MIGRACION'),
      'balance_cuadra', (SELECT sum(d.debe) = sum(d.haber) FROM public.migration_row_operations o JOIN public.detalle_asientos d ON d.asiento_id=o.target_id
        WHERE o.tenant_id='${T1}' AND o.operation_type='BALANCE_APERTURA'));`));
    assert.equal(independiente.clientes, c.clientes.registros);
    assert.equal(independiente.productos, c.productos.registros);
    assert.equal(Number(independiente.cxc_saldo), c.cxc.saldo);
    assert.equal(independiente.oc_borrador, c.oc_compra.registros);
    assert.equal(independiente.movimientos_banco, 4);
    assert.equal(independiente.balance_cuadra, true);
    evidencia.conciliacion = { cuadra: d.cuadra, entidades: d.entidades.map((x) => ({ entidad: x.entidad, origen: x.origen, cuadra: x.cuadra })),
      cruce_bancos: d.cruces.bancos_vs_apertura, independiente };
    return { cuadra: true, entidades: d.entidades.length, independiente };
  });

  await fase('Sin efectos: ni eventos, ni comprobantes, un solo asiento (apertura)', async () => {
    const despues = JSON.parse(sql(`SELECT jsonb_build_object('outbox', (SELECT count(*) FROM public.outbox_events WHERE tenant_id='${T1}'),
      'asientos', (SELECT count(*) FROM public.asientos_contables WHERE tenant_id='${T1}'),
      'cpe', (SELECT count(*) FROM public.cpe WHERE tenant_id='${T1}'));`));
    assert.equal(despues.asientos - antes.asientos, 1, 'Sólo el asiento de apertura');
    assert.equal(despues.cpe - antes.cpe, 0, 'La migración no emite comprobantes');
    assert.equal(despues.outbox - antes.outbox, 0, 'La migración no publica eventos de negocio');
    return { asientos_nuevos: 1, eventos_nuevos: 0, comprobantes_nuevos: 0 };
  });

  await fase('Reintento completo: todo omitido, nada duplicado', async () => {
    const totales = { filas: 0, omitidas: 0 };
    for (const [salida, ruta, corte] of IMPORTAR) {
      const r = await llamar('POST', `migration/${ruta}`, { ...adm, body: { sistemaOrigen: ORIGEN, fileBase64: b64(v2.archivo(salida)), filename: ARCHIVOS[salida],
        ...(corte ? { fechaCorte: FECHA_CORTE } : {}) } });
      const x = r.data.result;
      assert.equal(x.errorRows, 0, `${salida} reintento: ${JSON.stringify(x.errors.slice(0, 3))}`);
      assert.equal(x.created, 0, `${salida} no debe crear en el reintento`);
      totales.filas += x.totalRows;
      totales.omitidas += x.skippedRows;
    }
    const r = await llamar('POST', 'migration/origen/conciliacion', { ...adm, body: { sistemaOrigen: ORIGEN, control: v2.resultado.control } });
    assert.equal(r.data.data.cuadra, true);
    assert.deepEqual(r.data.data.erp, (await llamar('POST', 'migration/origen/conciliacion', { ...adm, body: { sistemaOrigen: ORIGEN, control: {} } })).data.data.erp);
    return totales;
  });

  await fase('Origen cambiado: el sistema anterior altera un precio ya migrado y se rechaza', async () => {
    const v3 = entrega('v3', { corregido: true, cambio: true });
    const r = await llamar('POST', 'migration/origen/productos/import', { ...adm, body: { sistemaOrigen: ORIGEN, fileBase64: b64(v3.archivo('productos')), filename: 'productos.csv' } });
    const x = r.data.result;
    assert.equal(x.errorRows, 1);
    assert.match(x.errors[0].message, /Ya se migró con otros datos/);
    assert.equal(x.errors[0].externalId, 'MED-0001');
    return { rechazados: 1, omitidos: x.skippedRows };
  });

  await fase('Operación sobre lo migrado: la OC la aprueba otra persona', async () => {
    const [oc1, oc2] = sql(`SELECT erp_id FROM public.migracion_correspondencias WHERE tenant_id='${T1}' AND entidad='OC_COMPRA' ORDER BY id_origen LIMIT 2;`).split('\n');
    const propio = await llamar('POST', `compras/ordenes/${oc2}/aprobar`, { ...adm, body: { comentarios: 'Autoaprobación' } }, null);
    assert.ok(propio.status >= 400, 'Quien migró no aprueba su propia OC');
    const r = await llamar('POST', `compras/ordenes/${oc1}/aprobar`, { token: sesiones['aprobador-1'].token, body: { comentarios: 'OC migrada del sistema anterior revisada' } }, [200]);
    assert.equal(sql(`SELECT estado FROM public.ordenes_compra WHERE id='${oc1}';`), 'APROBADA');
    assert.equal(sql(`SELECT estado FROM public.ordenes_compra WHERE id='${oc2}';`), 'BORRADOR');
    return { autoaprobacion: propio.status, aprobacion_tercero: r.status };
  });

  await fase('Permisos y aislamiento entre empresas', async () => {
    const aud = { token: sesiones['auditor-1'].token };
    await llamar('GET', 'migration/origen/archivo?limite=1', aud, [200]);
    await llamar('POST', 'migration/origen/productos/import', { ...aud, body: { sistemaOrigen: ORIGEN, fileBase64: b64(v2.archivo('productos')), filename: 'p.csv' } }, [403]);
    await llamar('POST', 'migration/origen/ensayo', { ...aud, body: { productos: b64(v2.archivo('productos')) } }, [403]);
    await llamar('GET', 'migration/origen/archivo?limite=1', { token: sesiones['vendedor-1'].token }, [403]);
    const otro = { token: sesiones['admin-2'].token };
    const propio = await llamar('GET', 'migration/origen/archivo?limite=1', otro, [200]);
    assert.equal(propio.data.data.lotes.length, 0);
    const lote = sql(`SELECT id FROM public.migracion_archivo_lotes WHERE tenant_id='${T1}' AND estado='COMPLETO';`);
    await llamar('GET', `migration/origen/archivo?loteId=${lote}`, otro, [404]);
    const conc = await llamar('POST', 'migration/origen/conciliacion', { ...otro, body: { sistemaOrigen: ORIGEN, control: {} } });
    assert.equal(conc.data.data.erp.productos.registros, 0);
    assert.equal(conc.data.data.erp.clientes.registros, 0);
    return { auditor_lee: true, auditor_importa: 403, vendedor_lee: 403, otra_empresa: 'sin lotes, 404 al lote ajeno, conciliación vacía' };
  });

  exito = true;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await limpiar();
  const estados = {};
  for (const t of trazas) estados[t.status] = (estados[t.status] ?? 0) + 1;
  fs.writeFileSync(path.join(evidenciaDir, 'evidence.json'), JSON.stringify({ ...evidencia, exito, fases,
    http: { solicitudes: trazas.length, por_estado: estados } }, null, 2) + '\n');
  console.log(`[migracion-simulacion] ${exito ? 'PASS' : 'FAIL'}: evidencia en ${path.relative(root, evidenciaDir)}/evidence.json; trabajo en ${trabajo}`);
}
