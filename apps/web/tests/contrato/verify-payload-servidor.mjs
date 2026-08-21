#!/usr/bin/env node
/**
 * El cliente no manda campos que el servidor deriva de la sesión.
 *
 * `tenant_id`, `created_by` y `actor_id` los pone el API desde el JWT. Enviarlos
 * desde el navegador no sirve para nada y hace daño de dos formas: si el DTO no
 * los declara, el ValidationPipe global —que corre con `forbidNonWhitelisted`—
 * rechaza la petición entera con un 400; y si los declarara, sería el cliente
 * quien elige de qué empresa es el registro.
 *
 * No es hipotético. `GreModal` mandaba `tenantId` en el cuerpo y
 * `CreateGuiaRemisionDto` no lo declara, así que **crear una guía de remisión
 * desde un pedido devolvía 400** y el usuario sólo veía «Error al crear la guía
 * de remisión». No lo detectó nadie porque el mensaje del pipe no llega a la
 * pantalla; se encontró leyendo el cliente contra el contrato del servidor.
 *
 * Uso: node tests/contrato/verify-payload-servidor.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const archivos = execFileSync('git', ['ls-files', 'app', 'components', 'hooks', 'lib', 'contexts'], {
  cwd: web,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.spec\.|\.test\./.test(f))

const DERIVADOS = /^\s*(tenant_id|tenantId|created_by|updated_by|actor_id|actorId)\s*:/
const ENVIA = /api\.(post|put|patch)\(|method:\s*['"](POST|PUT|PATCH)/i

function revisar(lineas) {
  const encontrados = []
  for (let i = 0; i < lineas.length; i += 1) {
    if (!DERIVADOS.test(lineas[i])) continue
    // Ventana amplia por los dos lados: el `api.post` puede estar por encima del
    // objeto o bastante por debajo. En `GreModal` el campo estaba 17 líneas por
    // encima de la llamada y una ventana de 15 no lo veía: el guardián daba verde
    // sobre el mismo fallo que venía a impedir.
    const ventana = lineas.slice(Math.max(0, i - 40), i + 60).join('\n')
    if (!ENVIA.test(ventana)) continue
    encontrados.push(i + 1)
  }
  return encontrados
}

const hallazgos = []
for (const rel of archivos) {
  const lineas = readFileSync(join(web, rel), 'utf8').split(/\r?\n/)
  for (const n of revisar(lineas)) hallazgos.push(`${rel}:${n}  ${lineas[n - 1].trim().slice(0, 70)}`)
}

// Control de la medición: sobre un caso construido, el detector tiene que ver el
// problema. Sin esto, «cero hallazgos» podría significar que no está mirando.
// Control de la medición, con la forma y la distancia del caso real: el campo
// dentro de un objeto largo y la llamada bastante más abajo. Un control más fácil
// que el caso real no prueba nada — el primero que escribí pasaba en verde con el
// fallo presente en el código.
const control = revisar([
  'const greData = {',
  '  destinatario: formData.destinatario,',
  '  tenantId: pedidoContext?.tenantId,',
  ...Array.from({ length: 25 }, () => '  relleno: 1,'),
  '}',
  'const result = await api.post(`/api/gre/guias`, greData)',
])

if (control.length !== 1) {
  console.error('El detector no reconoce un caso conocido: no está midiendo nada.')
  process.exit(1)
}

if (hallazgos.length > 0) {
  console.error('\nEl cliente envía campos que el servidor deriva de la sesión:\n')
  for (const h of hallazgos) console.error('  - ' + h)
  console.error('\nQuítelos del cuerpo: el API los toma del JWT, y si el DTO no los')
  console.error('declara el ValidationPipe rechaza la petición entera con un 400.\n')
  process.exit(1)
}

console.log('OK: ningún envío incluye tenant, actor ni autoría; el servidor los deriva.')
