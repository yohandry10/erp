#!/usr/bin/env node
/**
 * La pantalla no puede cobrar una tasa y registrar otra.
 *
 * Había dos fuentes para el mismo número: la RPC de venta recalcula el impuesto
 * con `empresas.igv_porcentaje` --la tasa del tenant, que el asistente inicial
 * deja escribir y `PUT /configuration/empresa` deja cambiar-- y el navegador
 * usaba una constante fija por país. Con la empresa al 10 % se comprobó en el
 * POS: el botón decía «Cobrar S/ 118,00», el cajero cobraba 118, y la venta
 * quedaba grabada como «Subtotal 100,00 · IGV (18%) S/ 10,00 · TOTAL 110,00».
 * Ocho soles de diferencia por venta, la caja sin cuadrar y un ticket que se
 * contradice a sí mismo.
 *
 * Uso: node tests/impuestos/verify-tasa-impuesto.mjs
 */
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fallos = []
const tmp = join(web, '.tasa-impuesto-tmp')

mkdirSync(tmp, { recursive: true })
const js = ts.transpileModule(readFileSync(join(web, 'lib', 'tasa-impuesto.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const destino = join(tmp, 'tasa-impuesto.mjs')
writeFileSync(destino, js)
const { resolverTasaImpuesto, etiquetaImpuesto } = await import(pathToFileURL(destino).href)

const comprobar = (descripcion, real, esperado) => {
  if (real !== esperado) fallos.push(`${descripcion}: esperado ${esperado}, obtenido ${real}`)
}

// ---------------------------------------------------------------------------
// 1. La tasa del tenant manda sobre la constante del país
// ---------------------------------------------------------------------------
// Este es el caso que estaba roto: empresa al 10 %, país al 18 %.
comprobar('empresa al 10 % con país al 18 %', resolverTasaImpuesto(10, 0.18), 0.1)
comprobar('empresa al 18 % con país al 18 %', resolverTasaImpuesto(18, 0.18), 0.18)
comprobar('empresa al 21 % (AR)', resolverTasaImpuesto(21, 0.21), 0.21)
comprobar('empresa exonerada al 0 %', resolverTasaImpuesto(0, 0.18), 0)

// El 0 es un valor legítimo --Ley de Amazonía-- y no puede confundirse con
// «sin dato»: si se colara como falsy volvería a cobrarse el 18 %.
comprobar('el 0 no se confunde con ausente', resolverTasaImpuesto(0, 0.18), 0)
comprobar('el "0" en texto tampoco', resolverTasaImpuesto('0', 0.18), 0)

// ---------------------------------------------------------------------------
// 2. Sin dato o con un dato absurdo se cae a la constante del país
// ---------------------------------------------------------------------------
for (const [etiqueta, valor] of [
  ['ausente', undefined], ['nulo', null], ['texto', 'dieciocho'],
  ['negativo', -5], ['mayor que 100', 250], ['NaN', NaN],
]) {
  comprobar(`valor ${etiqueta} cae al país`, resolverTasaImpuesto(valor, 0.18), 0.18)
}

// ---------------------------------------------------------------------------
// 3. El rótulo sale de la misma tasa que el cálculo
// ---------------------------------------------------------------------------
// Un ticket que dice «IGV (18%)» junto a un importe del 10 % es lo que se vio
// en producción; el rótulo no puede venir de una constante distinta.
comprobar('rótulo al 10 %', etiquetaImpuesto('IGV (18%)', 0.1), 'IGV (10%)')
comprobar('rótulo al 18 %', etiquetaImpuesto('IGV (18%)', 0.18), 'IGV (18%)')
comprobar('rótulo al 0 %', etiquetaImpuesto('IGV (18%)', 0), 'IGV (0%)')
comprobar('rótulo IVA argentino', etiquetaImpuesto('IVA (21%)', 0.21), 'IVA (21%)')
comprobar('rótulo con decimales', etiquetaImpuesto('IGV (18%)', 0.185), 'IGV (18.5%)')

// ---------------------------------------------------------------------------
// 4. Que el hook use de verdad estas dos funciones
// ---------------------------------------------------------------------------
// Sin esto, el módulo puede estar perfecto y la pantalla seguir con la
// constante: lo que se rompió no fue el cálculo, fue de dónde salía el número.
const hook = readFileSync(join(web, 'hooks', 'use-country-context.ts'), 'utf8')
if (!hook.includes('resolverTasaImpuesto(empresaConfig.igvPorcentaje')) {
  fallos.push('use-country-context ya no resuelve la tasa desde el tenant')
}
if (!hook.includes('etiquetaImpuesto(countryData.impuesto, impuestoRate)')) {
  fallos.push('use-country-context ya no deriva el rótulo de la tasa efectiva')
}

// Y que el backend siga mandándola: si se cae del payload, el hook recibe
// undefined y vuelve silenciosamente a la constante del país.
const controlador = readFileSync(
  join(web, '..', 'erp-api', 'src', 'modules', 'configuracion', 'configuration-context.controller.ts'),
  'utf8',
)
if (!controlador.includes("'igv_porcentaje'") || !controlador.includes('igvPorcentaje:')) {
  fallos.push('/configuration/context/country ya no expone igv_porcentaje')
}

rmSync(tmp, { recursive: true, force: true })

if (fallos.length > 0) {
  console.error('FALLA la tasa de impuesto:')
  for (const f of fallos) console.error('  - ' + f)
  process.exit(1)
}
console.log('OK: la tasa que se exhibe es la del tenant, y el rótulo sale de esa misma tasa')
