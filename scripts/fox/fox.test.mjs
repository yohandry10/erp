// Pruebas de las herramientas FOX con tablas Visual FoxPro sintéticas (sólo locales).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { leerDbf, leerCsv } from './fox-dbf.mjs';
import { escribirDbf } from './escribir-dbf.mjs';
import { perfilarCarpeta, perfilMarkdown } from './perfilar-fox.mjs';
import { cargarTablas, COLUMNAS, escribir, transformar } from './transformar-fox.mjs';
import { archivarCarpeta } from './archivar-fox.mjs';

function extractoSintetico() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-'));
  escribirDbf(path.join(dir, 'CONTRATO.DBF'), [
    { nombre: 'IDCONT', tipo: 'I', largo: 4 }, { nombre: 'NUMERO', tipo: 'C', largo: 20 }, { nombre: 'CODCLI', tipo: 'C', largo: 10 },
    { nombre: 'DESCRIP', tipo: 'C', largo: 40 }, { nombre: 'MONEDA', tipo: 'C', largo: 1 }, { nombre: 'FECINI', tipo: 'D', largo: 8 },
    { nombre: 'FECFIN', tipo: 'D', largo: 8 }, { nombre: 'ESTADO', tipo: 'C', largo: 1 }, { nombre: 'NOTAS', tipo: 'M', largo: 4 },
    { nombre: 'ALTA', tipo: 'T', largo: 8 },
  ], [
    { IDCONT: 100, NUMERO: 'LP-012-2026', CODCLI: 'CLI-45', DESCRIP: 'Suministro de insumos para niÑos', MONEDA: 'S', FECINI: '2026-01-01', FECFIN: '2026-12-31', ESTADO: 'V', NOTAS: 'Adenda 1 firmada', ALTA: '2025-12-20T10:30:00Z' },
    { IDCONT: 200, NUMERO: 'LP-013-2026', CODCLI: 'CLI-46', DESCRIP: 'Contrato cerrado', MONEDA: 'S', FECINI: '2025-01-01', FECFIN: '2025-12-31', ESTADO: 'C', NOTAS: '', ALTA: '2024-12-20T10:30:00Z' },
    { IDCONT: 300, NUMERO: 'LP-014-2026', CODCLI: 'CLI-47', DESCRIP: 'Borrado', MONEDA: 'D', FECINI: '2026-01-01', FECFIN: '2026-12-31', ESTADO: 'V', NOTAS: '', ALTA: '2025-12-20T10:30:00Z' },
  ], { borrados: [2] });
  escribirDbf(path.join(dir, 'CONTDET.DBF'), [
    { nombre: 'IDCONT', tipo: 'I', largo: 4 }, { nombre: 'ITEM', tipo: 'N', largo: 3 }, { nombre: 'CODPRO', tipo: 'C', largo: 10 },
    { nombre: 'CANTIDAD', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'CANTENT', tipo: 'N', largo: 12, decimales: 2 },
    { nombre: 'PRECIO', tipo: 'Y', largo: 8 },
  ], [
    { IDCONT: 100, ITEM: 1, CODPRO: 'MED-001', CANTIDAD: 1000, CANTENT: 600, PRECIO: 12.5 },
    { IDCONT: 100, ITEM: 2, CODPRO: 'MED-002', CANTIDAD: 300, CANTENT: 300, PRECIO: 8 },
    { IDCONT: 200, ITEM: 1, CODPRO: 'MED-003', CANTIDAD: 50, CANTENT: 50, PRECIO: 3 },
  ]);
  escribirDbf(path.join(dir, 'OCCAB.DBF'), [
    { nombre: 'IDOC', tipo: 'C', largo: 8 }, { nombre: 'IDCONT', tipo: 'I', largo: 4 }, { nombre: 'NUMOC', tipo: 'C', largo: 15 },
    { nombre: 'FECHA', tipo: 'D', largo: 8 }, { nombre: 'ANULADA', tipo: 'L', largo: 1 },
  ], [
    { IDOC: 'OC-9', IDCONT: 100, NUMOC: 'OC-2026-031', FECHA: '2026-09-15', ANULADA: false },
    { IDOC: 'OC-10', IDCONT: 100, NUMOC: 'OC-2026-032', FECHA: '2026-09-20', ANULADA: true },
  ]);
  escribirDbf(path.join(dir, 'OCDET.DBF'), [
    { nombre: 'IDOC', tipo: 'C', largo: 8 }, { nombre: 'ITEM', tipo: 'N', largo: 3 }, { nombre: 'ITEMCONT', tipo: 'N', largo: 3 },
    { nombre: 'CANTIDAD', tipo: 'B', largo: 8 }, { nombre: 'CANTENT', tipo: 'B', largo: 8 },
  ], [
    { IDOC: 'OC-9', ITEM: 1, ITEMCONT: 1, CANTIDAD: 300, CANTENT: 100 },
    { IDOC: 'OC-10', ITEM: 1, ITEMCONT: 1, CANTIDAD: 50, CANTENT: 0 },
  ]);
  fs.writeFileSync(path.join(dir, 'CRONOG.csv'),
    'IDOC;ITEM;NROENT;FECENT;CANTIDAD;CANTENT;LUGAR;ESTADO\nOC-9;1;1;2026-11-10;120;0;"Hospital; sede norte";P\nOC-9;1;2;2026-10-23;80;30;Hospital;P\nOC-9;1;3;2026-09-30;100;100;Hospital;E\n');
  escribirDbf(path.join(dir, 'SALDOS.DBF'), [
    { nombre: 'CODPRO', tipo: 'C', largo: 10 }, { nombre: 'CODALM', tipo: 'C', largo: 2 }, { nombre: 'STOCK', tipo: 'N', largo: 10, decimales: 2 },
    { nombre: 'COSTO', tipo: 'N', largo: 10, decimales: 4 }, { nombre: 'LOTE', tipo: 'C', largo: 10 }, { nombre: 'FECVEN', tipo: 'D', largo: 8 },
  ], [
    { CODPRO: 'MED-001', CODALM: '01', STOCK: 70, COSTO: 4, LOTE: '', FECVEN: null },
    { CODPRO: 'MED-002', CODALM: '01', STOCK: 5, COSTO: 8, LOTE: 'l1', FECVEN: '2026-12-27' },
    { CODPRO: 'MED-002', CODALM: '01', STOCK: 3, COSTO: 8, LOTE: 'L0', FECVEN: '2026-10-18' },
    { CODPRO: 'MED-003', CODALM: '01', STOCK: 0, COSTO: 3, LOTE: '', FECVEN: null },
  ]);
  return dir;
}

