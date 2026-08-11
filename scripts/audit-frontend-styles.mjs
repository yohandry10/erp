import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'apps', 'web');
const skipDirs = new Set(['node_modules', '.next', 'out', 'dist', 'coverage', '.turbo']);
const sourceExtensions = /\.(tsx|ts|jsx|js|css)$/;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (skipDirs.has(name) || name.startsWith('.next-')) continue;
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, out);
    } else if (sourceExtensions.test(name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function count(text, regex) {
  return (text.match(regex) || []).length;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

const globalsPath = path.join(webRoot, 'app', 'globals.css');
const postcssPath = path.join(webRoot, 'postcss.config.js');
const tailwindPath = path.join(webRoot, 'tailwind.config.js');
const globalsCss = read(globalsPath);
const postcss = read(postcssPath);
const tailwind = read(tailwindPath);

const critical = [];
if (!globalsCss.includes('@tailwind base')) critical.push('apps/web/app/globals.css no contiene @tailwind base');
if (!globalsCss.includes('@tailwind components')) critical.push('apps/web/app/globals.css no contiene @tailwind components');
if (!globalsCss.includes('@tailwind utilities')) critical.push('apps/web/app/globals.css no contiene @tailwind utilities');
if (!postcss.includes('tailwindcss')) critical.push('apps/web/postcss.config.js no registra tailwindcss');
for (const token of ['border', 'input', 'ring', 'background', 'foreground', 'primary', 'secondary', 'destructive', 'muted', 'accent']) {
  if (!tailwind.includes(`${token}:`) && !tailwind.includes(`${token}: {`)) {
    critical.push(`apps/web/tailwind.config.js no mapea el token semantico ${token}`);
  }
}

for (const removedCompatibilityFile of [
  path.join(webRoot, 'styles', 'dashboard-primitives.css'),
  path.join(webRoot, 'styles', 'theme-compat.css'),
]) {
  if (fs.existsSync(removedCompatibilityFile)) {
    critical.push(`${rel(removedCompatibilityFile)} no debe reaparecer despues de la migracion Tailwind/shadcn`);
  }
}

const legacyDashboardClassPattern = /dashboard-container|dashboard-header|dashboard-title|dashboard-subtitle|refresh-btn|btn-primary|btn-secondary|btn-outline|btn-icon(?:-danger)?|stats-grid|ventas-stats-grid|stat-card|stat-header|stat-icon|stat-value|stat-subtitle|activity-section|activity-header|activity-title|activity-meta|activity-card|activity-empty|status-success|status-warning|status-error|status-info|loading-spinner|ventas-layout|ventas-breadcrumbs|breadcrumbs-nav|breadcrumb-item|breadcrumb-link|breadcrumb-current|breadcrumb-separator|ventas-content|erp-light-scope/g;
const compatibilityNeutralPattern = /(?<![A-Za-z0-9_/-])(?:bg-white|bg-slate-(?:50|100)|bg-gray-50|text-slate-(?:950|900|800|700|600|500|400|300|200|100)|text-gray-(?:950|900|800|700|600|500|400)|border-(?:gray-200|slate-200|slate-300|green-200)|from-slate-(?:950|900)|via-(?:sky-950|slate-900)|to-(?:slate-950|blue-950))(?![A-Za-z0-9_/-])/g;
const nonstandardScalePattern = /(?<![A-Za-z0-9_.-])(?:text|rounded)-(?:1(?:\.5)?|2(?:\.5)?|3(?:\.5)?|4|5|6|7|8|10|12|16)(?![A-Za-z0-9_.-])/g;

const files = walk(webRoot);
const rows = files.map((file) => {
  const text = read(file);
  return {
    file: rel(file),
    inlineStyle: count(text, /style=\{\{/g),
    className: count(text, /className=/g),
    dynamicClassName: count(text, /className=\{`|className=\{[^}\n]*(\+|\.join\(|clsx\(|cn\()/g),
    arbitrary: count(text, /(?:text|bg|border|z|w|h|min-w|max-w|min-h|max-h|top|left|right|bottom|grid-cols|col-span)-\[/g),
    important: count(text, /!important/g),
    cssImports: count(text, /from ['"].*\.css['"]|import ['"].*\.css['"]/g),
    hardcodedColor: count(text, /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/g),
    globalUiClasses: count(text, /dashboard-container|dashboard-header|dashboard-title|stat-card|refresh-btn|modal-|btn\b|status-/g),
    legacyDashboardClasses: count(text, legacyDashboardClassPattern),
    compatibilityNeutralClasses: count(text, compatibilityNeutralPattern),
    nonstandardScaleClasses: count(text, nonstandardScalePattern),
  };
});

const totals = rows.reduce((acc, row) => {
  for (const [key, value] of Object.entries(row)) {
    if (key === 'file') continue;
    acc[key] = (acc[key] || 0) + value;
  }
  return acc;
}, { files: rows.length });

if (totals.legacyDashboardClasses > 0) {
  critical.push(`Quedan ${totals.legacyDashboardClasses} usos de clases dashboard legacy`);
}
if (totals.compatibilityNeutralClasses > 0) {
  critical.push(`Quedan ${totals.compatibilityNeutralClasses} neutros literales cubiertos por el antiguo puente de tema`);
}
if (totals.nonstandardScaleClasses > 0) {
  critical.push(`Quedan ${totals.nonstandardScaleClasses} utilidades numericas de texto/radio que Tailwind no compila`);
}

function top(key) {
  return rows
    .filter((row) => row[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, 10)
    .map((row) => ({ file: row.file, [key]: row[key] }));
}

const result = {
  gate: 'Gate 23 UI/CSS Design System Freeze',
  critical,
  totals,
  topInlineStyle: top('inlineStyle'),
  topDynamicClassName: top('dynamicClassName'),
  topArbitrary: top('arbitrary'),
  topImportant: top('important'),
  notes: [
    'Inline styles, arbitrary utilities and functional hardcoded colors are tracked as follow-up design-system debt.',
    'Compatibility CSS, legacy dashboard classes, neutral bridge classes, missing Tailwind compilation and missing semantic tokens are blockers.',
  ],
};

console.log(JSON.stringify(result, null, 2));

if (critical.length > 0) {
  process.exitCode = 1;
}
