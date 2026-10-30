#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fuente = readFileSync(
  join(web, "lib", "contabilidad", "asiento-balance.ts"),
  "utf8",
);
const js = ts.transpileModule(fuente, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const modulo = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const { obtenerEstadoBalanceAsiento } = await import(modulo);

const casos = [
  { debe: 0, haber: 0, esperado: "PENDIENTE", escenario: "asiento vacío" },
  { debe: 100, haber: 0, esperado: "DESCUADRADO", escenario: "sólo debe" },
  { debe: 0, haber: 100, esperado: "DESCUADRADO", escenario: "sólo haber" },
  {
    debe: 100,
    haber: 99,
    esperado: "DESCUADRADO",
    escenario: "diferencia material",
  },
  {
    debe: 100,
    haber: 100,
    esperado: "BALANCEADO",
    escenario: "partida doble exacta",
  },
  {
    debe: 100,
    haber: 99.995,
    esperado: "BALANCEADO",
    escenario: "totales que redondean al mismo céntimo",
  },
  { debe: 7.85, haber: 7.84, esperado: "DESCUADRADO", escenario: "un céntimo pese a la resta binaria" },
  { debe: 7.84, haber: 7.85, esperado: "DESCUADRADO", escenario: "un céntimo en sentido contrario" },
  { debe: 100, haber: 99.994, esperado: "DESCUADRADO", escenario: "redondeo monetario distinto aunque la diferencia sea menor a un céntimo" },
  { debe: 0.1+0.2, haber: 0.3, esperado: "BALANCEADO", escenario: "suma binaria con el mismo total monetario" },
  {
    debe: Number.NaN,
    haber: 0,
    esperado: "DESCUADRADO",
    escenario: "importe no numérico",
  },
  {
    debe: -100,
    haber: -100,
    esperado: "DESCUADRADO",
    escenario: "importes negativos",
  },
];

const fallos = casos.flatMap(({ debe, haber, esperado, escenario }) => {
  const obtenido = obtenerEstadoBalanceAsiento(debe, haber);
  return obtenido === esperado
    ? []
    : [`${escenario}: obtuvo ${obtenido}; esperaba ${esperado}`];
});

if (fallos.length > 0) {
  console.error("Contrato de balance contable incorrecto:");
  for (const fallo of fallos) console.error(`  - ${fallo}`);
  process.exit(1);
}

console.log(
  "OK: el asiento vacío queda pendiente y sólo importes positivos cuadrados se consideran balanceados.",
);
