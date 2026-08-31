import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'

const user = {
  id: '52900000-0000-4000-8000-000000000090',
  email: 'notas-dian-529@erp.local',
  nombre: 'Notas',
  apellido: 'DIAN',
  roles: ['ADMIN'],
  tenant_id: '52900000-0000-4000-8000-000000000091',
  is_super_admin: false,
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
      return line.replace(/^\s*JWT_SECRET=/, '').trim().replace(/^['"]|['"]$/g, '')
    }
  }
  throw new Error('JWT_SECRET no está disponible para el E2E aislado 529')
}

async function authenticate(context: BrowserContext) {
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
}

async function seedBrowserSession(page: Page) {
  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']))
    window.localStorage.setItem('selectedCountry', '2')
  }, user)
}

test.describe('notas DIAN 91/92 desde CPE', () => {
  test('crea 92 con motivo DIAN para un tenant real con origen fiscal aceptado', async ({
    context,
    page,
  }) => {
    await authenticate(context)

    const creates: Array<{
      body: Record<string, unknown>
      idempotencyKey: string | null
    }> = []
    let transmissions = 0
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
        return json({
          data: {
            pais_id: 2,
            pais: 'CO',
            paisCodigo: 'CO',
            monedaDefecto: 'COP',
            locale: 'es-CO',
            servicioFiscal: 'DIAN',
          },
        })
      }
      if (/\/api\/configuration\/status\/?$/.test(pathname)) {
        return json({
          success: true,
          data: { isDemo: false, fiscal: { isReady: true, missingItems: [] } },
        })
      }
      if (/\/api\/demo\/status\/?$/.test(pathname)) {
        return json({ is_demo: false, is_expired: false })
      }
      if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
        return json({ data: ['cpe.comprobantes.listar', 'cpe.comprobantes.emitir'] })
      }
      if (/\/api\/cpe\/stats\/?$/.test(pathname)) {
        return json({
          success: true,
          data: { cpeEmitidosHoy: 1, cpeDelMes: 1, montoFacturado: 119000, rechazados: 0 },
        })
      }
      if (/\/api\/cpe\/notas-referenciadas\/origenes\/?$/.test(pathname)) {
        return json({
          success: true,
          data: [{
            id: '52900000-0000-4000-8000-000000000001',
            tipo_documento: 'FACTURA',
            serie: 'FV01',
            numero: '00000125',
            receptor_razon_social: 'Cliente Colombia QA S.A.S.',
            moneda: 'COP',
            total: 119000,
            saldo_total: 119000,
            lineas: [{
              id: '52900000-0000-4000-8000-000000000010',
              orden: 1,
              codigo_producto: 'SERV-GASTO',
              descripcion: 'Servicio logístico',
              unidad_medida: 'NIU',
              afectacion_igv: '10',
              cantidad: 1,
              base: 10000,
              impuesto: 1900,
              total: 11900,
              saldo_cantidad: 1,
              saldo_base: 10000,
              saldo_impuesto: 1900,
              saldo_total: 11900,
            }, {
              id: '52900000-0000-4000-8000-000000000011',
              orden: 2,
              codigo_producto: 'SERV-EXENTO',
              descripcion: 'Servicio exento',
              unidad_medida: 'NIU',
              afectacion_igv: '20',
              cantidad: 1,
              base: 107100,
              impuesto: 0,
              total: 107100,
              saldo_cantidad: 1,
              saldo_base: 107100,
              saldo_impuesto: 0,
              saldo_total: 107100,
            }],
            cpe: { id: '52900000-0000-4000-8000-000000000002', estado: 'ACEPTADO' },
          }],
        })
      }
      if (/\/api\/cpe\/notas-referenciadas\/?$/.test(pathname) && request.method() === 'POST') {
        creates.push({
          body: request.postDataJSON(),
          idempotencyKey: await request.headerValue('Idempotency-Key'),
        })
        return json({
          success: true,
          data: {
            cpe_id: '52900000-0000-4000-8000-000000000004',
            tipo_documento: '92',
            serie: 'ND01',
            numero: '00000001',
            financial_effect_status: 'PENDING_FISCAL_ACCEPTANCE',
          },
        })
      }
      if (/\/api\/cpe\/comprobantes\/[^/]+\/enviar-sunat\/?$/.test(pathname)) {
        transmissions += 1
        return json({ success: false, message: 'La demo no transmite' })
      }
      if (/\/api\/cpe\/comprobantes\/?$/.test(pathname)) {
        return json({
          success: true,
          data: [{
            id: '52900000-0000-4000-8000-000000000003',
            tipoDocumento: '91',
            tipoComprobante: 'Nota Crédito DIAN',
            serie: 'NC01',
            numero: 1,
            fechaEmision: '2026-08-29',
            cliente: 'Cliente Colombia QA S.A.S.',
            clienteRuc: '900123456-8',
            total: 119000,
            moneda: 'COP',
            estado: 'FIRMADO',
            fechaCreacion: '2026-08-29T12:00:00-05:00',
          }],
        })
      }
      return json({ success: true, data: [] })
    })

    await seedBrowserSession(page)
    page.on('dialog', (dialog) => dialog.accept())

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('colombia-fiscal-readiness')).toHaveAttribute('data-ready', 'true')
    await expect(page.getByRole('button', { name: 'Enviar DIAN' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Nueva NC / ND DIAN' })).toBeVisible()
    await expect(page.getByLabel('Tipo comprobante').locator('option')).toHaveText([
      'Todos los tipos',
      'Factura electrónica',
      'Documento equivalente',
      'Nota Crédito DIAN (91)',
      'Nota Débito DIAN (92)',
    ])

    await page.getByRole('button', { name: 'Nueva NC / ND DIAN' }).click()
    await expect(page.getByRole('heading', { name: 'Nueva nota DIAN referenciada' })).toBeVisible()
    await expect(page.getByTestId('referenced-note-type').locator('option')).toHaveText([
      'Nota de crédito (91)',
      'Nota de débito (92)',
    ])
    await expect(page.getByText(/DIAN acepte la nota con una respuesta correlacionada/i)).toBeVisible()

    await page.getByTestId('referenced-note-reason').selectOption('5')
    await expect(page.getByTestId('referenced-note-exact-representation-error')).toContainText(
      'no permite determinar líneas, base e impuesto de forma fiscalmente exacta',
    )
    await expect(page.getByTestId('create-referenced-note')).toBeDisabled()

    await page.getByTestId('referenced-note-type').selectOption('92')
    await page.getByTestId('referenced-note-reason').selectOption('2')
    await page.getByLabel('Sustento').fill('Gastos logísticos cobrados al adquiriente')
    await page.getByTestId('referenced-note-line-select-52900000-0000-4000-8000-000000000010').check()
    await expect(page.getByTestId('referenced-note-amount')).toHaveValue('11900')
    await page.getByTestId('create-referenced-note').click()

    await expect.poll(() => creates.length).toBe(1)
    expect(creates[0]).toMatchObject({
      body: {
        documento_origen_id: '52900000-0000-4000-8000-000000000001',
        tipo_documento: '92',
        codigo_motivo: '2',
        motivo: 'Gastos logísticos cobrados al adquiriente',
        monto_total: 11900,
        prorrateo_global: false,
        lineas: [{
          source_document_line_id: '52900000-0000-4000-8000-000000000010',
          cantidad: 1,
          base: 10000,
          impuesto: 1900,
          total: 11900,
        }],
      },
    })
    expect(creates[0]?.idempotencyKey).toMatch(/^note-ui:/)
    expect(transmissions).toBe(0)
  })

  test('la demo no fabrica aceptación DIAN y deja el formulario vacío bloqueado', async ({
    context,
    page,
  }) => {
    await authenticate(context)
    let creates = 0
    let originRequests = 0
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
        return json({
          data: {
            pais_id: 2,
            pais: 'CO',
            paisCodigo: 'CO',
            monedaDefecto: 'COP',
            locale: 'es-CO',
            servicioFiscal: 'DIAN',
          },
        })
      }
      if (/\/api\/configuration\/status\/?$/.test(pathname)) {
        return json({
          success: true,
          data: { isDemo: true, fiscal: { isReady: false, missingItems: [] } },
        })
      }
      if (/\/api\/demo\/status\/?$/.test(pathname)) {
        return json({ is_demo: true, is_expired: false })
      }
      if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
        return json({ data: ['cpe.comprobantes.listar', 'cpe.comprobantes.emitir'] })
      }
      if (/\/api\/cpe\/stats\/?$/.test(pathname)) {
        return json({
          success: true,
          data: { cpeEmitidosHoy: 0, cpeDelMes: 0, montoFacturado: 0, rechazados: 0 },
        })
      }
      if (/\/api\/cpe\/notas-referenciadas\/origenes\/?$/.test(pathname)) {
        originRequests += 1
        if (originRequests <= 3) {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: 'Fallo temporal DIAN' }),
          })
        }
        return json({ success: true, data: [] })
      }
      if (/\/api\/cpe\/notas-referenciadas\/?$/.test(pathname) && request.method() === 'POST') {
        creates += 1
      }
      return json({ success: true, data: [] })
    })

    await seedBrowserSession(page)
    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Nueva NC / ND DIAN' }).click()

    await expect(page.getByTestId('referenced-note-origin-error')).toHaveText(
      /No se pudieron cargar las facturas aceptadas por DIAN.*reintenta la consulta/i,
    )
    await expect(page.getByTestId('referenced-note-empty-state')).toHaveCount(0)
    await expect(page.getByTestId('create-referenced-note')).toBeDisabled()
    await page.getByRole('button', { name: 'Reintentar' }).click()

    await expect(page.getByTestId('referenced-note-empty-state')).toHaveText(
      'Para emitir NC/ND DIAN necesitas una factura electrónica aceptada por DIAN del mismo contribuyente; la demo no fabrica aceptación fiscal.',
    )
    expect(originRequests).toBe(4)
    await expect(page.getByRole('spinbutton', { name: 'Total exacto de líneas (COP)' })).toBeVisible()
    await expect(page.getByTestId('referenced-note-type')).toBeDisabled()
    await expect(page.getByTestId('referenced-note-reason')).toBeDisabled()
    await expect(page.getByTestId('referenced-note-origin')).toBeDisabled()
    await expect(page.getByLabel('Sustento')).toBeDisabled()
    await expect(page.getByTestId('referenced-note-amount')).toBeDisabled()
    await expect(page.getByTestId('create-referenced-note')).toBeDisabled()
    expect(creates).toBe(0)
  })
})
