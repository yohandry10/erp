// Genera desde el código las referencias del manual que no deben escribirse a mano:
// el inventario de pantallas y las operaciones del API con el permiso que exigen.
//   node scripts/manual/generar-referencias.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manual = path.join(root, 'manual');
const andar = (dir, salida = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) andar(p, salida);
    else salida.push(p);
  }
  return salida;
};
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

// Pantallas: el capítulo sale del mapa; una ruta nueva sin capítulo detiene la generación.
const CAPITULOS = [
  ['analytics', 46], ['migracion', 45], ['alertas', 43], ['tablero-suministro', 43], ['ventas/contratos', 43],
  ['inventario/lotes', 44], ['offline', 39], ['ventas/clientes', 5], ['ventas/comercial', 8], ['ventas/cotizaciones', 8],
  ['ventas/aprobaciones', 8], ['ventas/pedidos', 9], ['ventas/rma', 10], ['ventas', 8], ['compras/proveedores', 5],
  ['compras/recepciones', 14], ['compras/devoluciones', 14], ['compras', 13], ['inventario/recepciones', 14],
  ['inventario/productos', 6], ['inventario/logistica', 9], ['inventario', 7], ['pos', 11], ['cajas', 12], ['cpe', 15],
  ['gre', 16], ['documentos', 17], ['finanzas/cxc', 18], ['finanzas/cxp', 19], ['finanzas/bancos', 21],
  ['finanzas/conciliacion', 21], ['finanzas', 22], ['contabilidad', 23], ['activos', 26], ['consolidacion', 30],
  ['reportes', 31], ['impuestos', 32], ['sire', 32], ['rrhh/planillas', 34], ['rrhh', 33], ['configuracion', 4],
  ['usuarios', 3], ['roles', 3], ['audit-logs', 37], ['ayuda', 37], ['notificaciones', 37], ['wizard', 2],
];
const capitulo = (ruta) => {
  const r = ruta.replace(/^\/dashboard\/?/, '');
  if (!r) return 1;
  const hit = CAPITULOS.find(([p]) => r === p || r.startsWith(`${p}/`));
  return hit ? hit[1] : null;
};
const web = path.join(root, 'apps/web/app');
const pantallas = andar(path.join(web, 'dashboard')).filter((p) => path.basename(p) === 'page.tsx')
  .map((p) => `/${path.relative(web, path.dirname(p)).split(path.sep).join('/')}`).sort();
const sinCapitulo = [];
const filasPantalla = pantallas.map((ruta) => {
  const n = capitulo(ruta);
  if (n === null) { sinCapitulo.push(ruta); return ''; }
  return `| \`${ruta}\` | ${String(n).padStart(2, '0')} |`;
});
if (sinCapitulo.length) {
  // Se avisa sin detener: el control del manual es quien exige que no falte ninguna.
  console.warn(`Pantallas sin capítulo asignado: ${sinCapitulo.join(', ')}`);
}
fs.writeFileSync(path.join(manual, 'INVENTARIO_DE_PANTALLAS.md'), `# Inventario de pantallas

Generado desde el código con \`node scripts/manual/generar-referencias.mjs\`; no se edita a mano. ${pantallas.length} pantallas. Que una ruta exista no significa que todo usuario pueda abrirla: depende de sus permisos.

Un segmento \`[id]\` representa un registro: se llega desde el listado, no escribiéndolo.

| Pantalla | Capítulo del manual |
|---|---|
${filasPantalla.filter(Boolean).join('\n')}
${sinCapitulo.map((r) => `| \`${r}\` | sin capítulo |`).join('\n')}
`);

// API: método, ruta y permiso, leídos de los decoradores de cada controlador.
const VERBOS = /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/;
const PERMISO = /@RequirePermissions?\(([^)]*)\)/;
const controladores = andar(path.join(root, 'apps/erp-api/src')).filter((p) => p.endsWith('.controller.ts'));
const porModulo = new Map();
let operaciones = 0;
let sinPermiso = 0;
for (const archivo of controladores.sort()) {
  const lineas = fs.readFileSync(archivo, 'utf8').split(/\r?\n/);
  // Un archivo puede declarar otras clases antes del controlador: se parte de su decorador.
  const decorador = lineas.findIndex((l) => /^@Controller\(/.test(l));
  if (decorador < 0) continue;
  const inicioClase = lineas.findIndex((l, n) => n > decorador && /^export class /.test(l));
  const cabecera = lineas.slice(Math.max(decorador - 8, 0), inicioClase).join('\n');
  const base = cabecera.match(/@Controller\(\s*(?:\{[^}]*path:\s*)?['"`]([^'"`]*)['"`]/)?.[1];
  const permisoClase = cabecera.match(PERMISO)?.[1];
  for (let i = inicioClase; i < lineas.length; i += 1) {
    const verbo = lineas[i].match(VERBOS);
    if (!verbo) continue;
    // Los decoradores de un método van juntos, antes o después del verbo, hasta su firma.
    let permiso = null;
    for (let j = i - 1; j >= 0 && /^\s*(@|\/\/|\*|\/\*|['"`\w.,)\]}{(\[:\s-]+$)/.test(lineas[j]) && i - j < 25; j -= 1) {
      if (/^\s*(async\s+)?\w+\(.*\{\s*$/.test(lineas[j]) || /^\s*\}\s*$/.test(lineas[j])) break;
      const m = lineas[j].match(PERMISO);
      if (m) { permiso = m[1]; break; }
    }
    for (let j = i + 1; !permiso && j < lineas.length && i + 25 > j; j += 1) {
      if (/^\s*(async\s+)?\w+\(/.test(lineas[j])) break;
      const m = lineas[j].match(PERMISO);
      if (m) permiso = m[1];
    }
    permiso = (permiso ?? permisoClase ?? '').replace(/['"`\s]/g, '').replace(/,/g, ' + ');
    const ruta = `/${[base, verbo[2]].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
    const modulo = rel(archivo).match(/modules\/([^/]+)/)?.[1] ?? 'general';
    if (!porModulo.has(modulo)) porModulo.set(modulo, []);
    porModulo.get(modulo).push(`| ${verbo[1].toUpperCase()} | \`/api${ruta}\` | ${permiso ? `\`${permiso}\`` : '-'} |`);
    operaciones += 1;
    if (!permiso) sinPermiso += 1;
  }
}
const secciones = [...porModulo.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([m, filas]) => `## ${m}\n\n| Método | Ruta | Permiso |\n|---|---|---|\n${[...new Set(filas)].join('\n')}\n`).join('\n');
fs.writeFileSync(path.join(manual, 'REFERENCIA_API_Y_PERMISOS.md'), `# Operaciones del API y permisos

Generado desde los decoradores de los controladores con \`node scripts/manual/generar-referencias.mjs\`; no se edita a mano. ${operaciones} operaciones. Si difiere del código, manda el código.

"-" significa que el controlador no declara un permiso con ese decorador: puede ser pública, usar otro guard o validar el permiso dentro de la operación. No debe leerse como acceso libre (${sinPermiso} casos). El permiso declarado no es lo único que se exige: también cuentan la empresa, la sucursal y el estado del registro.

${secciones}`);
console.log(JSON.stringify({ pantallas: pantallas.length, sinCapitulo, operaciones, sinPermiso, modulos: porModulo.size }));
