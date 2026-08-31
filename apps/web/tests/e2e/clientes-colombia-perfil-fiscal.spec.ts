import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'

const clienteId = '52600000-0000-4000-8000-000000000051'
const user = {
  id: '52600000-0000-4000-8000-000000000052',
  email: 'clientes-colombia-526@erp.local',
  nombre: 'Ventas',
  apellido: 'Colombia',
  roles: ['ADMIN'],
  tenant_id: '52600000-0000-4000-8000-000000000053',
  is_super_admin: false,
}

type ClienteWrite = {
  method: string
  payload: Record<string, unknown>
}

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  for (const envPath of [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../erp-api/.env'),
  ]) {
    if (!fs.existsSync(envPath)) continue
    const line = fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((entry) => /^\s*JWT_SECRET=/.test(entry))
    if (line) {
      return line
        .replace(/^\s*JWT_SECRET=/, '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
  }
  throw new Error('JWT_SECRET no está disponible para el E2E aislado de clientes Colombia')
}

async function prepareColombiaSession(
  context: BrowserContext,
  page: Page,
  writes: ClienteWrite[],
) {
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
    name: 'access_token',
    value: token,
    url: process.env.BASE_URL || 'http://localhost:3001',
    httpOnly: true,
    sameSite: 'Lax',
  }])

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const method = request.method()
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({
        data: {
          pais_id: 2,
          pais: 'CO',
          paisCodigo: 'CO',
          monedaDefecto: 'COP',
          locale: 'es-CO',
        },
      })
    }
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({ data: [] })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: false, is_expired: false })
    }
    if (/\/api\/ventas\/clientes\/52600000-0000-4000-8000-000000000051\/?$/.test(pathname)) {
      if (method === 'GET') {
        return json({
          id: clienteId,
          tenant_id: user.tenant_id,
          tipo: 'EMPRESA',
          documento_tipo: 'NIT',
          documento_numero: '8909039388',
          razon_social: 'Cliente B2B Colombia S.A.S.',
          dian_perfil_fiscal: 'ADQUIRIENTE_NIT_B2B',
          created_at: '2026-08-29T12:00:00-05:00',
          updated_at: '2026-08-29T12:00:00-05:00',
        })
      }
      if (method === 'PUT') {
        const payload = request.postDataJSON() as Record<string, unknown>
        writes.push({ method, payload })
        return json({ id: clienteId, tenant_id: user.tenant_id, ...payload })
      }
    }
    if (/\/api\/ventas\/clientes\/?$/.test(pathname)) {
      if (method === 'POST') {
        const payload = request.postDataJSON() as Record<string, unknown>
        writes.push({ method, payload })
        return json({ id: clienteId, tenant_id: user.tenant_id, ...payload })
      }
      return json({ data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })
    }
    return json({ success: true, data: [] })
  })

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']))
    window.localStorage.setItem('selectedCountry', '2')
  }, user)
}

test.describe('perfil fiscal DIAN en el maestro de clientes', () => {
  test('el alta exige elección explícita, valida el DV y persiste el perfil B2B', async ({
    context,
    page,
  }) => {
    const writes: ClienteWrite[] = []
    await prepareColombiaSession(context, page, writes)

    await page.goto('/dashboard/ventas/clientes/nuevo/', { waitUntil: 'domcontentloaded' })

    const perfil = page.getByLabel('Perfil tributario DIAN del receptor *')
    await expect(perfil).toBeVisible({ timeout: 30_000 })
    await expect(perfil).toHaveValue('')

    await page.getByLabel('Número de Documento *').fill('1020304050')
    await page.getByLabel('Razón Social / Nombre Completo *').fill('Cliente Colombia QA')
    await page.getByRole('button', { name: 'Crear Cliente', exact: true }).click()

    await expect(page.getByText('Seleccione el perfil tributario DIAN del receptor')).toBeVisible()
    expect(writes).toHaveLength(0)

    await page.getByLabel('Tipo de Cliente *').selectOption('EMPRESA')
    await page.getByLabel('Tipo de Documento *').selectOption('NIT')
    await perfil.selectOption('ADQUIRIENTE_NIT_B2B')
    await page.getByLabel('Número de Documento *').fill('8909039389')
    await page.getByRole('button', { name: 'Crear Cliente', exact: true }).click()

    await expect(page.getByText('El NIT debe incluir un dígito de verificación válido')).toBeVisible()
    expect(writes).toHaveLength(0)

    await page.getByLabel('Número de Documento *').fill('8909039388')
    await page.getByRole('button', { name: 'Crear Cliente', exact: true }).click()

    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toEqual({
      method: 'POST',
      payload: expect.objectContaining({
        tipo: 'EMPRESA',
        documento_tipo: 'NIT',
        documento_numero: '8909039388',
        dian_perfil_fiscal: 'ADQUIRIENTE_NIT_B2B',
      }),
    })
  })

  test('la edición carga el perfil B2B y persiste consumidor final sólo con documento personal', async ({
    context,
    page,
  }) => {
    const writes: ClienteWrite[] = []
    await prepareColombiaSession(context, page, writes)
    page.on('dialog', (dialog) => dialog.accept())

    await page.goto(`/dashboard/ventas/clientes/${clienteId}/editar/`, { waitUntil: 'domcontentloaded' })

    const perfil = page.getByLabel('Perfil tributario DIAN del receptor *')
    await expect(perfil).toBeVisible({ timeout: 30_000 })
    await expect(perfil).toHaveValue('ADQUIRIENTE_NIT_B2B')
    await expect(page.getByLabel('Tipo de Documento *')).toHaveValue('NIT')

    await perfil.selectOption('CONSUMIDOR_FINAL')
    await page.getByRole('button', { name: 'Actualizar Cliente', exact: true }).click()

    await expect(page.getByText('Un receptor con NIT no puede usar el perfil consumidor final')).toBeVisible()
    expect(writes).toHaveLength(0)

    await page.getByLabel('Tipo de Documento *').selectOption('CC')
    await page.getByLabel('Número de Documento *').fill('1020304050')
    await page.getByRole('button', { name: 'Actualizar Cliente', exact: true }).click()

    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toEqual({
      method: 'PUT',
      payload: expect.objectContaining({
        documento_tipo: 'CC',
        documento_numero: '1020304050',
        dian_perfil_fiscal: 'CONSUMIDOR_FINAL',
      }),
    })
  })
})
