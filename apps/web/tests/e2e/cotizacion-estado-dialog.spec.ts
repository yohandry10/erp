import { expect, test } from '@playwright/test'
import { SignJWT } from 'jose'

const user = {
  id: 'cotizacion-dialog-user',
  email: 'cotizacion-dialog@erp.local',
  nombre: 'QA',
  apellido: 'Cotizaciones',
  roles: ['ADMIN'],
  tenant_id: 'cotizacion-dialog-tenant',
  is_super_admin: false,
}

const sellerUser = {
  id: 'pedido-vendedor-user',
  email: 'pedido-vendedor@erp.local',
  nombre: 'QA',
  apellido: 'Vendedor',
  roles: ['VENDEDOR'],
  tenant_id: 'pedido-vendedor-tenant',
  is_super_admin: false,
}

const logisticsUser = {
  id: 'pedido-logistica-user',
  email: 'pedido-logistica@erp.local',
  nombre: 'QA',
  apellido: 'Logística',
  roles: ['ADMIN'],
  tenant_id: 'pedido-logistica-tenant',
  is_super_admin: false,
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
  let rechazarPrimeraDecision = true
  const mutations: Array<{ path: string; body: any }> = []
  const nativeDialogs: string[] = []
  const browserErrors: string[] = []
  const httpErrors: Array<{ path: string; status: number }> = []
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.type())
    await dialog.dismiss()
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) {
      httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() })
    }
  })
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
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({
        data: [
          { id: 'perm-edit', tenant_id: user.tenant_id, modulo: 'ventas', recurso: 'cotizaciones', accion: 'editar' },
          { id: 'perm-approve', tenant_id: user.tenant_id, modulo: 'ventas', recurso: 'cotizaciones', accion: 'approve' },
          { id: 'perm-convert', tenant_id: user.tenant_id, modulo: 'ventas', recurso: 'cotizaciones', accion: 'convertir_pedido' },
        ],
      })
    }

    if (/\/api\/ventas\/cotizaciones\/cotizacion-dialog\/aprobar\/?$/.test(pathname)) {
      mutations.push({ path: pathname, body: request.postDataJSON() })
      if (rechazarPrimeraDecision) {
        rechazarPrimeraDecision = false
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 400,
            message: 'La cotización requiere un aprobador distinto del creador',
            error: 'Bad Request',
          }),
        })
      }
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
  await expect(page.getByText('IGV (18%):', { exact: true })).toBeVisible()
  await expect(page.getByText('IGV (18%) (18%):', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Aprobar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Aprobar cotización' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Motivo u observación' }).fill('Aprobada en revisión QA')
  await dialog.getByRole('button', { name: 'Aprobar cotización' }).click()

  await expect(page.getByText('La cotización requiere un aprobador distinto del creador')).toBeVisible()
  await expect(page.getByText('ENVIADA', { exact: true })).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Aprobar cotización' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Aprobar cotización' }).click()

  await expect(page.getByText('APROBADA', { exact: true })).toBeVisible()
  expect(mutations).toHaveLength(2)
  expect(mutations[0].path).toMatch(/\/api\/ventas\/cotizaciones\/cotizacion-dialog\/aprobar\/?$/)
  expect(mutations[0].body).toEqual({ motivo: 'Aprobada en revisión QA' })
  expect(mutations[1]).toEqual(mutations[0])
  expect(httpErrors).toHaveLength(1)
  expect(httpErrors[0].status).toBe(400)
  expect(httpErrors[0].path).toMatch(/\/api\/ventas\/cotizaciones\/cotizacion-dialog\/aprobar\/?$/)
  expect(nativeDialogs).toEqual([])
  expect(browserErrors.filter((message) =>
    message !== 'Failed to load resource: the server responded with a status of 400 (Bad Request)'
  )).toEqual([])
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

