#!/usr/bin/env node
/**
 * Todo control de formulario debe tener una etiqueta programática.
 *
 * Un `placeholder` no la sustituye: desaparece justo cuando el usuario escribe,
 * y quien usa lector de pantalla o control por voz nunca llega a oírlo. Sin
 * etiqueta asociada tampoco funciona `getByLabel` en las pruebas, que es lo que
 * empuja a escribir selectores frágiles.
 *
 * Vale cualquiera de estas formas: `id` + `<label htmlFor>`, `aria-label`,
 * `aria-labelledby`, o que una `<label>` —o un componente que envuelva en una—
 * contenga al control.
 *
 * Detalles que cambian el resultado y costó acertar al medir:
 *
 * - Los atributos se recortan contando llaves. `onChange={(e) => ...}` lleva un
 *   `>` dentro, y cortar en el primero deja fuera los atributos siguientes:
 *   controles bien etiquetados aparecían como defectuosos.
 * - Es sensible a mayúsculas. `<Select>` de Radix no es un control sino el
 *   contenedor; el control real es `<SelectTrigger>`.
 * - `components/ui/*` son las primitivas que reenvían props. Quien las usa es
 *   quien pone el nombre, así que no se cuentan aquí.
 *
 * Si la etiqueta la aporta otro componente al envolver al control, cosa que no
 * se ve leyendo un solo archivo, marque el sitio con un comentario
 * `etiqueta-por-composicion` explicando quién lo envuelve.
 *
 * Uso: node tests/formularios/verify-etiquetas.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const archivos = execFileSync('git', ['ls-files', 'app', 'components'], {
  cwd: web,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f.endsWith('.tsx') && !f.startsWith('components/ui/'))

/** Componentes del propio archivo cuyo cuerpo etiqueta a sus hijos. */
function envoltoriosQueEtiquetan(s) {
  const nombres = new Set()
  const re = /(?:function|const)\s+([A-Z]\w*)\s*[=(]/g
  let m
  while ((m = re.exec(s))) {
    const cuerpo = s.slice(m.index, m.index + 900)
    // <label> minúscula etiqueta por sí sola; <Label> sólo si emite htmlFor.
    if ((/<label[\s>]/.test(cuerpo) || /htmlFor=/.test(cuerpo)) && /children/.test(cuerpo)) {
      nombres.add(m[1])
    }
  }
  return nombres
}

/** Atributos de la etiqueta de apertura, contando llaves. */
function atributos(s, pos) {
  let i = pos
  let llaves = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '{') llaves += 1
    else if (c === '}') llaves -= 1
    else if (c === '>' && llaves === 0) break
    i += 1
  }
  return s.slice(pos, i)
}

const CONTROL = /<(input|select|textarea|Input|Textarea|SelectTrigger)\b/g
const hallazgos = []
let total = 0

for (const rel of archivos) {
  const s = readFileSync(join(web, rel), 'utf8')
  const idsEtiquetados = new Set(
    [...s.matchAll(/htmlFor=\{?[`"']?([^`"'}\s]+)/g)].map((m) => m[1]),
  )
  const envoltorios = envoltoriosQueEtiquetan(s)
  const patronEnvoltorio = envoltorios.size
    ? new RegExp(`<(?:${[...envoltorios].join('|')})[\\s>]`, 'g')
    : null

  let m
  CONTROL.lastIndex = 0
  while ((m = CONTROL.exec(s))) {
    const attrs = atributos(s, m.index)
    const tipo = (attrs.match(/type=["'{]+([a-z]+)/i) || [, m[1]])[1].toLowerCase()
    if (tipo === 'hidden') continue
    total += 1

    const id = (attrs.match(/\bid=\{?[`"']?([^`"'}\s]+)/) || [])[1]
    if ((id && idsEtiquetados.has(id)) || /aria-label|aria-labelledby/.test(attrs)) continue

    const antes = s.slice(Math.max(0, m.index - 600), m.index)
    if (antes.lastIndexOf('<label') > antes.lastIndexOf('</label>')) continue

    // Escape explícito: el control queda dentro de una <label> que aporta otro
    // componente en tiempo de render, y eso no se ve leyendo un archivo. Exige
    // dejar escrito por qué, para que no se use como cajón de sastre.
    if (antes.includes('etiqueta-por-composicion')) continue

    if (patronEnvoltorio) {
      patronEnvoltorio.lastIndex = 0
      let env = -1
      let w
      while ((w = patronEnvoltorio.exec(antes))) env = w.index
      if (env > -1 && antes.slice(env).search(/<\/[A-Z]\w*>/) === -1) continue
    }

    hallazgos.push(`  ${rel}:${s.slice(0, m.index).split('\n').length} (${tipo})`)
  }
}

if (hallazgos.length > 0) {
  console.error('Controles de formulario sin etiqueta programática:\n')
  hallazgos.forEach((h) => console.error(h))
  console.error(
    `\n${hallazgos.length} de ${total}. Añada id + <label htmlFor>, o aria-label` +
      ' cuando el control se repita en una lista y un id fijo se duplicaría.',
  )
  process.exit(1)
}

console.log(`✓ Los ${total} controles de formulario tienen etiqueta programática.`)
