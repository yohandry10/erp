import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'apps', 'web');
const write = process.argv.includes('--write');
const scopeIndex = process.argv.indexOf('--scope');
const requestedScope = scopeIndex >= 0 ? process.argv[scopeIndex + 1]?.replaceAll('\\', '/') : null;
const ignoredDirectories = new Set([
  '.next',
  'dist',
  'node_modules',
  'out',
  'playwright-report',
  'test-results',
  'tests',
]);

const adaptiveAccentNormalizations = [
  ['text-blue-700 dark:text-blue-700 dark:text-blue-200', 'text-blue-700 dark:text-blue-200'],
  ['text-sky-700 dark:text-sky-700 dark:text-sky-200', 'text-sky-700 dark:text-sky-200'],
  ['text-emerald-700 dark:text-emerald-700 dark:text-emerald-200', 'text-emerald-700 dark:text-emerald-200'],
  ['text-amber-700 dark:text-amber-700 dark:text-amber-200', 'text-amber-700 dark:text-amber-200'],
  ['text-red-700 dark:text-red-700 dark:text-red-200', 'text-red-700 dark:text-red-200'],
  ['text-rose-700 dark:text-rose-700 dark:text-rose-200', 'text-rose-700 dark:text-rose-200'],
];

const replacements = new Map([
  ['bg-[rgba(255,_255,_255,_0.5)]', 'bg-card/50'],
  ['bg-[rgba(255,_255,_255,_0.65)]', 'bg-card/65'],
  ['bg-[rgba(255,_255,_255,_0.8)]', 'bg-card/80'],
  ['bg-[rgba(255,_255,_255,_0.9)]', 'bg-card/90'],
  ['bg-[rgba(255,255,255,0.05)]', 'bg-card/5'],
  ['bg-[rgba(248,_250,_252,_0.85)]', 'bg-muted/40'],
  ['bg-[rgba(248,_250,_252,_0.9)]', 'bg-muted/40'],
  ['bg-[rgba(191,_219,_254,_0.35)]', 'bg-blue-500/10'],
  ['bg-[rgba(191,_219,_254,_0.45)]', 'bg-blue-500/10'],
  ['bg-[rgba(187,_247,_208,_0.45)]', 'bg-emerald-500/10'],
  ['bg-[rgba(254,_226,_226,_0.55)]', 'bg-destructive/10'],
  ['bg-[rgba(254,_226,_226,_0.6)]', 'bg-destructive/10'],
  ['bg-[rgba(254,_226,_226,_0.65)]', 'bg-destructive/10'],
  ['bg-[rgba(239,_68,_68,_0.05)]', 'bg-destructive/5'],
  ['bg-[rgba(239,_68,_68,_0.08)]', 'bg-destructive/10'],
  ['bg-[rgba(239,_68,_68,_0.1)]', 'bg-destructive/10'],
  ['bg-[rgba(239,_68,_68,_0.2)]', 'bg-destructive/20'],
  ['bg-white', 'bg-card'],
  ['bg-slate-50', 'bg-muted/30'],
  ['bg-gray-50', 'bg-muted/30'],
  ['bg-slate-100', 'bg-muted'],
  ['bg-gray-100', 'bg-muted'],
  ['bg-slate-200', 'bg-muted'],
  ['bg-gray-200', 'bg-muted'],
  ['bg-slate-950', 'bg-background'],
  ['bg-slate-900', 'bg-card'],
  ['bg-slate-800', 'bg-muted'],
  ['bg-slate-700', 'bg-muted'],
  ['text-slate-50', 'text-foreground'],
  ['text-gray-50', 'text-foreground'],
  ['text-cyan-50', 'text-primary'],
  ['text-cyan-100', 'text-primary'],
  ['text-cyan-200', 'text-primary'],
  ['text-cyan-200/60', 'text-primary/70'],
  ['text-cyan-200/70', 'text-primary/80'],
  ['text-cyan-300', 'text-primary'],
  ['text-blue-50', 'text-blue-700 dark:text-blue-200'],
  ['text-blue-100', 'text-blue-700 dark:text-blue-200'],
  ['text-blue-200', 'text-blue-700 dark:text-blue-200'],
  ['text-sky-100', 'text-sky-700 dark:text-sky-200'],
  ['text-emerald-100', 'text-emerald-700 dark:text-emerald-200'],
  ['text-amber-50', 'text-amber-700 dark:text-amber-200'],
  ['text-amber-100', 'text-amber-700 dark:text-amber-200'],
  ['text-amber-200', 'text-amber-700 dark:text-amber-200'],
  ['text-red-50', 'text-red-700 dark:text-red-200'],
  ['text-rose-50', 'text-rose-700 dark:text-rose-200'],
  ['text-rose-100', 'text-rose-700 dark:text-rose-200'],
  ['text-slate-100', 'text-foreground'],
  ['text-slate-100/80', 'text-foreground/80'],
  ['text-slate-200', 'text-foreground/90'],
  ['text-slate-300', 'text-muted-foreground'],
  ['text-gray-300', 'text-muted-foreground'],
  ['text-slate-400', 'text-muted-foreground'],
  ['text-gray-400', 'text-muted-foreground'],
  ['text-slate-500', 'text-muted-foreground'],
  ['text-gray-500', 'text-muted-foreground'],
  ['text-slate-600', 'text-foreground/80'],
  ['text-gray-600', 'text-foreground/80'],
  ['text-slate-700', 'text-foreground/85'],
  ['text-gray-700', 'text-foreground/85'],
  ['text-slate-800', 'text-foreground'],
  ['text-gray-800', 'text-foreground'],
  ['text-slate-900', 'text-foreground'],
  ['text-gray-900', 'text-foreground'],
  ['text-slate-950', 'text-foreground'],
  ['text-gray-950', 'text-foreground'],
  ['border-slate-50', 'border-border'],
  ['border-gray-50', 'border-border'],
  ['border-slate-100', 'border-border'],
  ['border-gray-100', 'border-border'],
  ['border-slate-200', 'border-border'],
  ['border-gray-200', 'border-border'],
  ['border-slate-300', 'border-border'],
  ['border-gray-300', 'border-border'],
  ['border-slate-400', 'border-border'],
  ['border-gray-400', 'border-border'],
  ['border-slate-700', 'border-border'],
  ['border-slate-800', 'border-border'],
  ['border-slate-950', 'border-border'],
  ['border-green-200', 'border-emerald-500/30'],
  ['from-slate-950', 'from-background'],
  ['from-slate-900', 'from-background'],
  ['via-sky-950', 'via-muted/50'],
  ['via-slate-900', 'via-muted/50'],
  ['to-slate-950', 'to-background'],
  ['to-blue-950', 'to-background'],
]);