const ALMACEN = '58000000-0000-4000-8000-000000000004';
const SUCURSAL = '58000000-0000-4000-8000-000000000005';
function mapeo() {
  const m = JSON.parse(fs.readFileSync(new URL('./mapeo-fox.ejemplo.json', import.meta.url), 'utf8'));
  m.salidas.stock.columnas.sucursal_id = { valor: SUCURSAL };
  m.salidas.stock.columnas.almacen_id = { mapa: 'CODALM', valores: { '01': ALMACEN } };
  return m;
}

test('lee tipos Visual FoxPro, CP850, memo y registros borrados', () => {
  const dir = extractoSintetico();
  const t = leerDbf(path.join(dir, 'CONTRATO.DBF'));
  assert.equal(t.version, 'Visual FoxPro');
  assert.equal(t.codificacion, 'cp850');
  assert.equal(t.registros_declarados, 3);
  assert.equal(t.borrados, 1);
  assert.equal(t.filas.length, 2);
  assert.equal(t.filas[0].DESCRIP, 'Suministro de insumos para niÑos');
  assert.equal(t.filas[0].NOTAS, 'Adenda 1 firmada');
  assert.equal(t.filas[0].FECINI, '2026-01-01');
  assert.equal(t.filas[0].ALTA, '2025-12-20T10:30:00Z');
  assert.equal(t.filas[0].IDCONT, 100);
  assert.equal(leerDbf(path.join(dir, 'CONTDET.DBF')).filas[0].PRECIO, 12.5);
  assert.equal(leerDbf(path.join(dir, 'OCCAB.DBF')).filas[1].ANULADA, true);
  assert.equal(leerCsv(path.join(dir, 'CRONOG.csv')).filas[0].LUGAR, 'Hospital; sede norte');
});

