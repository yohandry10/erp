#!/usr/bin/env node
// Ensayo local de la exportación integral: dos empresas con contratos, BI y
// usuarios; se exporta una y se comprueba aislamiento, cobertura, conteos,
// hashes y redacción de secretos. Sólo contra PostgreSQL efímero local.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportar } from './exportar-tenant.mjs';
import { sha256 } from './storage-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || !['127.0.0.1', 'localhost'].includes(process.env.PGHOST ?? '')
  || process.env.PGDATABASE !== 'erp_e2e' || !process.env.PSQL_BIN) {
  throw new Error('Requiere E2E_EPHEMERAL_LOCAL_DB=1, PGHOST de loopback, PGDATABASE=erp_e2e y PSQL_BIN');
}
const sql = (script) => {
  const r = spawnSync(process.env.PSQL_BIN, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: script, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
if (sql("SELECT current_database()||'|'||project_ref FROM app.deployment_environment WHERE singleton;") !== 'erp_e2e|localerpephemeralqax'
  && sql('SELECT current_database();') !== 'erp_e2e') throw new Error('Sólo sobre la base efímera local');

// Fixture persistente en la base efímera: dos empresas con datos propios.
const fixture = sql(`
UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
DO $f$ DECLARE j jsonb; t uuid; a uuid; w uuid; cl uuid; pr uuid; c uuid; hoy date; r text := ''; n integer;
BEGIN
  FOR n IN 1..2 LOOP
    j := public.create_demo_tenant_ready_tx('EXPORT58'||n, 14, 'PE', 'export581-'||n||'-'||gen_random_uuid()::text);
    t := (j->>'tenant_id')::uuid; a := (j->>'user_id')::uuid; hoy := app.hoy_tenant(t);
    SELECT id INTO cl FROM public.clientes WHERE tenant_id=t AND activo ORDER BY id LIMIT 1;
    SELECT id INTO w FROM public.almacenes WHERE tenant_id=t AND activo ORDER BY es_principal DESC, id LIMIT 1;
    j := public.crear_producto_inventario_tx(t, jsonb_build_object('codigo','EXP-'||n,'nombre','Insumo exportado '||n,'categoria','VERIFICACION',
      'unidad_medida','NIU','precio_venta',10,'precio_compra',4,'afectacion_igv','10'), w, 5, 0, '[]'::jsonb);
    pr := (j->>'id')::uuid;
    UPDATE public.productos SET unidad_medida='NIU' WHERE tenant_id=t AND id=pr;
    j := public.operar_suministro_570(t, a, 'CREAR_CONTRATO', NULL, jsonb_build_object('cliente_id',cl,'numero','EXPORT-'||n,
      'asunto','Contrato de la empresa '||n,'moneda','PEN','vigencia_desde',hoy-30,'vigencia_hasta',hoy+300,'responsable_id',a,
      'lineas',jsonb_build_array(jsonb_build_object('producto_id',pr,'cantidad',10,'precio_unitario',10))), 'export-contract-'||t);
    PERFORM public.operar_credenciales_bi_579(t, a, 'CREAR', jsonb_build_object('nombre','Power BI '||n,'datasets',jsonb_build_array('entregas'),
      'expira_en',hoy+30,'token_digest',md5(random()::text)||md5(random()::text),'prefijo',left(md5(random()::text),8)), 'export-bi-'||t);
    r := r || t || ',';
  END LOOP;
  RAISE NOTICE '%', r;
END $f$;
SELECT (SELECT tenant_id FROM public.suministro_contratos WHERE numero='EXPORT-1' ORDER BY created_at DESC LIMIT 1)
  ||','||(SELECT tenant_id FROM public.suministro_contratos WHERE numero='EXPORT-2' ORDER BY created_at DESC LIMIT 1);
`);
const [A, B] = fixture.split('\n').at(-1).split(',');
assert.match(A, /^[0-9a-f-]{36}$/);

const salida = fs.mkdtempSync(path.join(os.tmpdir(), 'exportacion-'));
const conexion = { psql: process.env.PSQL_BIN, env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' }, storage: null, origen: 'LOCAL' };
const t0 = Date.now();
const { manifiesto, sha256_manifiesto } = await exportar({ tenant: A, conexion, salida });
const duracion = Date.now() - t0;

// Cobertura: tablas operativas clave y tablas hijas sin tenant_id.
const porTabla = Object.fromEntries(manifiesto.tablas.map((t) => [t.tabla, t]));
for (const t of ['tenants', 'usuarios_sistema', 'roles', 'clientes', 'productos', 'suministro_contratos', 'suministro_contrato_lineas',
  'bi_credenciales', 'audit_log', 'movimientos_inventario'])
  assert.ok(porTabla[t], `Falta la tabla ${t} en la exportación`);
assert.equal(porTabla.tenants.filas, 1);
assert.equal(porTabla.suministro_contratos.filas, 1);
const hijas = manifiesto.tablas.filter((t) => t.modo === 'HIJA');
assert.ok(hijas.length > 0, 'Sin tablas hijas cubiertas por clave foránea');
assert.match(porTabla.rol_permisos?.via ?? '', /^(role_id -> roles|permiso_id -> permisos).id$/);
assert.equal(porTabla.rol_permisos.filas, Number(sql(`SELECT count(*) FROM public.rol_permisos rp JOIN public.roles r ON r.id=rp.role_id WHERE r.tenant_id='${A}';`)));

// Aislamiento: la otra empresa no aparece en ningún archivo.
for (const t of manifiesto.tablas) {
  const contenido = fs.readFileSync(path.join(salida, 'tablas', `${t.tabla}.csv`), 'utf8');
  assert.ok(!contenido.includes(B), `La tabla ${t.tabla} contiene datos de otra empresa`);
  assert.equal(sha256(fs.readFileSync(path.join(salida, 'tablas', `${t.tabla}.csv`))), t.sha256);
}
assert.match(fs.readFileSync(path.join(salida, 'tablas', 'suministro_contratos.csv'), 'utf8'), /EXPORT-1/);

// Conteos frente a la base y redacción de secretos.
const esperados = JSON.parse(sql(`SELECT json_build_object('usuarios', (SELECT count(*) FROM public.usuarios_sistema WHERE tenant_id='${A}'),
  'bi', (SELECT count(*) FROM public.bi_credenciales WHERE tenant_id='${A}'));`));
assert.equal(porTabla.usuarios_sistema.filas, esperados.usuarios);
assert.equal(porTabla.bi_credenciales.filas, esperados.bi);
assert.ok(porTabla.bi_credenciales.redactadas.includes('token_digest'));
const digest = sql(`SELECT token_digest FROM public.bi_credenciales WHERE tenant_id='${A}' LIMIT 1;`);
assert.match(digest, /^[0-9a-f]{64}$/);
assert.ok(!fs.readFileSync(path.join(salida, 'tablas', 'bi_credenciales.csv'), 'utf8').includes(digest), 'Se exportó un secreto');
assert.equal(sha256(fs.readFileSync(path.join(salida, 'manifiesto.json'))), sha256_manifiesto);

// La exportación no escribe: la sesión es de sólo lectura.
const escritura = spawnSync(process.env.PSQL_BIN, ['-X', '-qAt', '-c', `UPDATE public.tenants SET updated_at = now() WHERE id = '${A}'`],
  { env: conexion.env, encoding: 'utf8', windowsHide: true });
assert.match(escritura.stderr, /read-only transaction/);

const informe = {
  ensayo: 'exportación integral de una empresa sobre PostgreSQL 16 efímero',
  totales: manifiesto.totales, tablas_hijas: hijas.map((t) => `${t.tabla} (${t.via})`),
  fuera_de_alcance: manifiesto.fuera_de_alcance, columnas_redactadas: [...new Set(manifiesto.tablas.flatMap((t) => t.redactadas))].sort(),
  sha256_manifiesto, duracion_ms: duracion,
  controles: ['sin filas de otra empresa en ningún archivo', 'conteos de la misma instantánea', 'hash por archivo y del manifiesto',
    'secretos vacíos', 'sesión de sólo lectura'],
};
const evidencia = path.join(root, 'artifacts', 'alkhofar-f09-recuperacion');
fs.mkdirSync(evidencia, { recursive: true });
fs.writeFileSync(path.join(evidencia, 'exportacion-tenant-local.json'), JSON.stringify(informe, null, 2));
console.log(JSON.stringify(informe, null, 2));
