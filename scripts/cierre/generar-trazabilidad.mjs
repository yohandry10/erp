// Genera la trazabilidad de una versión: requisito → capítulo → código → prueba → evidencia.
// La matriz y su evidencia viven fuera de Git; aquí sólo se escriben su índice y sus huellas.
//   node scripts/cierre/generar-trazabilidad.mjs <matriz.json> <carpeta-salida> <raíz-evidencia>...
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [matrizRuta, salida, ...raices] = process.argv.slice(2);
if (!matrizRuta || !salida || !raices.length) {
  console.error('Uso: generar-trazabilidad.mjs <matriz.json> <carpeta-salida> <raíz-evidencia>...');
  process.exit(1);
}
const matriz = JSON.parse(fs.readFileSync(matrizRuta, 'utf8'));

const CODIGO = {
  administracion: ['apps/web/app/dashboard/configuracion', 'apps/erp-api/src/modules/tenants'],
  'audit-logs': ['apps/web/app/dashboard/audit-logs', 'apps/erp-api/src/modules/audit'],
  ayuda: ['apps/web/app/dashboard/ayuda', 'apps/erp-api/src/modules/help'],
  cajas: ['apps/web/app/dashboard/cajas', 'apps/erp-api/src/modules/cajas'],
  compras: ['apps/web/app/dashboard/compras', 'apps/erp-api/src/modules/compras'],
  configuracion: ['apps/web/app/dashboard/configuracion', 'apps/erp-api/src/modules/configuracion'],
  contabilidad: ['apps/web/app/dashboard/contabilidad', 'apps/erp-api/src/modules/contabilidad'],
  cpe: ['apps/web/app/dashboard/cpe', 'apps/erp-api/src/modules/cpe'],
  documentos: ['apps/web/app/dashboard/documentos', 'apps/erp-api/src/modules/documentos'],
  finanzas: ['apps/web/app/dashboard/finanzas', 'apps/erp-api/src/modules/finanzas'],
  fiscal: ['apps/erp-api/src/modules/fiscal'],
  gre: ['apps/web/app/dashboard/gre', 'apps/erp-api/src/modules/gre'],
  inventario: ['apps/web/app/dashboard/inventario', 'apps/erp-api/src/modules/inventario'],
  offline: ['apps/web/app/dashboard/offline'],
  pos: ['apps/web/app/dashboard/pos', 'apps/erp-api/src/modules/pos'],
  rrhh: ['apps/web/app/dashboard/rrhh', 'apps/erp-api/src/modules/rrhh'],
  sire: ['apps/web/app/dashboard/sire', 'apps/erp-api/src/modules/sire'],
  usuarios: ['apps/web/app/dashboard/usuarios', 'apps/erp-api/src/modules/usuarios'],
  ventas: ['apps/web/app/dashboard/ventas', 'apps/erp-api/src/modules/ventas'],
  wizard: ['apps/web/app/dashboard/wizard'],
};

// Capítulos del manual por módulo, leídos del inventario generado desde el código.
const inventario = fs.readFileSync(path.join(root, 'manual/INVENTARIO_DE_PANTALLAS.md'), 'utf8');
const capitulos = {};
for (const m of inventario.matchAll(/^\| `\/dashboard\/([^/`]+)[^`]*` \| (\d{2}) \|$/gm)) {
  (capitulos[m[1]] ??= new Set()).add(m[2]);
}