test('perfila volumen, claves, histórico y alertas de calidad', () => {
  const perfil = perfilarCarpeta(extractoSintetico());
  const contrato = perfil.tablas.find((t) => t.archivo === 'CONTRATO.DBF');
  assert.deepEqual(contrato.claves_candidatas.includes('IDCONT'), true);
  assert.equal(contrato.registros, 2);
  assert.equal(contrato.registros_borrados, 1);
  assert.deepEqual(contrato.historico.find((h) => h.campo === 'FECINI'), { campo: 'FECINI', desde: '2025-01-01', hasta: '2026-01-01' });
  assert.ok(contrato.alertas.includes('1 registros marcados como borrados (no se migran)'));
  // IDCONT se repite en el detalle: la clave del origen es compuesta.
  const detalle = perfil.tablas.find((t) => t.archivo === 'CONTDET.DBF');
  assert.equal(detalle.claves_candidatas.includes('IDCONT'), false);
  assert.equal(detalle.campos.find((c) => c.nombre === 'IDCONT').distintos, 2);
  assert.match(perfilMarkdown(perfil), /\| CONTRATO\.DBF \| Visual FoxPro \(cp850\) \| 2 \| 1 \|/);
});

test('transforma a las plantillas del ERP con totales de control de saldos abiertos', () => {
  const dir = extractoSintetico();
  const r = transformar(mapeo(), cargarTablas(dir, { codificacion: 'cp850' }));
  // Contrato 200 cerrado (filtro) y 300 borrado; la línea agotada se conserva para trazabilidad.
  assert.deepEqual(r.salidas.contratos.map((f) => [f.id_origen_contrato, f.id_origen_linea, f.moneda]), [[100, 1, 'PEN'], [100, 2, 'PEN']]);
  assert.deepEqual(r.salidas.oc.map((f) => f.id_origen_oc), ['OC-9']);
  assert.deepEqual(r.salidas.cronograma.map((f) => f.id_origen_entrega), ['OC-9-1-1', 'OC-9-1-2']);
  assert.deepEqual(r.salidas.stock.map((f) => [f.external_id_producto, f.lote, f.almacen_id]),
    [['MED-001', '', ALMACEN], ['MED-002', 'l1', ALMACEN], ['MED-002', 'L0', ALMACEN]]);
  assert.deepEqual(r.control, {
    contratos: { registros: 1, lineas: 1, cantidad: 400, valor: 5000 },
    oc: { registros: 1, lineas: 1, cantidad: 200, valor: 2500 },
    entregas: { registros: 2, cantidad: 170 },
    stock: { registros: 3, lotes: 2, cantidad: 78, valor: 344 },
  });
  assert.equal(r.extracto.contratos.descartadas, 1);

  const salida = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-salida-'));
  escribir(r, salida, mapeo());
  const contratos = fs.readFileSync(path.join(salida, 'contratos_suministro.csv'), 'utf8').split('\n');
  assert.equal(contratos[0], COLUMNAS.contratos.join(','));
  assert.equal(contratos[1], '100,LP-012-2026,CLI-45,Suministro de insumos para niÑos,PEN,2026-01-01,2026-12-31,1,MED-001,1000,600,12.5,VIGENTE,,');
  const cronograma = fs.readFileSync(path.join(salida, 'cronograma_suministro.csv'), 'utf8');
  assert.match(cronograma, /OC-9-1-1,OC-9,1,2026-11-10,120,Hospital; sede norte,0/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(salida, 'control.json'), 'utf8')), r.control);
});

test('un mapeo inválido falla con el campo exacto', () => {
  const dir = extractoSintetico();
  const m = mapeo();
  m.salidas.contratos.columnas.numero = 'C.NUMEROX';
  assert.throws(() => transformar(m, cargarTablas(dir)), /Campo inexistente "C\.NUMEROX"/);
  const m2 = mapeo();
  m2.salidas.contratos.columnas.moneda = { mapa: 'C.MONEDA', valores: { D: 'USD' } };
  assert.throws(() => transformar(m2, cargarTablas(dir)), /Valor "S" sin correspondencia/);
});

