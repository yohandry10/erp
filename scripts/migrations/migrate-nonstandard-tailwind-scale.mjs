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

// A previous CSS-to-utility pass expressed rem values as spacing-scale numbers
// (for example text-3 = 0.75rem). Tailwind does not compile numeric font-size
// or border-radius utilities, so map them to real Tailwind utilities while
// preserving the intended dimensions.
const replacements = new Map([
  ['text-2.5', 'text-[0.625rem]'],
  ['text-3', 'text-xs'],
  ['text-3.5', 'text-sm'],
  ['text-4', 'text-base'],
  ['text-5', 'text-xl'],
  ['text-6', 'text-2xl'],
  ['text-7', 'text-[1.75rem]'],
  ['text-8', 'text-[2rem]'],
  ['text-10', 'text-[2.5rem]'],
  ['text-12', 'text-5xl'],
  ['text-16', 'text-[4rem]'],
  ['rounded-1', 'rounded'],
  ['rounded-1.5', 'rounded-md'],
  ['rounded-2', 'rounded-lg'],
  ['rounded-2.5', 'rounded-[0.625rem]'],
  ['rounded-3', 'rounded-xl'],
  ['rounded-3.5', 'rounded-[0.875rem]'],
  ['rounded-4', 'rounded-2xl'],
  ['rounded-5', 'rounded-[1.25rem]'],
  ['rounded-6', 'rounded-3xl'],
]);

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
const counts = new Map();

for (const file of collectFiles(webRoot)) {
  const original = fs.readFileSync(file, 'utf8');
  let next = original;

  for (const [invalidClass, validClass] of replacements) {
    const escaped = invalidClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![A-Za-z0-9_.-])${escaped}(?![A-Za-z0-9_.-])`, 'g');
    let count = 0;
    next = next.replace(pattern, () => {
      count += 1;
      return validClass;
    });
    if (count > 0) counts.set(invalidClass, (counts.get(invalidClass) ?? 0) + count);
  }

  if (next === original) continue;
  changed.push(path.relative(root, file).replaceAll('\\', '/'));
  if (write) fs.writeFileSync(file, next, 'utf8');
}

console.log(JSON.stringify({
  mode: write ? 'write' : 'dry-run',
  changedFiles: changed.length,
  replacements: Object.fromEntries(counts),
  files: changed,
}, null, 2));
