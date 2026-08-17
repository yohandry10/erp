import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOTS = [
  "apps/web/tests",
  "apps/erp-api/src",
  "apps/erp-api/test",
  "apps/erp-api/tests",
  "libs",
];
const TEST_FILE = /\.(spec|test|e2e-spec|e2e)\.tsx?$/;

const rules = [
  {
    name: "test/describe/it.skip",
    pattern: /\b(?:test|describe|it)\.skip\b|\bskip\(/,
  },
  {
    name: "test/describe/it.only",
    pattern: /\b(?:test|describe|it)\.only\b/,
  },
  {
    name: "waitForTimeout",
    pattern: /waitForTimeout\s*\(/,
  },
  {
    name: "console.warn saltando/skipping",
    pattern: /console\.warn\([^)]*(?:saltando|skipping|skip)/i,
  },
  {
    name: "expect(true).toBe(true)",
    pattern: /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/,
  },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        [
          "node_modules",
          "dist",
          ".next",
          "coverage",
          "test-results",
          "playwright-report",
        ].includes(entry.name)
      ) {
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

function callRootName(expression) {
  let current = expression;
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = current.expression;
  }
  while (ts.isCallExpression(current)) {
    current = current.expression;
    while (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current)
    ) {
      current = current.expression;
    }
  }
  return ts.isIdentifier(current) ? current.text : "";
}

function findBareReturnsInTestBodies(file, text) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const returns = [];

  function visit(node) {
    if (ts.isReturnStatement(node) && !node.expression) {
      let owner = node.parent;
      while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
      const call = owner?.parent;
      if (
        owner &&
        ts.isCallExpression(call) &&
        call.arguments.includes(owner) &&
        ["test", "it"].includes(callRootName(call.expression))
      ) {
        const { line } = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );
        returns.push(line + 1);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return returns;
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  for (const rule of rules) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        findings.push({
          rule: rule.name,
          file: relative(process.cwd(), file).replaceAll("\\", "/"),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
  for (const line of findBareReturnsInTestBodies(file, text)) {
    findings.push({
      rule: "return temprano dentro del cuerpo de test/it",
      file: relative(process.cwd(), file).replaceAll("\\", "/"),
      line,
      text: lines[line - 1].trim(),
    });
  }
}

if (findings.length > 0) {
  console.error("Falsos positivos potenciales en tests:");
  for (const finding of findings) {
    console.error(
      `- [${finding.rule}] ${finding.file}:${finding.line} ${finding.text}`,
    );
  }
  process.exit(1);
}

console.log(
  `Audit test-quality OK: ${files.length} archivos de test revisados.`,
);
