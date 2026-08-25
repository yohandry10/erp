import { expect, test } from '@playwright/test'
import { SignJWT } from 'jose'

const user = {
  id: 'cotizacion-dialog-user',
  email: 'cotizacion-dialog@erp.local',
  nombre: 'QA',
  apellido: 'Cotizaciones',
  roles: ['ADMIN'],
  tenant_id: 'cotizacion-dialog-tenant',
  is_super_admin: true,
}

test('aprobar cotización usa diálogo integrado y conserva la observación', async ({ context, page }) => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de cotizaciones')

  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret))

  await context.addCookies([{
    name: 'access_token',
    value: token,
    url: process.env.BASE_URL || 'http://localhost:3001',
    httpOnly: true,
    sameSite: 'Lax',
  }])

  let estado = 'ENVIADA'
  const mutations: Array<{ path: string; body: any }> = []
  const nativeDialogs: string[] = []
  const browserErrors: string[] = []
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type())
    await dialog.dismiss()
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({ data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', monedaDefecto: 'PEN' } })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) return json({ is_demo: false, is_expired: false })
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) return json({ data: [] })

    if (/\/api\/ventas\/cotizaciones\/cotizacion-dialog\/aprobar\/?$/.test(pathname)) {
      mutations.push({ path: pathname, body: request.postDataJSON() })
      estado = 'APROBADA'
      return json({ success: true, data: { estado } })
    }
    if (/\/api\/ventas\/cotizaciones\/cotizacion-dialog\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          id: 'cotizacion-dialog',
          numero: 'COT-QA-DIALOG',
          estado,
          fecha_emision: '2026-08-25',
          subtotal: 100,
          igv: 18,
          total: 118,
          moneda: 'PEN',
          observaciones: 'QA visual',
          cliente: {
            razon_social: 'Cliente QA Dialog',
            documento_tipo: 'RUC',
            documento_numero: '20600000013',
          },
          detalle: [{
            id: 'detalle-1',
            descripcion: 'Producto QA',
            cantidad: 1,
            precio_unitario: 100,
            subtotal: 100,
          }],
        },
      })
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

  await page.goto('/dashboard/ventas/cotizaciones/cotizacion-dialog/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cotización COT-QA-DIALOG' })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Aprobar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Aprobar cotización' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Motivo u observación' }).fill('Aprobada en revisión QA')
  await dialog.getByRole('button', { name: 'Aprobar cotización' }).click()

  await expect(page.getByText('APROBADA', { exact: true })).toBeVisible()
  expect(mutations).toHaveLength(1)
  expect(mutations[0].path).toMatch(/\/api\/ventas\/cotizaciones\/cotizacion-dialog\/aprobar\/?$/)
  expect(mutations[0].body).toEqual({ motivo: 'Aprobada en revisión QA' })
  expect(nativeDialogs).toEqual([])
  expect(browserErrors).toEqual([])
})

test('la bandeja aprueba pedidos sin prompt nativo y envía el sustento', async ({ context, page }) => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de aprobaciones')

  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret))

  await context.addCookies([{
    name: 'access_token',
    value: token,
    url: process.env.BASE_URL || 'http://localhost:3001',
    httpOnly: true,
    sameSite: 'Lax',
  }])

  let procesado = false
  const decisions: any[] = []
  const nativeDialogs: string[] = []
  const browserErrors: string[] = []
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type())
    await dialog.dismiss()
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({ data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', monedaDefecto: 'PEN', locale: 'es-PE' } })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) return json({ is_demo: false, is_expired: false })
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) return json({ data: [] })
    if (/\/api\/ventas\/pedidos\/aprobaciones\/pendientes\/?$/.test(pathname)) {
      return json({
        success: true,
        data: procesado ? [] : [{
          id: 'pedido-dialog',
          numero: 'PV-QA-DIALOG',
          total: 118,
          estado_credito: 'REVISION',
          motivos: ['Descuento comercial fuera de política'],
          cliente: { razon_social: 'Cliente QA Dialog', documento_numero: '20600000013' },
          resumen_credito: { limite: 1000, pendiente: 0, tieneVencidos: false, permiteMorosidad: false },
        }],
      })
    }
    if (/\/api\/ventas\/pedidos\/pedido-dialog\/aprobaciones\/decision\/?$/.test(pathname)) {
      decisions.push(request.postDataJSON())
      procesado = true
      return json({ success: true })
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

  await page.goto('/dashboard/ventas/aprobaciones/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Bandeja de Aprobaciones' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'PV-QA-DIALOG' })).toBeVisible()

  await page.getByRole('button', { name: 'Aprobar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Aprobar pedido' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Observación de la decisión' }).fill('Autorizado por QA comercial')
  await dialog.getByRole('button', { name: 'Aprobar pedido' }).click()

  await expect(page.getByText('Pedido aprobado')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'PV-QA-DIALOG' })).toHaveCount(0)
  expect(decisions).toEqual([{
    decision: 'APROBADO',
    motivos: ['Descuento comercial fuera de política'],
    observaciones: 'Autorizado por QA comercial',
  }])
  expect(nativeDialogs).toEqual([])
  expect(browserErrors).toEqual([])
})
