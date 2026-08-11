import { expect, test } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'

const user = {
  id: 'inventory-master-460-user',
  email: 'inventory-master-460@erp.local',
  nombre: 'Inventory',
  apellido: 'Master',
  roles: ['ADMIN'],
  tenant_id: 'inventory-master-460-tenant',
  is_super_admin: true,
}

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  for (const envPath of [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../erp-api/.env'),
  ]) {
    if (!fs.existsSync(envPath)) continue
    let contents = ''
    try {
      contents = fs.readFileSync(envPath, 'utf8')
    } catch {
      continue
    }
    const line = contents.split(/\r?\n/).find((entry) => /^\s*JWT_SECRET=/.test(entry))
    if (line) return line.replace(/^\s*JWT_SECRET=/, '').trim().replace(/^['"]|['"]$/g, '')
  }
  throw new Error('JWT_SECRET no está disponible para el E2E aislado 460')
}

test('CRUD visual de almacén y ubicación usa el contrato canónico', async ({ context, page }, testInfo) => {
  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(jwtSecret()))
  await context.addCookies([{
    name: 'access_token', value: token,
    url: process.env.BASE_URL || 'http://localhost:3001',
    httpOnly: true, sameSite: 'Lax',
  }])

  const warehouses: any[] = []
  const locations: Record<string, any[]> = {}
  const mutations: Array<{ method: string; path: string; body: any }> = []

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({ data: { pais_id: 1, pais: 'PE', monedaDefecto: 'PEN', tipo_empresa: 'MICRO' } })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: false, is_expired: false })
    }
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) return json({ data: [] })

    const locationMatch = pathname.match(/\/api\/inventario\/almacenes\/([^/]+)\/ubicaciones(?:\/([^/]+))?\/?$/)
    if (locationMatch) {
      const [, warehouseId] = locationMatch
      if (method === 'GET') return json({ success: true, data: locations[warehouseId] ?? [] })
      const body = request.postDataJSON()
      mutations.push({ method, path: pathname, body })
      if (method === 'POST') {
        const location = {
          id: 'location-460-1', almacen_id: warehouseId, activo: true, estado: 'ACTIVO', ...body,
        }
        locations[warehouseId] = [...(locations[warehouseId] ?? []), location]
        return json({ success: true, data: location })
      }
    }

    if (/\/api\/inventario\/almacenes\/?$/.test(pathname)) {
      if (method === 'GET') return json({ success: true, data: warehouses })
      const body = request.postDataJSON()
      mutations.push({ method, path: pathname, body })
      if (method === 'POST') {
        const warehouse = { id: 'warehouse-460-1', activo: true, estado: 'ACTIVO', ...body }
        warehouses.push(warehouse)
        return json({ success: true, data: warehouse })
      }
    }
    return json({ success: true, data: [] })
  })

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']))
    window.localStorage.setItem('selectedCountry', '1')
  }, user)

  await page.goto('/dashboard/inventario/almacenes/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Almacenes y ubicaciones' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Supabase Studio/i)).toHaveCount(0)

  await page.getByRole('button', { name: 'Nuevo almacén' }).click()
  await page.getByLabel('Código de almacén').fill('WH-460')
  await page.getByLabel('Nombre de almacén').fill('Almacén QA 460')
  await page.getByText('Almacén principal').click()
  await page.getByRole('button', { name: /^Guardar$/ }).click()
  await expect(page.getByText('Almacén QA 460')).toBeVisible()

  const createWarehouse = mutations.find((mutation) => mutation.method === 'POST' && /\/almacenes\/?$/.test(mutation.path))
  expect(createWarehouse?.body).toMatchObject({
    codigo: 'WH-460', nombre: 'Almacén QA 460', es_principal: true,
  })
  expect(createWarehouse?.body.idempotency_key).toMatch(/^inventory-warehouse-create:/)

  await page.getByRole('button', { name: 'Ver ubicaciones' }).click()
  await page.getByRole('button', { name: 'Nueva ubicación' }).click()
  await page.getByLabel('Código de ubicación').fill('R-01')
  await page.getByLabel('Nombre de ubicación').fill('Rack QA 460')
  await page.getByRole('button', { name: 'Guardar ubicación' }).click()
  await expect(page.getByText('Rack QA 460')).toBeVisible()

  const createLocation = mutations.find((mutation) => mutation.method === 'POST' && /\/ubicaciones\/?$/.test(mutation.path))
  expect(createLocation?.body).toMatchObject({ codigo: 'R-01', nombre: 'Rack QA 460', tipo: 'OTRO' })
  expect(createLocation?.body.idempotency_key).toMatch(/^inventory-location-create:/)

  await page.screenshot({ path: testInfo.outputPath('inventario-maestros-460-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('inventario-maestros-460-mobile.png'), fullPage: true })
})
