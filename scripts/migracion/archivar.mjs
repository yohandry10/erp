#!/usr/bin/env node
// Carga el extracto FOX completo al archivo íntegro del ERP (582): cada tabla
// tal cual, incluidos los registros borrados, en tandas idempotentes. El lote
// sólo se cierra si lo cargado coincide con lo leído. Es reanudable: repetir
// con la misma --lote no duplica filas y una fila que cambió se rechaza.
//
// Uso:
//   ERP_API_TOKEN=<token de un ADMIN> node scripts/fox/archivar-fox.mjs <carpeta-extracto> \
//     --api https://<api>/api --lote <clave-estable> [--descripcion "Extracto FOX"] \
//     [--fecha-corte AAAA-MM-DD] [--codificacion cp850] [--tanda 1000]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { leerTabla } from './fox-dbf.mjs';

const NOMBRE_TABLA = /^[A-Za-z0-9_.$-]{1,80}$/;
// Credenciales y medios de pago del FOX no se archivan: el archivo lo leen auditoría y gerencia.
// Misma regla que app.campo_sensible_582, que la aplica también en la base.
export const CAMPO_SENSIBLE = /(pass|pwd|clave|contras|secret|token|cvv|tarj|ccnum)|(^|_)(pin|key|apikey)(_|$)/i;
const MAX_TANDA = 2000;

/** Columnas que se redactan en el archivo. */
export const camposSensibles = (tabla) => tabla.campos.map((c) => c.nombre).filter((n) => CAMPO_SENSIBLE.test(n));

/** Filas a archivar: la clave es el número de registro físico, estable para el mismo archivo. */
export function filasArchivo(tabla) {
  const sensibles = camposSensibles(tabla);
  return tabla.filas.map((f) => {
    const fila = { ...f };
    for (const c of sensibles) if (fila[c] !== null && fila[c] !== undefined && fila[c] !== '') fila[c] = '[REDACTADO]';
    if (f._borrado) fila._borrado = true;
    return { clave: String(f._registro), fila };
  });
}

/** Tablas del extracto con su nombre de archivo sin extensión, en mayúsculas. */
export function tablasExtracto(carpeta, opciones = {}) {
  return fs.readdirSync(carpeta).filter((x) => /\.(dbf|csv)$/i.test(x)).sort().map((archivo) => {
    const nombre = archivo.replace(/\.[^.]+$/, '').toUpperCase();
    if (!NOMBRE_TABLA.test(nombre)) throw new Error(`Nombre de tabla no admitido por el archivo: ${archivo}`);
    return { nombre, tabla: leerTabla(path.join(carpeta, archivo), { ...opciones, incluirBorrados: true }) };
  });
}

// La API responde { success, data }; un interceptor global puede volver a envolverla.
const dato = (b) => (b && typeof b === 'object' && 'data' in b && ('success' in b || Object.keys(b).length === 1) ? dato(b.data) : b);

function cliente({ api, token, fetch: f = globalThis.fetch, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  return async function llamar(metodo, ruta, cuerpo, clave) {
    for (let intento = 1; ; intento++) {
      const res = await f(`${api.replace(/\/$/, '')}${ruta}`, {
        method: metodo,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(clave ? { 'idempotency-key': clave } : {}) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      const texto = await res.text();
      const cuerpoRes = texto ? JSON.parse(texto) : null;
      if (res.ok) return dato(cuerpoRes);
      // Sólo se reintenta lo transitorio; un rechazo de negocio se informa tal cual.
      if ((res.status === 429 || res.status >= 500) && intento < 4) { await esperar(500 * 2 ** intento); continue; }
      const msg = cuerpoRes?.message ?? cuerpoRes?.error ?? texto;
      throw new Error(`${metodo} ${ruta} → ${res.status}: ${Array.isArray(msg) ? msg.join('; ') : msg}`);
    }
  };
}

export async function archivarCarpeta({ carpeta, api, token, lote, descripcion, fechaCorte, codificacion, tanda = 1000, fetch, esperar, log = () => {} }) {
  if (!api || !token || !lote) throw new Error('Faltan --api, --lote o ERP_API_TOKEN');
  if (!(tanda >= 1 && tanda <= MAX_TANDA)) throw new Error(`--tanda debe estar entre 1 y ${MAX_TANDA}`);
  const llamar = cliente({ api, token, fetch, esperar });
  const tablas = tablasExtracto(carpeta, { codificacion });
  const creado = await llamar('POST', '/migration/fox/archivo/lotes', {
    descripcion: descripcion ?? `Extracto FOX ${path.basename(path.resolve(carpeta))}`, ...(fechaCorte ? { fechaCorte } : {}),
  }, `${lote}:crear`);
  const loteId = creado.id;
  const resumen = { lote_id: loteId, tablas: {}, borrados: {}, redactados: {}, tandas: 0, nuevas: 0, existentes: 0 };
  for (const { nombre, tabla } of tablas) {
    const filas = filasArchivo(tabla);
    resumen.tablas[nombre] = filas.length;
    resumen.borrados[nombre] = tabla.borrados;
    if (camposSensibles(tabla).length) resumen.redactados[nombre] = camposSensibles(tabla);
    for (let i = 0; i < filas.length; i += tanda) {
      const r = await llamar('POST', `/migration/fox/archivo/lotes/${loteId}/filas`, { tabla: nombre, filas: filas.slice(i, i + tanda) });
      resumen.tandas++;
      resumen.nuevas += r.nuevas;
      resumen.existentes += r.existentes;
    }
    log(`${nombre}: ${filas.length} filas (${tabla.borrados} borradas)`);
  }
  // Una tabla vacía no tiene filas que contar: no se declara.
  const declaradas = Object.fromEntries(Object.entries(resumen.tablas).filter(([, n]) => n > 0));
  const cierre = await llamar('POST', `/migration/fox/archivo/lotes/${loteId}/cerrar`, { tablas: declaradas }, `${lote}:cerrar`);
  return { ...resumen, estado: cierre.estado };
}

function argumentos(argv) {
  const [carpeta, ...resto] = argv;
  const op = {};
  for (let i = 0; i < resto.length; i += 2) op[resto[i].replace(/^--/, '')] = resto[i + 1];
  return { carpeta, ...op };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const a = argumentos(process.argv.slice(2));
  if (!a.carpeta || !a.api || !a.lote || !process.env.ERP_API_TOKEN) {
    console.error('Uso: ERP_API_TOKEN=<token> node scripts/fox/archivar-fox.mjs <carpeta-extracto> --api <url>/api --lote <clave> '
      + '[--descripcion "..."] [--fecha-corte AAAA-MM-DD] [--codificacion cp850] [--tanda 1000]');
    process.exit(2);
  }
  archivarCarpeta({
    carpeta: a.carpeta, api: a.api, token: process.env.ERP_API_TOKEN, lote: a.lote, descripcion: a.descripcion,
    fechaCorte: a['fecha-corte'], codificacion: a.codificacion, tanda: a.tanda ? Number(a.tanda) : 1000,
    log: (m) => console.error(m),
  }).then((r) => console.log(JSON.stringify(r, null, 2)), (e) => { console.error(e.message); process.exit(1); });
}
