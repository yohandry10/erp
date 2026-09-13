import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

const catalogs = [
  ['ventas/rma', ['ventas/rma/[id]']],
  ['ventas/pedidos', ['ventas/pedidos/[id]']],
  ['ventas/cotizaciones', ['ventas/cotizaciones/[id]']],
  ['ventas/clientes', ['ventas/clientes/[id]', 'ventas/clientes/[id]/editar']],
  ['compras/recepciones', ['compras/recepciones/[id]']],
  ['compras/proveedores', ['compras/proveedores/[id]', 'compras/proveedores/[id]/editar']],
  ['compras/cotizaciones', ['compras/cotizaciones/[id]']],
  ['compras/ordenes', ['compras/ordenes/[id]']],
  ['compras/devoluciones', ['compras/devoluciones/[id]']],
  ['finanzas/cxp', ['finanzas/cxp/[id]']],
  ['finanzas/bancos/cuentas', ['finanzas/bancos/[id]', 'finanzas/bancos/[id]/editar']],
  ['finanzas/conciliacion', ['finanzas/conciliacion/[id]']],
  ['contabilidad/periodos', ['contabilidad/periodos/[id]']],
  ['contabilidad/presupuestos', ['contabilidad/presupuestos/[id]']],
  ['contabilidad/centros-costo', ['contabilidad/centros-costo/[id]', 'contabilidad/centros-costo/[id]/editar']],
  ['contabilidad/asientos', ['contabilidad/asientos/[id]', 'contabilidad/asientos/[id]/editar']],
  ['inventario/productos', ['inventario/productos/[id]/editar']],
] as const

async function recordPages(directory: string, root = directory): Promise<string[]> {
  const found: string[] = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await recordPages(absolute, root))
    else if (entry.name === 'page.tsx' && directory.includes('[id]')) found.push(path.relative(root, directory).split(path.sep).join('/'))
  }
  return found.sort()
}

function rows(value: any): any[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['data', 'items', 'results', 'rows']) {
    if (value[key] !== undefined) return rows(value[key])
  }
  return []
}

test('Perú: carga las pantallas con identificador usando registros de la empresa', async ({ page, context }) => {
  test.setTimeout(15 * 60 * 1000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere infraestructura local efímera')
  const api = process.env.LOCAL_API_URL!
  expect(['localhost', '127.0.0.1']).toContain(new URL(api).hostname)
  const output = path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, 'record-survey')
  await fs.mkdir(output, { recursive: true })
  expect(catalogs.flatMap(([, routes]) => [...routes]).sort()).toEqual(await recordPages(path.resolve('app/dashboard')))
  await context.route('**/*', route => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  const pending = new Map<string, readonly string[]>(catalogs)
  const findings: any[] = []
  let errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname.replace(/\/$/, '')
    if (pathname.includes('/api/') && response.status() >= 400
      && !(response.status() === 403 && pathname.endsWith('/demo/status'))
      && !pathname.endsWith('/auth/login')) errors.push(`${response.status()} ${pathname}`)
  })
  for (const tenant of [1, 2]) {
    await page.goto('/login/')
    await page.locator('#email').fill(`peru-integrated-${tenant}@example.test`)
    await page.locator('#password').fill('Local-Peru-2026-Only!')
    let token: string | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const [login] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname.replace(/\/$/, '').endsWith('/auth/login') && r.request().method() === 'POST'),
        page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click(),
      ])
      if (login.status() === 429 && attempt === 0) {
        const seconds = Number(await login.headerValue('retry-after') || 60)
        expect(seconds).toBeGreaterThan(0); expect(seconds).toBeLessThanOrEqual(60)
        await new Promise(resolve => setTimeout(resolve, seconds * 1000))
        continue
      }
      expect(login.status()).toBe(201)
      const auth = await login.json()
      token = auth.access_token ?? auth.data?.access_token
      break
    }
    expect(token).toBeTruthy()
    await page.waitForURL('**/dashboard/**')
    for (const [endpoint, templates] of pending) {
      const response = await page.request.get(`${api}/api/${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
      expect(response.ok(), `${endpoint}: ${response.status()}`).toBeTruthy()
      const records = rows(await response.json()).filter(row => typeof row?.id === 'string')
      if (!records.length) continue
      for (const template of templates) {
        const record = template === 'contabilidad/asientos/[id]/editar'
          ? records.find(row => String(row.estado).toUpperCase() === 'BORRADOR') ?? records[0] : records[0]
        const route = '/dashboard/' + template.replace('[id]', record.id) + '/'
        errors = []
        let status: number | null = null
        try {
          status = (await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 }))?.status() ?? null
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        } catch (error) { errors.push(String(error).split('\n')[0]) }
        const text = (await page.locator('body').innerText()).slice(0, 6000)
        if (status && status >= 400) errors.push(`HTTP ${status} en página`)
        if (!text.trim()) errors.push('Pantalla vacía')
        if (new URL(page.url()).pathname.startsWith('/login')) errors.push('Sesión perdida')
        if (/Acceso denegado|Acceso restringido/i.test(text)) errors.push('Acceso denegado al usuario operativo')
        const finding = { template, route, tenant, status, errors: [...new Set(errors)], text }
        findings.push(finding)
        await page.screenshot({ path: path.join(output, `${findings.length}-${finding.errors.length ? 'failure' : 'page'}.png`), fullPage: true })
        console.log(`[record-survey] ${template}: ${finding.errors.join('; ') || 'carga sin errores HTTP/JS'}`)
        await fs.writeFile(path.join(output, 'survey.json'), JSON.stringify({ remoteWrites: false, scope: 'Carga de rutas con registros; no acredita todas las mutaciones', findings }, null, 2))
      }
      pending.delete(endpoint)
    }
    await context.clearCookies()
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  }
  const missing = [...pending.values()].flat()
  await fs.writeFile(path.join(output, 'survey.json'), JSON.stringify({ remoteWrites: false, scope: 'Carga de rutas con registros; no acredita todas las mutaciones', missingFixtures: missing, findings }, null, 2))
  expect({ missingFixtures: missing, failures: findings.filter(row => row.errors.length).map(({ template, errors }) => ({ template, errors })) }).toEqual({ missingFixtures: [], failures: [] })
})
