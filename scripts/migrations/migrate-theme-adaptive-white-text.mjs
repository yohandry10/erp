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

const adaptivePagePattern = /from-background[\s\S]*via-muted\/50/;
const explicitContrastBackground = /(?:bg-(?:primary|destructive|black|blue|cyan|sky|indigo|violet|purple|emerald|green|amber|orange|red|rose)-|from-(?:blue|cyan|sky|indigo|violet|purple|emerald|green|amber|orange|red|rose)-)/;
const whiteTextPattern = /(?<![A-Za-z0-9_/-])text-white(?![A-Za-z0-9_/-])/g;

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

function migrateQuotedClasses(source) {
  return source.replace(/(["'`])([^"'`]*text-white[^"'`]*)\1/g, (match, quote, classes) => {
    if (explicitContrastBackground.test(classes)) return match;
    const migrated = classes.replace(whiteTextPattern, 'text-foreground');
    return `${quote}${migrated}${quote}`;
  });
}

const changed = [];
let replacements = 0;

for (const file of collectFiles(webRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  if (!adaptivePagePattern.test(original)) continue;

  const next = migrateQuotedClasses(original);
  if (next === original) continue;

  replacements += (original.match(whiteTextPattern) ?? []).length - (next.match(whiteTextPattern) ?? []).length;
  changed.push(path.relative(root, file).replaceAll('\\', '/'));
  if (write) fs.writeFileSync(file, next, 'utf8');
}

console.log(JSON.stringify({
  mode: write ? 'write' : 'dry-run',
  changedFiles: changed.length,
  replacements,
  files: changed,
}, null, 2));
