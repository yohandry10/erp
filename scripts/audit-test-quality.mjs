import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['apps/web/tests', 'apps/erp-api/src', 'apps/erp-api/test', 'apps/erp-api/tests', 'libs'];
const TEST_FILE = /\.(spec|test|e2e-spec|e2e)\.tsx?$/;

const rules = [
  {
    name: 'test/describe/it.skip',
    pattern: /\b(?:test|describe|it)\.skip\b|\bskip\(/,
  },
  {
    name: 'test/describe/it.only',
    pattern: /\b(?:test|describe|it)\.only\b/,
  },
  {
    name: 'waitForTimeout',
    pattern: /waitForTimeout\s*\(/,
  },
  {
    name: 'console.warn saltando/skipping',
    pattern: /console\.warn\([^)]*(?:saltando|skipping|skip)/i,
  },
  {
    name: 'return temprano marcado como test informativo/saltado',
    pattern: /return\s*;\s*(?:(?:\/\/[^\n]*(?:test informativo|salt|skip|pasa|expected|esperado))|$)/i,
  },
  {
    name: 'expect(true).toBe(true)',
    pattern: /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/,
  },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.next', 'coverage', 'test-results', 'playwright-report'].includes(entry.name)) {
        continue;
      }
      files.push(...walk(path));
    } else if (entry.isFile() && TEST_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const files = ROOTS.flatMap((root) => {
  try {
    return statSync(root).isDirectory() ? walk(root) : [];
  } catch {
    return [];
  }
});

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const rule of rules) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        findings.push({
          rule: rule.name,
          file: relative(process.cwd(), file).replaceAll('\\', '/'),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
}

if (findings.length > 0) {
  console.error('Falsos positivos potenciales en tests:');
  for (const finding of findings) {
    console.error(`- [${finding.rule}] ${finding.file}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

console.log(`Audit test-quality OK: ${files.length} archivos de test revisados.`);
