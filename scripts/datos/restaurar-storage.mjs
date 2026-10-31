#!/usr/bin/env node
// Restaura un respaldo de Storage en un Storage local y verifica cada objeto
// por SHA-256. Nunca escribe en un proyecto remoto: recuperar PROD sigue el
// procedimiento de operaciones destructivas.
//
// node scripts/datos/restaurar-storage.mjs --respaldo <dir> --storage-url http://127.0.0.1:<puerto> --clave-env <VARIABLE> [--prefijo <tenant>/]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { clienteStorage, exigirLoopback, sha256 } from './storage-api.mjs';

export async function restaurar({ respaldo, url, clave, prefijo = '' }) {
  exigirLoopback(url);
  const manifiesto = JSON.parse(fs.readFileSync(path.join(respaldo, 'manifiesto.json'), 'utf8'));
  const objetos = manifiesto.objetos.filter((o) => o.nombre.startsWith(prefijo));
  // El respaldo debe estar íntegro antes de escribir nada.
  for (const o of objetos) {
    const datos = fs.readFileSync(path.join(respaldo, 'objetos', o.bucket, ...o.nombre.split('/')));
    if (sha256(datos) !== o.sha256) throw new Error(`Respaldo alterado: ${o.bucket}/${o.nombre}`);
  }
  const storage = clienteStorage(url, clave);
  const existentes = new Map((await storage.buckets()).map((b) => [b.id, b]));
  const usados = new Set(objetos.map((o) => o.bucket));
  for (const b of manifiesto.buckets.filter((x) => usados.has(x.id) || !prefijo)) {
    const actual = existentes.get(b.id);
    if (!actual) await storage.crearBucket(b);
    else if (Boolean(actual.public) !== Boolean(b.public))
      throw new Error(`El bucket ${b.id} existe con otra visibilidad; no se mezcla`);
  }
  const resultado = { restaurados: 0, ya_presentes: 0, verificados: 0 };
  for (const o of objetos) {
    const datos = fs.readFileSync(path.join(respaldo, 'objetos', o.bucket, ...o.nombre.split('/')));
    const estado = await storage.subir(o.bucket, o.nombre, datos, o.tipo);
    if (estado === 'SUBIDO') resultado.restaurados++;
    else resultado.ya_presentes++;
  }
  // Verificación independiente: se vuelve a descargar todo lo restaurado.
  for (const o of objetos) {
    const { datos } = await storage.descargar(o.bucket, o.nombre);
    if (sha256(datos) !== o.sha256) throw new Error(`El objeto restaurado difiere: ${o.bucket}/${o.nombre}`);
    resultado.verificados++;
  }
  return { ...resultado, objetos: objetos.length, buckets: usados.size };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const arg = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const variable = arg('--clave-env');
  if (!arg('--respaldo') || !arg('--storage-url') || !variable || !process.env[variable])
    throw new Error('Uso: --respaldo <dir> --storage-url http://127.0.0.1:<puerto> --clave-env <VARIABLE> [--prefijo <tenant>/]');
  const res = await restaurar({ respaldo: path.resolve(arg('--respaldo')), url: arg('--storage-url'), clave: process.env[variable],
    prefijo: arg('--prefijo') ?? '' });
  console.log(JSON.stringify(res, null, 2));
}
