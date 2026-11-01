// Control de cobertura del manual. No juzga si la explicación es buena: comprueba lo que sí
// puede comprobarse sin leer, para que una pantalla o un permiso nuevos no queden sin documentar.
//   node scripts/manual/verificar-manual.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manual = path.join(root, 'manual');
const errores = [];
const leer = (f) => fs.readFileSync(path.join(manual, f), 'utf8');
const andar = (dir, salida = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) andar(p, salida);
    else salida.push(p);
  }
  return salida;
};
const redactados = ['MANUAL_DEL_PRODUCTO.md', 'DETALLE_DE_PROCEDIMIENTOS.md', 'GUIAS_POR_ROL.md', 'PROCESOS_EMPRESARIALES.md', 'GUIA_TECNICA_Y_OPERATIVA.md'];
const textos = Object.fromEntries(redactados.map((f) => [f, leer(f)]));
const todo = Object.values(textos).join('\n');

// Pantallas: toda ruta existe en el inventario con capítulo, y lo citado existe de verdad.
const web = path.join(root, 'apps/web/app');
const pantallas = new Set(andar(path.join(web, 'dashboard')).filter((p) => path.basename(p) === 'page.tsx')
  .map((p) => `/${path.relative(web, path.dirname(p)).split(path.sep).join('/')}`));
const inventario = leer('INVENTARIO_DE_PANTALLAS.md');
for (const r of pantallas) {
  if (!inventario.includes(`\`${r}\``)) errores.push(`Pantalla fuera del inventario: ${r}`);
}
if (inventario.includes('sin capítulo')) errores.push('Hay pantallas sin capítulo en el inventario');
for (const m of todo.matchAll(/\/dashboard[/a-zA-Z0-9\-[\]_]*/g)) {
  const c = m[0].replace(/\/$/, '');
  if (!pantallas.has(c) && ![...pantallas].some((p) => p.startsWith(`${c}/`))) errores.push(`Pantalla citada que no existe: ${c}`);
}

// Capítulos: el inventario no apunta a un capítulo inexistente.
const capitulos = new Set([...textos['MANUAL_DEL_PRODUCTO.md'].matchAll(/^## (\d{2})\. /gm)].map((m) => m[1]));
for (const m of inventario.matchAll(/\| (\d{2}) \|$/gm)) {
  if (!capitulos.has(m[1])) errores.push(`El inventario cita el capítulo ${m[1]}, que no existe`);
}

// Permisos: lo citado en el texto existe en el catálogo del API.
const api = leer('REFERENCIA_API_Y_PERMISOS.md');
const familias = /^(compras|ventas|inventario|migration|alertas|reports|integraciones|finanzas|contabilidad|rrhh)\.[a-z_]+\.[a-z_]+$/;
for (const m of todo.matchAll(/`([a-z_]+\.[a-z_]+\.[a-z_]+)`/g)) {
  if (familias.test(m[1]) && !api.includes(m[1])) errores.push(`Permiso citado que ningún controlador declara: ${m[1]}`);
}

// Lenguaje: el manual es para quien opera; no habla de pruebas internas ni de clientes concretos.
const prohibidos = [[/\bUAT\w*/g, 'referencia a pruebas internas'], [/candidato (local|documentado)/gi, 'versión de trabajo'],
  [/\bcodex\b/gi, 'herramienta interna'], [/\b1\.012\b|\b19\.598\b/g, 'conteo de la matriz de pruebas']];
for (const [f, t] of Object.entries(textos)) {
  for (const [re, motivo] of prohibidos) {
    const n = (t.match(re) ?? []).length;
    if (n) errores.push(`${f}: ${n} × ${motivo} (${re})`);
  }
}

if (errores.length) {
  console.error(errores.join('\n'));
  process.exit(1);
}
console.log(`Manual OK: ${pantallas.size} pantallas, ${capitulos.size} capítulos.`);
