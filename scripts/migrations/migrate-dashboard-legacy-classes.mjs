import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'apps', 'web');
const write = process.argv.includes('--write');
const ignoredDirectories = new Set([
  '.next',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
  'tests',
]);

const refreshReplacements = new Map([
  [
    'mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-foreground',
    'mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none',
  ],
]);

const replacements = [
  ['stat-card alert', 'relative min-h-36 overflow-hidden rounded-2xl border border-border border-l-4 border-l-amber-500 bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg'],
  ['stat-value conversion', 'mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-emerald-600 dark:text-emerald-400'],
  ['stat-value warning', 'mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-600 dark:text-amber-400'],
  ['stat-value alerts', 'mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-amber-600 dark:text-amber-400'],
  ['stat-icon stat-icon-blue', 'inline-flex size-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500'],
  ['stat-icon stat-icon-emerald', 'inline-flex size-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500'],
  ['stat-icon stat-icon-amber', 'inline-flex size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500'],
  ['btn btn-primary', 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50'],
  ['btn btn-secondary', 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'],
  ['btn btn-outline', 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold leading-5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'],
  ['dashboard-container', 'mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40'],
  ['dashboard-header', 'relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8'],
  ['dashboard-title', 'm-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground'],
  ['dashboard-subtitle', 'mt-2 text-base text-muted-foreground'],
  ['refresh-btn', 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50'],
  ['btn-primary', 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50'],
  ['btn-secondary', 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'],
  ['btn-outline', 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold leading-5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50'],
  ['btn-icon-danger', 'inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground'],
  ['btn-icon', 'inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-accent'],
  ['ventas-stats-grid', ''],
  ['stats-grid', 'mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5'],
  ['stat-card', 'relative min-h-36 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg'],
  ['stat-header', 'flex items-start justify-between gap-4'],
  ['stat-icon-blue', 'bg-blue-500/15 text-blue-500'],
  ['stat-icon-emerald', 'bg-emerald-500/15 text-emerald-500'],
  ['stat-icon-amber', 'bg-amber-500/15 text-amber-500'],
  ['stat-icon', 'inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary'],
  ['stat-value', 'mt-4 text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-none text-foreground'],
  ['stat-subtitle', 'mt-2 text-[0.8125rem] text-muted-foreground'],
  ['activity-section', 'relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl'],
  ['activity-header', 'mb-4 flex items-center justify-between gap-4'],
  ['activity-title', 'm-0 text-lg font-bold text-foreground'],
  ['activity-meta', 'text-[0.8125rem] text-muted-foreground'],
  ['activity-card', 'relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl'],
  ['activity-empty', 'px-4 py-10 text-center text-muted-foreground'],
  ['status-success', 'inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300'],
  ['status-warning', 'inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300'],
  ['status-error', 'inline-flex items-center rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-bold text-destructive'],
  ['status-info', 'inline-flex items-center rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300'],
  ['loading-spinner', 'inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary'],
  ['ventas-layout', 'min-h-full'],
  ['ventas-breadcrumbs', 'mb-4'],
  ['breadcrumbs-nav', 'flex items-center gap-2 text-sm text-muted-foreground'],
  ['breadcrumb-item', 'inline-flex items-center gap-2'],
  ['breadcrumb-link', 'text-primary underline-offset-4 hover:underline'],
  ['breadcrumb-current', 'font-semibold text-foreground'],
  ['breadcrumb-separator', 'text-muted-foreground'],
  ['ventas-content', 'w-full'],
  ['erp-light-scope', 'bg-gradient-to-br from-background via-muted/50 to-background text-foreground'],
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolute, files);
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

const changed = [];
const replacementCounts = new Map();

for (const file of collectFiles(webRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;

  for (const [previousClasses, refreshedClasses] of refreshReplacements) {
    next = next.replaceAll(previousClasses, refreshedClasses);
  }
  next = next.replace(
    /className="flex items-start justify-between gap-4"(?=>\s*<h3)/g,
    'className="flex items-start justify-between gap-4 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:tracking-[0.06em] [&_h3]:text-muted-foreground"',
  );
  next = next
    .replace(/className="loading(?=[ "\t])/g, 'className="flex min-h-48 items-center justify-center')
    .replace(/className='loading(?=[ '\t])/g, "className='flex min-h-48 items-center justify-center");

  for (const [legacyClass, tailwindClasses] of replacements) {
    const pattern = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(legacyClass)}(?![A-Za-z0-9_-])`, 'g');
    let count = 0;
    next = next.replace(pattern, () => {
      count += 1;
      return tailwindClasses;
    });
    if (count > 0) {
      replacementCounts.set(legacyClass, (replacementCounts.get(legacyClass) ?? 0) + count);
    }
  }

  if (next === original) continue;

  changed.push(path.relative(root, file).replaceAll('\\', '/'));
  if (write) fs.writeFileSync(file, next, 'utf8');
}

console.log(JSON.stringify({
  mode: write ? 'write' : 'dry-run',
  changedFiles: changed.length,
  replacements: Object.fromEntries(replacementCounts),
  files: changed,
}, null, 2));
