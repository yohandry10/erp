// Pruebas de las herramientas FOX con tablas Visual FoxPro sintéticas (sólo locales).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { leerDbf, leerCsv } from './fox-dbf.mjs';
import { perfilarCarpeta, perfilMarkdown } from './perfilar-fox.mjs';
import { cargarTablas, COLUMNAS, escribir, transformar } from './transformar-fox.mjs';

// Escribe una tabla VFP (0x30) con página CP850 y memo .fpt opcional.
function escribirDbf(archivo, campos, filas, { borrados = [] } = {}) {
  const largoRegistro = 1 + campos.reduce((s, c) => s + c.largo, 0);
  const largoCabecera = 32 + campos.length * 32 + 1 + 263;
  const cab = Buffer.alloc(largoCabecera);
  cab[0] = 0x30; cab[1] = 126; cab[2] = 10; cab[3] = 28;
  cab.writeUInt32LE(filas.length, 4);
  cab.writeUInt16LE(largoCabecera, 8);
  cab.writeUInt16LE(largoRegistro, 10);
  const conMemo = campos.some((c) => c.tipo === 'M');
  cab[28] = conMemo ? 0x02 : 0;
  cab[29] = 0x02;
  let desp = 1;
  campos.forEach((c, i) => {
    const o = 32 + i * 32;
    cab.write(c.nombre, o, 'latin1');
    cab[o + 11] = c.tipo.charCodeAt(0);
    cab.writeUInt32LE(desp, o + 12);
    cab[o + 16] = c.largo;
    cab[o + 17] = c.decimales ?? 0;
    desp += c.largo;
  });
  cab[32 + campos.length * 32] = 0x0d;
  const memos = [];
  const registros = filas.map((fila, r) => {
    const reg = Buffer.alloc(largoRegistro, 0x20);
    reg[0] = borrados.includes(r) ? 0x2a : 0x20;
    let p = 1;
    for (const c of campos) {
      const v = fila[c.nombre];
      const celda = reg.subarray(p, p + c.largo);
      if (c.tipo === 'C') {
        // CP850: Ñ = 0xA5, ñ = 0xA4; el resto ASCII.
        Buffer.from([...String(v ?? '')].map((ch) => (ch === 'Ñ' ? 0xa5 : ch === 'ñ' ? 0xa4 : ch.charCodeAt(0)))).copy(celda);
      } else if (c.tipo === 'N') {
        celda.write(v === null ? ''.padStart(c.largo) : Number(v).toFixed(c.decimales ?? 0).padStart(c.largo), 'latin1');
      } else if (c.tipo === 'D') {
        celda.write(v ? v.replace(/-/g, '') : '        ', 'latin1');
      } else if (c.tipo === 'I') celda.writeInt32LE(v, 0);
      else if (c.tipo === 'Y') celda.writeBigInt64LE(BigInt(Math.round(v * 10000)), 0);
      else if (c.tipo === 'B') celda.writeDoubleLE(v, 0);
      else if (c.tipo === 'L') celda.write(v ? 'T' : 'F', 'latin1');
      else if (c.tipo === 'T') {
        const d = new Date(v);
        celda.writeInt32LE(Math.floor(d.getTime() / 86400000) + 2440588, 0);
        celda.writeInt32LE(d.getTime() % 86400000, 4);
      } else if (c.tipo === 'M') {
        if (v) { memos.push(v); celda.writeInt32LE(8 + memos.length - 1, 0); }
        else celda.writeInt32LE(0, 0);
      }
      p += c.largo;
    }
    return reg;
  });
  fs.writeFileSync(archivo, Buffer.concat([cab, ...registros, Buffer.from([0x1a])]));
  if (conMemo) {
    const bloque = 64;
    const fpt = Buffer.alloc(512 + memos.length * bloque);
    fpt.writeUInt32BE(8 + memos.length, 0);
    fpt.writeUInt16BE(bloque, 6);
    memos.forEach((m, i) => {
      const o = (8 + i) * bloque;
      fpt.writeUInt32BE(1, o);
      fpt.writeUInt32BE(Buffer.byteLength(m, 'latin1'), o + 4);
      fpt.write(m, o + 8, 'latin1');
    });
    fs.writeFileSync(archivo.replace(/\.dbf$/i, '.fpt'), fpt);
  }
}

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
