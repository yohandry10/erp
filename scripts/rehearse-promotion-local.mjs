// Ensaya la promoción de un rango de migraciones sobre un respaldo de PROD
// restaurado en un contenedor sin red. La cadena desde cero no prueba esto: aquí
// hay datos, así que se ven backfills, bloqueos y filas alteradas.
//
//   node scripts/rehearse-promotion-local.mjs --backup artifacts/peru-prod-backup-<id>.json --desde 570 --hasta 590 [--conservar]
//   (o --dump <respaldo.dump> para un archivo suelto; la promoción exige --backup)
//
// Nunca conecta con PROD. El informe sólo lleva nombres de tabla, conteos y
// huellas; ni filas ni datos de empresas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  compararEstados, conRollbackForzado, construirLote, consultaCatalogo, consultaColumnas, consultaEsquema, consultaFunciones,
  consultaHuellas, consultaSalud, leerHuellas, sha256,
} from './ci/lote-promocion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opcion = (nombre) => {
  const i = process.argv.indexOf(nombre);
  assert.ok(i >= 0 && process.argv[i + 1], `Falta ${nombre}`);
  return process.argv[i + 1];
};
const manifiesto = process.argv.includes('--backup') ? JSON.parse(fs.readFileSync(path.resolve(root, opcion('--backup')), 'utf8')) : null;
const dump = fs.realpathSync(manifiesto ? manifiesto.archive : opcion('--dump'));
if (manifiesto) assert.equal(sha256(fs.readFileSync(dump)), manifiesto.sha256, 'El respaldo no coincide con su manifiesto');
const desde = Number(opcion('--desde'));
const hasta = Number(opcion('--hasta'));
assert.ok(Number.isInteger(desde) && Number.isInteger(hasta) && desde <= hasta);

const id = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
const contenedor = `erp-ensayo-promocion-${id}-${process.pid}`;
const salida = path.join(root, 'artifacts', `promocion-ensayo-${desde}-${hasta}-${id}`);
const dirMigraciones = path.join(root, 'supabase/migrations');
const dirVerificadores = path.join(root, 'supabase/verify');

const docker = (args, entrada, { timeout = 900000, permitirFallo = false } = {}) => {
  const r = spawnSync('docker', args, { input: entrada, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 1 << 29 });
  if (r.status !== 0 && !permitirFallo) throw new Error(`docker ${args[0]}: ${(r.stderr || r.error?.message || '').slice(0, 1500)}`);
  return permitirFallo ? r : r.stdout.trim();
};
const PSQL = ['exec', '-i', contenedor, 'psql', '-XqAt', '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'];
const sql = (texto) => docker(PSQL, texto);
const sqlCrudo = (texto) => docker(PSQL, texto, { permitirFallo: true });

const migraciones = fs.readdirSync(dirMigraciones)
  .filter((f) => /^\d+__.*\.sql$/.test(f))
  .map((f) => ({ version: Number(f.split('__')[0]), archivo: f }))
  .sort((a, b) => a.version - b.version);
const cuerpo = (archivo) => fs.readFileSync(path.join(dirMigraciones, archivo), 'utf8').replace(/^﻿/, '');
const sello = ({ version, archivo }) => `INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES('${version}',ARRAY['Ensayo de promoción de ${archivo}'],'${archivo.replace(/^\d+__/, '').replace(/\.sql$/, '')}');`;

const columnasActuales = () => JSON.parse(sql(consultaColumnas));
const comilla = (x) => `"${x.replaceAll('"', '""')}"`;
const tablaSql = (t) => t.split('.').map(comilla).join('.');
const huellas = (columnas) => leerHuellas(sql(consultaHuellas(columnas)));
const catalogo = () => sql(consultaCatalogo);