test('archiva el extracto completo en tandas, con borrados, redacción y cierre por conteo', async () => {
  const dir = extractoSintetico();
  escribirDbf(path.join(dir, 'USUARIOS.DBF'), [{ nombre: 'USUARIO', tipo: 'C', largo: 10 }, { nombre: 'CLAVE', tipo: 'C', largo: 20 }],
    [{ USUARIO: 'ADMIN', CLAVE: 'secreto123' }, { USUARIO: 'CAJA1', CLAVE: '' }]);
  const llamadas = [];
  const fetch = async (url, init) => {
    const ruta = new URL(url).pathname.replace('/api', '');
    const cuerpo = init.body ? JSON.parse(init.body) : null;
    llamadas.push({ ruta, cuerpo, clave: init.headers['idempotency-key'], auth: init.headers.authorization });
    const data = ruta.endsWith('/lotes') ? { id: 'lote-1', estado: 'CARGANDO' }
      : ruta.endsWith('/filas') ? { nuevas: cuerpo.filas.length, existentes: 0 } : { estado: 'COMPLETO' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data }) };
  };
  const r = await archivarCarpeta({ carpeta: dir, api: 'http://127.0.0.1:1/api', token: 't0k3n', lote: 'fox-2026-10', tanda: 2, fetch });
  assert.equal(r.estado, 'COMPLETO');
  // CONTRATO incluye su registro borrado: el archivo es íntegro.
  assert.equal(r.tablas.CONTRATO, 3);
  assert.equal(r.borrados.CONTRATO, 1);
  assert.deepEqual(r.redactados, { USUARIOS: ['CLAVE'] });
  const { CAMPO_SENSIBLE } = await import('./archivar-fox.mjs');
  assert.deepEqual(['USR_CLAVE', 'PASSWD2', 'PIN', 'API_KEY', 'NROTARJETA', 'SPINNER', 'KEYWORD', 'CODPRO'].filter((c) => CAMPO_SENSIBLE.test(c)),
    ['USR_CLAVE', 'PASSWD2', 'PIN', 'API_KEY', 'NROTARJETA']);
  const contrato = llamadas.filter((l) => l.cuerpo?.tabla === 'CONTRATO').flatMap((l) => l.cuerpo.filas);
  assert.deepEqual(contrato.map((f) => f.clave), ['1', '2', '3']);
  assert.equal(contrato[2].fila._borrado, true);
  const usuarios = llamadas.filter((l) => l.cuerpo?.tabla === 'USUARIOS').flatMap((l) => l.cuerpo.filas);
  assert.deepEqual(usuarios.map((f) => f.fila.CLAVE), ['[REDACTADO]', '']);
  assert.ok(llamadas.filter((l) => l.ruta.endsWith('/filas')).every((l) => l.cuerpo.filas.length <= 2));
  assert.equal(llamadas[0].clave, 'fox-2026-10:crear');
  const cierre = llamadas.at(-1);
  assert.equal(cierre.clave, 'fox-2026-10:cerrar');
  assert.deepEqual(cierre.cuerpo.tablas, r.tablas);
  assert.ok(llamadas.every((l) => l.auth === 'Bearer t0k3n'));
});

test('reintenta lo transitorio y detiene el lote ante un rechazo de negocio', async () => {
  const dir = extractoSintetico();
  let n = 0;
  const fetch = async (url) => {
    n++;
    if (n === 2) return { ok: false, status: 503, text: async () => '' };
    if (new URL(url).pathname.endsWith('/filas') && n > 4)
      return { ok: false, status: 409, text: async () => JSON.stringify({ message: 'Una fila ya archivada llegó con otro contenido' }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: { id: 'l', nuevas: 1, existentes: 0 } }) };
  };
  await assert.rejects(archivarCarpeta({ carpeta: dir, api: 'http://127.0.0.1:1/api', token: 't', lote: 'x', fetch, esperar: async () => {} }),
    /409: Una fila ya archivada/);
});