test('el vendedor entrega el pedido a Logística sin recibir accesos que no posee', async ({ context, page }) => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de pedidos')

  const token = await new SignJWT({
    tenant_id: sellerUser.tenant_id,
    email: sellerUser.email,
    roles: sellerUser.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sellerUser.id)
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

  let logisticsRequests = 0
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(sellerUser)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({
        data: {
          pais_id: 1,
          pais: 'PE',
          paisCodigo: 'PE',
          monedaDefecto: 'PEN',
          usar_flujo_logistica: true,
        },
      })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) return json({ is_demo: false, is_expired: false })
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({
        data: [{
          id: 'perm-confirmar-pedido',
          tenant_id: sellerUser.tenant_id,
          modulo: 'ventas',
          recurso: 'pedidos',
          accion: 'confirmar',
        }],
      })
    }
    if (/\/api\/configuracion-fiscal\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          tasa_igv: 0.18,
          moneda_principal: 'PEN',
          pais_id: 1,
          impuesto_principal_nombre: 'IGV',
          impuesto_principal_porcentaje: 0.18,
        },
      })
    }
    if (/\/api\/ventas\/pedidos\/pedido-vendedor\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          id: 'pedido-vendedor',
          numero: 'PED-QA-VENDEDOR',
          estado: 'CONFIRMADO',
          created_at: '2026-08-25T12:00:00-05:00',
          subtotal: 100,
          igv: 18,
          total: 118,
          moneda: 'PEN',
          observaciones: 'Pedido confirmado por Ventas',
          cliente: {
            razon_social: 'Cliente QA Vendedor',
            documento_tipo: 'RUC',
            documento_numero: '20600000013',
          },
          detalle: [{
            id: 'detalle-vendedor',
            descripcion: 'Producto QA',
            cantidad: 1,
            cantidad_despachada: 0,
            precio_unitario: 100,
            subtotal: 100,
          }],
        },
      })
    }
    if (/\/api\/inventario\/logistica\/ordenes-pendientes\/?$/.test(pathname)) {
      logisticsRequests += 1
      return json({ success: true, data: [] })
    }

    return json({ success: true, data: [] })
  })

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['vendedor']))
    window.localStorage.setItem('selectedCountry', '1')
  }, sellerUser)

  await page.goto('/dashboard/ventas/pedidos/pedido-vendedor/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Pedido PED-QA-VENDEDOR' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Pendiente de atención por el equipo de Logística', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ir a Logística' })).toHaveCount(0)

  await page.goto('/dashboard/inventario/logistica/ordenes-pendientes/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Acceso denegado' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('El rol actual no puede preparar ni despachar pedidos. El equipo de Logística continuará este flujo.')).toBeVisible()
  expect(logisticsRequests).toBe(0)
  expect(browserErrors).toEqual([])
})

test('el rol autorizado abre Logística y carga las órdenes pendientes', async ({ context, page }) => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de Logística')

  const token = await new SignJWT({
    tenant_id: logisticsUser.tenant_id,
    email: logisticsUser.email,
    roles: logisticsUser.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(logisticsUser.id)
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

  let logisticsRequests = 0
  const pedido = {
    id: 'pedido-logistica',
    numero: 'PED-QA-LOGISTICA',
    estado: 'CONFIRMADO',
    created_at: '2026-08-25T12:00:00-05:00',
    fecha_pedido: '2026-08-25',
    subtotal: 100,
    igv: 18,
    total: 118,
    moneda: 'PEN',
    cliente: {
      razon_social: 'Cliente QA Logística',
      documento_tipo: 'RUC',
      documento_numero: '20600000013',
    },
    detalle: [{
      id: 'detalle-logistica',
      descripcion: 'Producto QA',
      cantidad: 1,
      cantidad_despachada: 0,
      precio_unitario: 100,
      subtotal: 100,
    }],
  }

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(logisticsUser)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({
        data: {
          pais_id: 1,
          pais: 'PE',
          paisCodigo: 'PE',
          monedaDefecto: 'PEN',
          usar_flujo_logistica: true,
        },
      })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) return json({ is_demo: false, is_expired: false })
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({
        data: [{
          id: 'perm-ver-logistica',
          tenant_id: logisticsUser.tenant_id,
          modulo: 'inventario',
          recurso: 'logistica',
          accion: 'ver',
        }],
      })
    }
    if (/\/api\/configuracion-fiscal\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          tasa_igv: 0.18,
          moneda_principal: 'PEN',
          pais_id: 1,
          impuesto_principal_nombre: 'IGV',
          impuesto_principal_porcentaje: 0.18,
        },
      })
    }
    if (/\/api\/ventas\/pedidos\/pedido-logistica\/?$/.test(pathname)) {
      return json({ success: true, data: pedido })
    }
    if (/\/api\/inventario\/logistica\/ordenes-pendientes\/?$/.test(pathname)) {
      logisticsRequests += 1
      return json({ success: true, data: [pedido] })
    }

    return json({ success: true, data: [] })
  })

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']))
    window.localStorage.setItem('selectedCountry', '1')
  }, logisticsUser)

  await page.goto('/dashboard/ventas/pedidos/pedido-logistica/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Pedido PED-QA-LOGISTICA' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Ir a Logística' }).click()

  await expect(page.getByRole('heading', { name: 'Órdenes Pendientes de Preparación' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('PED-QA-LOGISTICA', { exact: true })).toBeVisible()
  expect(logisticsRequests).toBeGreaterThanOrEqual(1)
})
