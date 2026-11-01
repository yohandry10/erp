// Empaqueta la evidencia cruda de una versión para guardarla fuera de Git y deja sus huellas.
// Deja fuera lo que se reconstruye (binarios, dependencias) y lo que no debe salir (secretos).
//   node scripts/cierre/empaquetar-evidencia.mjs <salida-sin-extensión> <carpeta-artifacts>...
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [salida, ...raices] = process.argv.slice(2);
if (!salida || !raices.length) {
  console.error('Uso: empaquetar-evidencia.mjs <salida-sin-extensión> <carpeta-artifacts>...');
  process.exit(1);
}
const FUERA_CARPETA = new Set(['node_modules', '.git', 'target', '.next', 'source', 'db-backups', 'storage-backups', 'exportaciones']);
const FUERA_ARCHIVO = /\.(exe|dll|pack|pdb|msi|pfx|p12|pem|key|jks|keystore|har)$|\.env(\.|$)|^credentials|^id_rsa|^\.npmrc$/i;

const lista = [], omitidos = {};
let bytes = 0;
const pila = [...raices];
while (pila.length) {
  const d = pila.pop();
  let entradas;
  try { entradas = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
  for (const e of entradas) {
    if (e.isSymbolicLink()) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!FUERA_CARPETA.has(e.name)) pila.push(p);
    } else if (FUERA_ARCHIVO.test(e.name)) {
      const x = path.extname(e.name).toLowerCase() || e.name;
      omitidos[x] = (omitidos[x] || 0) + 1;
    } else {
      lista.push(p.split(path.sep).join('/').replace(/^[A-Za-z]:\//, ''));
      bytes += fs.statSync(p).size;
    }
  }
}
fs.mkdirSync(path.dirname(salida), { recursive: true });
const listaRuta = `${salida}.lista.txt`;
fs.writeFileSync(listaRuta, `${lista.join('\n')}\n`);
// Rutas relativas a la raíz: tar interpreta "C:" como un host remoto.
const desdeRaiz = (p) => p.split(path.sep).join('/').replace(/^[A-Za-z]:\//, '');
const tar = spawnSync('tar', ['-czf', desdeRaiz(`${salida}.tar.gz`), '-T', desdeRaiz(listaRuta)], { stdio: 'inherit', cwd: 'C:/' });
if (tar.status !== 0) process.exit(tar.status ?? 1);

const hash = crypto.createHash('sha256');
for await (const trozo of fs.createReadStream(`${salida}.tar.gz`)) hash.update(trozo);
const resumen = { archivos: lista.length, bytesOriginales: bytes, bytesPaquete: fs.statSync(`${salida}.tar.gz`).size, sha256: hash.digest('hex'), omitidos };
fs.writeFileSync(`${salida}.resumen.json`, `${JSON.stringify(resumen, null, 2)}\n`);
console.log(JSON.stringify(resumen));