const informe = { archiveSha256: manifiesto?.sha256 ?? sha256(fs.readFileSync(dump)), exito: false, redDelContenedor: 'none', conexionesRemotas: 0, desde, hasta, limites: ['Sin objetos de Storage ni roles globales reales; el tiempo local no acredita el de PROD.'] };
fs.mkdirSync(salida, { recursive: true });
let paso = 'crear contenedor';
try {
  docker(['run', '--rm', '--detach', '--name', contenedor, '--network', 'none', '--env', 'POSTGRES_DB=erp_e2e', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
  let listo = false;
  for (let i = 0; i < 60 && !listo; i += 1) {
    listo = spawnSync('docker', ['exec', contenedor, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'erp_e2e'], { stdio: 'ignore' }).status === 0;
    if (!listo) await new Promise((ok) => setTimeout(ok, 1000));
  }
  assert.ok(listo, 'PostgreSQL no arrancó');

  paso = 'restaurar respaldo';
  const inicioRestauracion = Date.now();
  docker(['cp', dump, `${contenedor}:/tmp/fuente.dump`]);
  const esquema = docker(['exec', contenedor, 'pg_restore', '--schema-only', '--no-owner', '--file=-', '/tmp/fuente.dump']);
  const roles = new Set(['anon', 'authenticated', 'service_role']);
  for (const l of esquema.split('\n').filter((x) => /^(GRANT |REVOKE |ALTER DEFAULT PRIVILEGES )/.test(x))) {
    for (const m of l.matchAll(/(?:TO|FROM|FOR ROLE) ([a-z_][a-z_0-9]*)/g)) roles.add(m[1]);
  }
  for (const rol of roles) {
    if (rol !== 'postgres' && rol !== 'public') sql(`CREATE ROLE "${rol}" NOLOGIN ${rol === 'service_role' ? 'BYPASSRLS' : ''};`);
  }
  sql('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION citext WITH SCHEMA public; CREATE EXTENSION pg_trgm WITH SCHEMA public;');
  const lista = docker(['exec', contenedor, 'pg_restore', '--list', '/tmp/fuente.dump']).split('\n').filter((l) => !/^\d+; \d+ \d+ SCHEMA - public /.test(l));
  docker(['exec', '-i', contenedor, 'sh', '-c', 'cat > /tmp/restaurar.lista'], lista.join('\n'));
  docker(['exec', contenedor, 'pg_restore', '-U', 'postgres', '-d', 'erp_e2e', '--no-owner', '--exit-on-error', '--single-transaction', '--use-list=/tmp/restaurar.lista', '/tmp/fuente.dump']);
  informe.restaurarMs = Date.now() - inicioRestauracion;
  informe.esquemaDelRespaldo = Number(sql(consultaEsquema));
  informe.entornoDelRespaldo = sql('SELECT environment FROM app.deployment_environment WHERE singleton;');

  paso = 'llevar el respaldo hasta la versión anterior al lote';
  informe.aplicadasAntesDelLote = [];
  for (const m of migraciones.filter((x) => x.version > informe.esquemaDelRespaldo && x.version < desde)) {
    sql(`${cuerpo(m.archivo)}\n${sello(m)}`);
    informe.aplicadasAntesDelLote.push(m.version);
  }

  paso = 'huella inicial';
  const lote = construirLote(root, desde, hasta);
  informe.loteSha256 = lote.sha256;
  informe.migraciones = lote.migraciones;
  const columnas = columnasActuales();
  const antes = huellas(columnas);
  const catalogoAntes = catalogo();
  informe.tablas = Object.keys(antes).length;
  informe.filas = Object.values(antes).reduce((s, x) => s + x.filas, 0);
  const funcionesAntes = JSON.parse(sql(consultaFunciones));

  paso = 'rollback forzado';
  let t0 = Date.now();
  const forzado = sqlCrudo(conRollbackForzado(lote.sql));
  informe.rollbackMs = Date.now() - t0;
  assert.ok(forzado.status !== 0 && forzado.stderr.includes('ENSAYO_ROLLBACK_FORZADO'), `El lote falló antes del rollback forzado: ${forzado.stderr.slice(0, 1500)}`);
  assert.deepEqual(huellas(columnas), antes, 'El rollback dejó datos cambiados');
  assert.equal(catalogo(), catalogoAntes, 'El rollback dejó funciones cambiadas');
  informe.rollbackSinRastro = true;
  // Copia para comparar después columna a columna. Vive fuera de los esquemas que se comparan.
  sql(`CREATE SCHEMA ensayo_antes;${Object.keys(columnas).map((t) => `CREATE TABLE ensayo_antes."${t}" AS TABLE ${tablaSql(t)};`).join('')}`);

  paso = 'aplicar el lote';
  t0 = Date.now();
  sql(lote.sql);
  informe.aplicarMs = Date.now() - t0;
  informe.esquemaFinal = Number(sql(consultaEsquema));
  assert.equal(informe.esquemaFinal, hasta);

  paso = 'comparar datos';
  const columnasDespues = columnasActuales();
  informe.tablasNuevas = Object.keys(columnasDespues).filter((t) => !columnas[t]).sort();
  const comparables = Object.fromEntries(Object.entries(columnas).filter(([t]) => columnasDespues[t]).map(([t, cs]) => [t, cs.filter((c) => columnasDespues[t].includes(c))]));
  const { tablasPerdidas, columnasPerdidas, tablasConDatosCambiados } = compararEstados(columnas, columnasDespues, antes, huellas(comparables));
  informe.tablasPerdidas = tablasPerdidas;
  informe.columnasPerdidas = columnasPerdidas;
  informe.tablasConDatosCambiados = tablasConDatosCambiados;
  // Una función retirada dejaría sin servicio al API anterior mientras se despliega el nuevo.
  const funcionesDespues = new Set(JSON.parse(sql(consultaFunciones)));
  informe.funcionesPublicasRetiradas = funcionesAntes.filter((x) => !funcionesDespues.has(x));
  // Sólo nombres de columna y conteos: qué filas que ya existían cambiaron de valor o desaparecieron.
  for (const fila of informe.tablasConDatosCambiados) {
    const cols = comparables[fila.tabla];
    if (!cols.includes('id')) { fila.detalle = 'sin columna id'; continue; }
    const previa = `ensayo_antes."${fila.tabla}"`;
    const conteos = cols.filter((c) => c !== 'id').map((c) => `count(*) FILTER (WHERE a.${comilla(c)} IS DISTINCT FROM d.${comilla(c)}) AS ${comilla(c)}`).join(',');
    const cambios = JSON.parse(sql(`SELECT to_jsonb(q) FROM (SELECT ${conteos} FROM ${previa} a JOIN ${tablaSql(fila.tabla)} d USING (id)) q;`));
    fila.columnasCambiadas = Object.fromEntries(Object.entries(cambios).filter(([, n]) => Number(n) > 0));
    fila.filasBorradas = Number(sql(`SELECT count(*) FROM ${previa} a WHERE NOT EXISTS (SELECT 1 FROM ${tablaSql(fila.tabla)} d WHERE d.id=a.id);`));
  }

  paso = 'salud y datos bancarios';
  informe.salud = JSON.parse(sql(consultaSalud(hasta)));
  informe.movimientosBancarios = JSON.parse(sql(`SELECT jsonb_build_object('total',count(*),'inactivos',count(*) FILTER (WHERE activo IS FALSE),'nulos',count(*) FILTER (WHERE activo IS NULL)) FROM public.movimientos_bancarios;`));
  informe.defaultActivo = sql(`SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='movimientos_bancarios' AND column_name='activo';`);

  paso = 'verificadores sobre datos';
  informe.verificadores = [];
  const verificar = (m) => {
    const archivo = fs.readdirSync(dirVerificadores).find((f) => f.startsWith(`${m.version}__`));
    const r = sqlCrudo(fs.readFileSync(path.join(dirVerificadores, archivo), 'utf8'));
    return { version: m.version, ok: r.status === 0, error: r.status === 0 ? null : (r.stderr.split('\n').find((l) => /ERROR|FATAL/.test(l)) || r.stderr).slice(0, 300) };
  };
  const delLote = lote.migraciones.map((archivo) => ({ version: Number(archivo.split('__')[0]) }));
  for (const m of delLote) informe.verificadores.push(verificar(m));
  // Algunos se niegan a correr si la base se identifica como PROD; esta copia es local.
  sql("UPDATE app.deployment_environment SET environment='DEV', project_ref='localerpephemeralqax', allow_demo_data=true WHERE singleton;");
  informe.verificadores = informe.verificadores.map((v) => (/_LOCAL_ONLY/.test(v.error ?? '') ? { ...verificar({ version: v.version }), identidadLocal: true } : v));
  informe.verificadoresFallidos = informe.verificadores.filter((v) => !v.ok).length;
  informe.exito = informe.verificadoresFallidos === 0 && !tablasPerdidas.length && !columnasPerdidas.length;
} catch (e) {
  informe.fallo = { paso, mensaje: String(e.message).slice(0, 2000) };
} finally {
  if (process.argv.includes('--conservar')) informe.contenedor = contenedor;
  else spawnSync('docker', ['rm', '-f', contenedor], { stdio: 'ignore' });
  fs.writeFileSync(path.join(salida, 'informe.json'), `${JSON.stringify(informe, null, 2)}\n`);
}
console.log(JSON.stringify({ salida: path.relative(root, salida), ...informe, verificadores: informe.verificadores?.filter((v) => !v.ok) }, null, 1));
process.exit(informe.exito ? 0 : 1);
