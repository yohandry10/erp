import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

async function staticPages(directory: string, root = directory): Promise<string[]> {
  const routes: string[] = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.includes('[')) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) routes.push(...await staticPages(absolute, root))
    else if (entry.name === 'page.tsx') {
      routes.push('/dashboard/' + path.relative(root, directory).split(path.sep).filter(Boolean).join('/') + '/')
    }
  }
  return routes.map(route => route.replace(/\/+/g, '/')).sort()
}

test('Perú: inspección de carga de todas las pantallas estáticas con API y base reales', async ({ page, context }) => {
  test.setTimeout(25 * 60 * 1000)
  page.setDefaultTimeout(20000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || process.env.E2E_ISOLATED_BROWSER === '1') {
    throw new Error('La inspección exige infraestructura local efímera real')
  }
  const output = path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'module-survey')
  await fs.mkdir(output, { recursive: true })
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost', '[::1]'].includes(host) ? route.continue() : route.abort('blockedbyclient')
  })
  await page.goto('/login/')
  await page.locator('#email').fill('peru-integrated-2@example.test')
  await page.locator('#password').fill('Local-Peru-2026-Only!')
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/auth/login') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click(),
    ])
    if (response.status() === 429 && attempt === 0) {
      const seconds = Number(await response.headerValue('retry-after') || 60)
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThanOrEqual(60)
      await new Promise(resolve => setTimeout(resolve, seconds * 1000))
      continue
    }
    expect(response.status()).toBe(201)
    break
  }
  await page.waitForURL('**/dashboard/**')

  const routes = await staticPages(path.resolve('app/dashboard'))
  const findings: Array<{ route: string; finalUrl: string; status: number | null; errors: string[]; text: string; expectedRestriction: boolean }> = []
  let currentErrors: string[] = []
  page.on('pageerror', error => currentErrors.push(error.message))
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.pathname.includes('/api/') && response.status() >= 400
      && !(response.status() === 403 && url.pathname.replace(/\/$/, '').endsWith('/demo/status'))) {
      currentErrors.push(`${response.status()} ${url.pathname}`)
    }
  })
  for (const route of routes) {
    currentErrors = []
    let status: number | null = null
    try {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 })
      status = response?.status() ?? null
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    } catch (error) {
      currentErrors.push(error instanceof Error ? error.message.split('\n')[0] : 'Error de navegación')
    }
    const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 6000)
    if (status && status >= 400) currentErrors.push(`HTTP ${status} al abrir pantalla`)
    if (new URL(page.url()).pathname.startsWith('/login')) currentErrors.push('La navegación perdió la sesión')
    if (!text.trim()) currentErrors.push('Pantalla vacía')
    // ADMIN_DEMO tiene prohibida la auditoría por contrato; su lectura real se
    // prueba por separado con AUDITOR_LOCAL en el recorrido integrado central.
    const expectedRestriction = route === '/dashboard/audit-logs/'
    const denied = /Acceso denegado|Acceso restringido|No tienes permisos para (acceder|ver)/i.test(text)
    if (denied && !expectedRestriction) {
      currentErrors.push('La pantalla muestra una denegación de acceso')
    }
    if (expectedRestriction && !denied) currentErrors.push('ADMIN_DEMO debe tener restringida la auditoría')
    const errors = [...new Set(currentErrors)]
    findings.push({ route, finalUrl: new URL(page.url()).pathname, status, errors, text, expectedRestriction })
    if (errors.length) await page.screenshot({ path: path.join(output, `${findings.length}-failure.png`), fullPage: true }).catch(() => {})
    await fs.writeFile(path.join(output, 'survey.json'), JSON.stringify({ remoteWrites: false,
      actor: 'ADMIN_DEMO de empresa 2, sin privilegio global',
      scope: 'Carga de pantallas estáticas; no acredita todas sus operaciones ni rutas con identificador. Auditoría restringida por contrato y cubierta con otro actor en el recorrido central', routes: findings }, null, 2))
    console.log(`[module-survey] ${route}: ${errors.length ? errors.join('; ') : expectedRestriction ? 'restricción de auditoría comprobada' : 'carga sin errores HTTP/JS'}`)
  }
  const failed = findings.filter(row => row.errors.length)
  expect(failed.map(row => ({ route: row.route, errors: row.errors })), 'Defectos de carga que requieren corrección').toEqual([])
})
