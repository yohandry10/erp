import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { visiblePeruActions } from './helpers/peru-visible-actions'

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
  const evidence = JSON.parse(await fs.readFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'http.json'), 'utf8'))
  const onboarding = evidence.results.find((row: { scenario: string }) => row.scenario.startsWith('alta no demo y primer administrador'))
  expect(onboarding?.client_email).toBeTruthy()
  await page.goto('/login/')
  await page.locator('#email').fill(onboarding.client_email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  let auth: any
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
    auth = await response.json()
    break
  }
  await page.waitForURL('**/dashboard/**')
  const auditAccess = await page.request.get(`${process.env.LOCAL_API_URL}/api/audit-logs?limit=1`, {
    headers: { Authorization: `Bearer ${auth.access_token ?? auth.data?.access_token}` },
  })
  expect([200, 403]).toContain(auditAccess.status())
  const auditAllowed = auditAccess.status() === 200

  const routes = (await staticPages(path.resolve('app/dashboard'))).filter(route => !route.startsWith('/dashboard/analytics/'))
  const findings: Array<{ route: string; finalUrl: string; status: number | null; errors: string[]; text: string; expectedRestriction: boolean; recovery?: { reason: string; evidence: string }; controls: Awaited<ReturnType<typeof visiblePeruActions>> }> = []
  let currentErrors: string[] = []
  const scriptDiagnostics: Array<Record<string, unknown>> = []
  const captureTasks: Array<Promise<void>> = []
  const session = await context.newCDPSession(page)
  const scripts = new Map<string, string>()
  session.on('Debugger.scriptParsed', event => scripts.set(event.scriptId, event.url))
  session.on('Runtime.exceptionThrown', event => {
    const detail = event.exceptionDetails
    const scriptId = detail.scriptId || detail.stackTrace?.callFrames[0]?.scriptId
    const record: Record<string, unknown> = {
      page: new URL(page.url()).pathname, text: detail.text,
      description: detail.exception?.description, url: detail.url || (scriptId && scripts.get(scriptId)),
      line: detail.lineNumber, column: detail.columnNumber, stack: detail.stackTrace,
    }
    scriptDiagnostics.push(record)
    const sourceUrl = String(record.url || '')
    if (scriptId && sourceUrl.includes('/_next/') && ['127.0.0.1', 'localhost'].includes(new URL(sourceUrl).hostname)) {
      captureTasks.push((async () => {
        try {
          await session.send('Debugger.enable')
          const result = await session.send('Debugger.getScriptSource', { scriptId })
          const filename = `failed-script-${scriptDiagnostics.length}.js`
          record.source_sha256 = createHash('sha256').update(result.scriptSource).digest('hex')
          record.private_source_file = filename
          await fs.writeFile(path.join(output, filename), result.scriptSource)
        } catch (error) { record.capture_error = error instanceof Error ? error.message : String(error) }
      })())
    }
  })
  await session.send('Runtime.enable')
  page.on('pageerror', error => {
    currentErrors.push(error.message)
    scriptDiagnostics.push({ page: new URL(page.url()).pathname, name: error.name, message: error.message, stack: error.stack })
  })
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
    let recovery: { reason: string; evidence: string } | undefined
    const webLog = path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'web.log')
    const logBefore = (await fs.readFile(webLog, 'utf8')).length
    try {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 })
      status = response?.status() ?? null
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    } catch (error) {
      const reason = error instanceof Error ? error.message.split('\n')[0] : 'Error de navegación'
      const recentServerLog = (await fs.readFile(webLog, 'utf8')).slice(Math.max(0, logBefore - 1000))
      const restart = 'Server is approaching the used memory threshold, restarting...'
      if (reason.includes('net::ERR_CONNECTION_RESET') && recentServerLog.includes(restart)) {
        // Una sola recuperación de GET, exclusivamente ante el reinicio de Next
        // dev confirmado por el servidor. No reintenta errores HTTP/JS de producto.
        recovery = { reason, evidence: restart }
        await expect.poll(async () => {
          try { return (await page.request.get('/login/', { timeout: 2000 })).status() === 200 }
          catch { return false }
        }, { timeout: 30000, intervals: [250, 500, 1000] }).toBe(true)
        status = (await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 }))?.status() ?? null
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      } else currentErrors.push(reason)
    }
    const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 6000)
    if (status && status >= 400) currentErrors.push(`HTTP ${status} al abrir pantalla`)
    if (new URL(page.url()).pathname.startsWith('/login')) currentErrors.push('La navegación perdió la sesión')
    if (!text.trim()) currentErrors.push('Pantalla vacía')
    // Se contrasta la restricción de auditoría con los permisos reales. La
    // lectura con AUDITOR_LOCAL se comprueba en el recorrido integrado central.
    const expectedRestriction = route === '/dashboard/audit-logs/' && !auditAllowed
    const denied = /Acceso denegado|Acceso restringido|No tienes permisos para (acceder|ver)/i.test(text)
    if (denied && !expectedRestriction) {
      currentErrors.push('La pantalla muestra una denegación de acceso')
    }
    if (expectedRestriction && !denied) currentErrors.push('La auditoría debe estar restringida sin el permiso de lectura')
    const errors = [...new Set(currentErrors)]
    const controls = await visiblePeruActions(page)
    findings.push({ route, finalUrl: new URL(page.url()).pathname, status, errors, text, expectedRestriction, recovery, controls })
    if (errors.length) await page.screenshot({ path: path.join(output, `${findings.length}-failure.png`), fullPage: true }).catch(() => {})
    await fs.writeFile(path.join(output, 'survey.json'), JSON.stringify({ remoteWrites: false,
      actor: 'Primer ADMIN Perú no demo, sin privilegio global', excluded: ['Analytics'],
      scope: 'Carga y controles visibles de pantallas estáticas; no acredita ejecución de acciones ni rutas con identificador. Restricción de auditoría contrastada con permisos reales', routes: findings }, null, 2))
    console.log(`[module-survey] ${route}: ${errors.length ? errors.join('; ') : expectedRestriction ? 'restricción de auditoría comprobada' : 'carga sin errores HTTP/JS'}`)
  }
  await Promise.all(captureTasks)
  await fs.writeFile(path.join(output, 'script-diagnostics.json'), JSON.stringify({ scope: 'Traza privada de errores; no modifica el resultado ni reintenta fallos JS', entries: scriptDiagnostics }, null, 2))
  const failed = findings.filter(row => row.errors.length)
  expect(failed.map(row => ({ route: row.route, errors: row.errors })), 'Defectos de carga que requieren corrección').toEqual([])
})