// Regresión viva: un paso de la matriz cuenta sólo si su nombre aparece en una prueba del repositorio.
const andar = (d, s = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) andar(p, s);
    else if (/\.(mjs|js|ts|tsx|py|ps1)$/.test(e.name)) s.push(p);
  }
  return s;
};
const pruebas = [...andar(path.join(root, 'scripts/ci')), ...andar(path.join(root, 'apps/web/tests'))]
  .map((p) => [path.relative(root, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf8')]);
const encontrar = (paso) => pruebas.find(([, t]) => t.includes(paso))?.[0];

// Evidencia: se resuelve contra las raíces y se relativiza, sin rutas de la máquina de quien genera.
const relativa = (p) => {
  const n = p.split('\\').join('/');
  if (n.startsWith('artifacts/')) return n;
  const i = n.indexOf('/artifacts/');
  return i >= 0 ? n.slice(i + 1) : path.basename(n);
};
const resolver = (p) => {
  if (path.isAbsolute(p)) return fs.existsSync(p) ? p : null;
  for (const r of raices) if (fs.existsSync(path.join(r, p))) return path.join(r, p);
  return null;
};
const citadas = new Map();
const citar = (p) => { if (!citadas.has(p)) citadas.set(p, resolver(p)); };
const absolutas = (v, f) => {
  if (typeof v === 'string') { if (/^[A-Z]:[\\/]/.test(v)) f(v); }
  else if (Array.isArray(v)) v.forEach((x) => absolutas(x, f));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => absolutas(x, f));
};

const csv = (filas) => filas.map((f) => f.map((c) => `"${String(c ?? '').split('"').join('""')}"`).join(',')).join('\n') + '\n';
const trazas = [['requisito', 'modulo', 'operacion', 'capitulos_manual', 'codigo', 'criterios', 'estado_evidencia', 'pasos_en_pruebas_del_repo', 'prueba_del_repo', 'evidencias']];
const criterios = [['requisito', 'paso', 'evidencia', 'prueba_del_repo']];
let conRegresion = 0, pasosConRegresion = 0, pasosTotales = 0;
const memo = new Map();
for (const r of matriz.rows) {
  const pasos = r.variantAcceptanceCriteria;
  const evid = new Set();
  let vivos = 0, ejemplo = '';
  for (const c of pasos) {
    if (c.evidence) { evid.add(c.evidence); citar(c.evidence); }
    if (!memo.has(c.step)) memo.set(c.step, c.step ? encontrar(c.step) : undefined);
    const hallada = memo.get(c.step);
    if (hallada) { vivos++; ejemplo ||= hallada; }
    criterios.push([r.id, c.step, c.evidence, hallada ?? '']);
  }
  absolutas([r.completionEvidence, r.partialCompletionEvidence, r.sharedAcceptedEvidence, r.resolvedOriginalDefectCriteria], (p) => { citar(p); evid.add(relativa(p)); });
  pasosTotales += pasos.length;
  pasosConRegresion += vivos;
  if (vivos) conRegresion++;
  const codigo = CODIGO[r.module] ?? [];
  for (const c of codigo) if (!fs.existsSync(path.join(root, c))) throw new Error(`Ruta de código inexistente: ${c}`);
  trazas.push([r.id, r.module, r.operation, [...(capitulos[r.module] ?? [])].sort().join(' '), codigo.join(' '), pasos.length, r.evidenceStatus, `${vivos}/${pasos.length}`, ejemplo, [...evid].map(relativa).join(' ')]);
}

fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, 'TRAZABILIDAD.csv'), csv(trazas));
fs.writeFileSync(path.join(salida, 'CRITERIOS.csv'), csv(criterios));

// Huellas de la evidencia citada: es lo mínimo que debe sobrevivir al borrado local.
const huellas = [['archivo', 'bytes', 'sha256']];
let bytes = 0, faltan = 0;
const faltantes = [];
for (const [cita, real] of [...citadas].sort()) {
  if (!real) { faltan++; faltantes.push(relativa(cita)); huellas.push([relativa(cita), '', 'NO_ENCONTRADO']); continue; }
  const b = fs.readFileSync(real);
  bytes += b.length;
  huellas.push([relativa(cita), b.length, crypto.createHash('sha256').update(b).digest('hex')]);
}
fs.writeFileSync(path.join(salida, 'HUELLAS_EVIDENCIA.csv'), csv(huellas));

const resumen = {
  matrizSha256: crypto.createHash('sha256').update(fs.readFileSync(matrizRuta)).digest('hex'),
  requisitos: matriz.rows.length, criterios: pasosTotales,
  requisitosConAlgunPasoEnPruebasDelRepo: conRegresion, pasosEnPruebasDelRepo: pasosConRegresion,
  evidenciasCitadas: citadas.size, evidenciasNoEncontradas: faltan, bytesEvidenciaCitada: bytes,
  modulosSinCodigoAsignado: [...new Set(matriz.rows.filter((r) => !CODIGO[r.module]).map((r) => r.module))],
  modulosSinCapitulo: [...new Set(matriz.rows.filter((r) => !capitulos[r.module]).map((r) => r.module))],
  primerasNoEncontradas: faltantes.slice(0, 15),
};
fs.writeFileSync(path.join(salida, 'trazabilidad-resumen.json'), `${JSON.stringify(resumen, null, 2)}\n`);
console.log(JSON.stringify(resumen, null, 2));
