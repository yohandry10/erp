import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const docsDir = path.resolve(process.cwd(), "docs");
const expected = new Set([
  "ARCHITECTURE.md",
  "CURRENT_STATE.md",
  "MODULES.md",
  "OPERATIONS.md",
  "README.md",
  "RELEASE.md",
]);

const errors = [];
const entries = fs.readdirSync(docsDir, { withFileTypes: true });
const actual = new Set(
  entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
);

for (const entry of entries) {
  if (entry.isDirectory()) {
    errors.push(`No se permiten subdirectorios en docs/: ${entry.name}`);
  } else if (!expected.has(entry.name)) {
    errors.push(`Archivo no permitido en docs/: ${entry.name}`);
  }
}

for (const file of expected) {
  if (!actual.has(file)) {
    errors.push(`Falta documento canónico: ${file}`);
  }
}

if (actual.size !== expected.size) {
  errors.push(
    `docs/ debe contener exactamente ${expected.size} archivos; contiene ${actual.size}`,
  );
}

if (errors.length > 0) {
  console.error("Contrato documental incumplido:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Contrato documental OK: ${actual.size} archivos canónicos, sin subdirectorios.`,
);