test('transforma maestros y saldos con control en moneda local y sólo lo abierto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-maestros-'));
  escribirDbf(path.join(dir, 'BANCOS.DBF'), [{ nombre: 'CODBAN', tipo: 'C', largo: 4 }, { nombre: 'MONEDA', tipo: 'C', largo: 1 },
    { nombre: 'SALDO', tipo: 'N', largo: 14, decimales: 2 }, { nombre: 'TC', tipo: 'N', largo: 8, decimales: 4 }],
  [{ CODBAN: 'B1', MONEDA: 'S', SALDO: 1000, TC: 0 }, { CODBAN: 'B2', MONEDA: 'D', SALDO: 100, TC: 3.75 }]);
  escribirDbf(path.join(dir, 'OCCDET.DBF'), [{ nombre: 'IDOC', tipo: 'C', largo: 4 }, { nombre: 'CANT', tipo: 'N', largo: 8 },
    { nombre: 'CANREC', tipo: 'N', largo: 8 }, { nombre: 'PRECIO', tipo: 'N', largo: 8, decimales: 2 }],
  [{ IDOC: 'O1', CANT: 10, CANREC: 4, PRECIO: 2.5 }, { IDOC: 'O1', CANT: 5, CANREC: 5, PRECIO: 1 }, { IDOC: 'O2', CANT: 3, CANREC: 3, PRECIO: 1 }]);
  const r = transformar({ salidas: {
    cuentas_bancarias: { tabla: 'BANCOS', columnas: { id_origen_cuenta: 'CODBAN', moneda: { mapa: 'MONEDA', valores: { S: 'PEN', D: 'USD' } },
      saldo_apertura: 'SALDO', tipo_cambio: 'TC' } },
    oc_compra: { tabla: 'OCCDET', columnas: { id_origen_oc: 'IDOC', cantidad_original: 'CANT', cantidad_recibida: 'CANREC', precio_unitario: 'PRECIO' } },
  } }, cargarTablas(dir));
  assert.deepEqual(r.control.cuentas_bancarias, { registros: 2, saldo_local: 1375 });
  assert.deepEqual(r.control.oc_compra, { registros: 1, lineas: 1, cantidad: 6, valor: 15 });
  assert.equal(r.salidas.cuentas_bancarias[1].tipo_cambio, 3.75);
});

test('el ERP FOX sintético es determinista y su balance cuadra con bancos, cartera, stock y proveedores', async () => {
  const { generarExtracto } = await import('./simulacion/generar-fox.mjs');
  const mapeoSim = JSON.parse(fs.readFileSync(new URL('./simulacion/mapeo-simulacion.json', import.meta.url), 'utf8'));
  const variante = (op) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-sim-'));
    const g = generarExtracto(dir, { escala: 0.1, ...op });
    return { g, r: transformar(mapeoSim, cargarTablas(dir, { codificacion: 'cp850' })) };
  };
  const v1 = variante({}), v2 = variante({ corregido: true }), v3 = variante({ corregido: true, cambio: true });
  assert.deepEqual(v1.g.plantados.map((p) => p.archivo), ['clientes', 'proveedores', 'productos', 'cxc', 'contratos', 'stock', 'stock']);
  // Fuera de lo sembrado, cada lote tiene un solo vencimiento en todos los almacenes.
  const vence = new Map();
  for (const s of v2.r.salidas.stock.filter((x) => x.lote)) {
    const k = `${s.external_id_producto}|${String(s.lote).toUpperCase()}`;
    assert.equal(vence.get(k) ?? s.fecha_vencimiento, s.fecha_vencimiento, k);
    vence.set(k, s.fecha_vencimiento);
  }
  assert.deepEqual(v2.g.plantados, []);
  // La variante con cambio sólo altera el precio de un producto ya migrado.
  const distintos = v3.r.salidas.productos.filter((p, i) => JSON.stringify(p) !== JSON.stringify(v2.r.salidas.productos[i]));
  assert.deepEqual(distintos.map((p) => p.id_origen_producto), ['MED-0001']);
  for (const s of Object.keys(v2.r.salidas)) if (s !== 'productos') assert.deepEqual(v3.r.salidas[s], v2.r.salidas[s], s);
  const c = v2.r.control;
  assert.equal(c.balance.debe, c.balance.haber);
  const linea = (cuenta) => v2.r.salidas.balance.filter((l) => l.cuenta_contable_codigo === cuenta).reduce((s, l) => s + l.debe - l.haber, 0);
  assert.equal(Math.round(['104101', '104102', '104103', '104104'].reduce((s, k) => s + linea(k), 0) * 100) / 100, c.cuentas_bancarias.saldo_local);
  assert.equal(linea('1212'), c.cxc.saldo);
  assert.equal(-linea('4212'), c.cxp.saldo);
  assert.equal(linea('2011'), c.stock.valor);
  assert.ok(v2.r.salidas.stock.every((s) => s.almacen_codigo.startsWith('FOX-')));
});