for (const shade of ['30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95']) {
  replacements.set(`bg-slate-950/${shade}`, `bg-card/${shade}`);
  replacements.set(`bg-slate-900/${shade}`, `bg-card/${shade}`);
  replacements.set(`bg-slate-800/${shade}`, `bg-muted/${shade}`);
  replacements.set(`bg-slate-700/${shade}`, `bg-muted/${shade}`);
}

for (const shade of ['15', '20', '25', '30', '40', '70', '80']) {
  replacements.set(`border-slate-200/${shade}`, `border-border/${shade}`);
  replacements.set(`border-slate-300/${shade}`, `border-border/${shade}`);
  replacements.set(`border-slate-400/${shade}`, `border-border/${shade}`);
  replacements.set(`border-slate-700/${shade}`, `border-border/${shade}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolute, files);
    } else if (/\.(tsx|jsx|ts|js)$/.test(entry.name)) {
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      if (!requestedScope || relative.includes(requestedScope)) files.push(absolute);
    }
  }
  return files;
}

const changed = [];
const replacementCounts = new Map();

for (const file of collectFiles(webRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;

  for (const [duplicatedClasses, normalizedClasses] of adaptiveAccentNormalizations) {
    next = next.replaceAll(duplicatedClasses, normalizedClasses);
  }

  for (const [literalClass, semanticClass] of replacements) {
    const pattern = new RegExp(`(?<![A-Za-z0-9_/:-])${escapeRegExp(literalClass)}(?![A-Za-z0-9_/-])`, 'g');
    let count = 0;
    next = next.replace(pattern, () => {
      count += 1;
      return semanticClass;
    });
    if (count > 0) {
      replacementCounts.set(literalClass, (replacementCounts.get(literalClass) ?? 0) + count);
    }
  }

  if (next === original) continue;
  changed.push(path.relative(root, file).replaceAll('\\', '/'));
  if (write) fs.writeFileSync(file, next, 'utf8');
}

console.log(JSON.stringify({
  mode: write ? 'write' : 'dry-run',
  scope: requestedScope ?? 'apps/web',
  changedFiles: changed.length,
  replacements: Object.fromEntries(replacementCounts),
  files: changed,
}, null, 2));
