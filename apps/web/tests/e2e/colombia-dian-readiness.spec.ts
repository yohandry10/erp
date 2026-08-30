import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'

const user = {
  id: '52600000-0000-4000-8000-000000000090',
  email: 'colombia-dian-526@erp.local',
  nombre: 'Fiscal',
  apellido: 'Colombia',
  roles: ['ADMIN'],
  tenant_id: '52600000-0000-4000-8000-000000000091',
  is_super_admin: false,
}

type FiscalStatus = {
  isDemo: boolean
  fiscal: {
    isReady: boolean
    missingItems: string[]
  }
}

type PermissionFixture = {
  id: string
  tenant_id: string
  modulo: string
  accion: string
  recurso: string
}

const dianAdminPermissions: PermissionFixture[] = [
  { id: 'p-read', tenant_id: user.tenant_id, modulo: 'cpe', accion: 'ver', recurso: 'dian.facturas_recibidas' },
  { id: 'p-manage', tenant_id: user.tenant_id, modulo: 'cpe', accion: 'gestionar', recurso: 'dian.facturas_recibidas' },
  { id: 'p-034', tenant_id: user.tenant_id, modulo: 'cpe', accion: 'emitir', recurso: 'dian.eventos_034' },
  { id: 'p-cpe-read', tenant_id: user.tenant_id, modulo: 'cpe', accion: 'ver', recurso: '__global__' },
  { id: 'p-cpe-create', tenant_id: user.tenant_id, modulo: 'cpe', accion: 'crear', recurso: '__global__' },
]

const dianReadOnlyPermissions = dianAdminPermissions.filter((permission) =>
  permission.id === 'p-read' || permission.id === 'p-cpe-read',
)

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  for (const envPath of [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../erp-api/.env'),
  ]) {
    if (!fs.existsSync(envPath)) continue
    const contents = fs.readFileSync(envPath, 'utf8')
    const line = contents
      .split(/\r?\n/)
      .find((entry) => /^\s*JWT_SECRET=/.test(entry))
    if (line) {
      return line
        .replace(/^\s*JWT_SECRET=/, '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
  }
  throw new Error('JWT_SECRET no está disponible para el E2E aislado DIAN 526')
}

async function prepareColombiaSession(
  context: BrowserContext,
  page: Page,
  fiscalStatus: FiscalStatus,
  permissions: PermissionFixture[] = dianAdminPermissions,
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

  await context.addCookies([
    {
      name: 'access_token',
      value: token,
      url: process.env.BASE_URL || 'http://localhost:3001',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = (body: unknown) =>
      route.fulfill({
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
    if (/\/api\/configuration\/status\/?$/.test(pathname)) {
      return json({ success: true, data: fiscalStatus })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: fiscalStatus.isDemo, is_expired: false })
    }
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({ data: permissions })
    }
    if (/\/api\/cpe\/stats\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          cpeEmitidosHoy: 1,
          cpeDelMes: 1,
          montoFacturado: 119_000,
          rechazados: 0,
        },
      })
    }
    if (/\/api\/cpe\/comprobantes\/?$/.test(pathname)) {
      return json({
        success: true,
        data: [
          {
            id: '52600000-0000-4000-8000-000000000001',
            tipoDocumento: '01',
            tipoComprobante: 'Factura electrónica',
            serie: 'FE01',
            numero: 1,
            fechaEmision: '2026-08-29',
            cliente: 'Cliente Colombia QA S.A.S.',
            clienteRuc: '900123456-8',
            total: 119_000,
            moneda: 'COP',
            estado: 'FIRMADO',
            fechaCreacion: '2026-08-29T12:00:00-05:00',
          },
        ],
      })
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

test.describe('habilitación fiscal DIAN en CPE', () => {
  test('el administrador registra una constancia portal explícita e idempotente', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: {
        isReady: false,
        missingItems: ['Constancia portal DIAN HABILITADO'],
      },
    })

    const requestContracts: Array<{
      method: string
      idempotencyKey: string | undefined
      body: unknown
    }> = []
    await page.route('**/api/configuration/colombia/dian/habilitacion/**', async (route) => {
      const request = route.request()
      requestContracts.push({
        method: request.method(),
        idempotencyKey: (await request.headerValue('Idempotency-Key')) ?? undefined,
        body: request.postDataJSON(),
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { state: 'HABILITADO' } }),
      })
    })

    await page.goto('/dashboard/configuracion', { waitUntil: 'domcontentloaded' })

    const control = page.getByTestId('dian-habilitacion-control')
    await expect(control).toBeVisible()
    await control.getByLabel('Referencia verificable de la constancia').fill('RADICADO-DIAN-526')
    await control
      .getByLabel(/Confirmo que el portal DIAN muestra este Software ID y TestSet/i)
      .check()
    await control.getByRole('button', { name: 'Registrar constancia HABILITADO' }).click()

    await expect(control.getByRole('status')).toContainText('Constancia HABILITADO registrada')
    expect(requestContracts).toHaveLength(1)
    expect(requestContracts[0]).toMatchObject({
      method: 'POST',
      body: {
        confirmed: true,
        evidenceReference: 'RADICADO-DIAN-526',
      },
    })
    expect(requestContracts[0]?.idempotencyKey).toMatch(/^dian-habilitacion-ui:/)
  })

  test('bloquea la transmisión cuando falta la constancia portal HABILITADO', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: {
        isReady: false,
        missingItems: ['Constancia portal DIAN HABILITADO'],
      },
    })

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })

    const readiness = page.getByTestId('colombia-fiscal-readiness')
    await expect(readiness).toHaveAttribute('data-ready', 'false')
    await expect(readiness).toContainText('Transmisión DIAN bloqueada')
    await expect(readiness).toContainText('Constancia portal DIAN HABILITADO')
    await expect(page.getByRole('button', { name: 'Enviar DIAN' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Nueva factura sin transmisión' })).toBeVisible()
  })

  test('habilita la transmisión sólo con tenant real y configuración fiscal lista', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: {
        isReady: true,
        missingItems: [],
      },
    })

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })

    const readiness = page.getByTestId('colombia-fiscal-readiness')
    await expect(readiness).toHaveAttribute('data-ready', 'true')
    await expect(readiness).toContainText('Transmisión DIAN habilitada')
    await expect(page.getByRole('button', { name: 'Enviar DIAN' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Nueva factura DIAN' })).toBeVisible()
  })

  test('una demo permanece sin transmisión aunque el bloque fiscal esté completo', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: true,
      fiscal: {
        isReady: true,
        missingItems: [],
      },
    })

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })

    const readiness = page.getByTestId('colombia-fiscal-readiness')
    await expect(readiness).toHaveAttribute('data-ready', 'false')
    await expect(readiness).toContainText('Modo demo')
    await expect(page.getByRole('button', { name: 'Enviar DIAN' })).toBeDisabled()
    await expect(page.getByTestId('dian-events-panel')).toHaveAttribute('data-operational', 'false')
    await expect(page.getByTestId('dian-events-panel')).toContainText(
      'no consulta ni registra eventos reales en DIAN',
    )
  })

  test('un tenant real no habilitado conserva el historial pero oculta todas las escrituras', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: { isReady: false, missingItems: ['Trust store de autoridad DIAN'] },
    })
    await page.route('**/api/cpe/dian/facturas-recibidas**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{
          id: 'invoice-history-only',
          cufe: 'B'.repeat(96),
          documentId: 'SETP-HISTORIAL-001',
          issueDate: '2026-08-29',
          currencyCode: 'COP',
          payableAmount: '85000.00',
          issuer: { name: 'Proveedor Histórico S.A.S.', number: '900800700' },
          state: 'VERIFIED',
          proveedorId: 'provider-history',
          events: [],
        }],
      }),
    }))

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('dian-events-panel')
    await expect(panel).toHaveAttribute('data-operational', 'false')
    await expect(panel).toContainText('SETP-HISTORIAL-001')
    await expect(panel).toContainText('Historial disponible')
    await expect(panel.getByTestId('dian-import-received')).toHaveCount(0)
    await expect(panel.getByRole('button', { name: '030 Acuse' })).toHaveCount(0)
  })

  test('un auditor DIAN puede leer la bandeja sin importar ni registrar eventos', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: { isReady: true, missingItems: [] },
    }, dianReadOnlyPermissions)
    await page.route('**/api/cpe/dian/facturas-recibidas**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{
          id: 'invoice-auditor',
          cufe: 'C'.repeat(96),
          documentId: 'SETP-AUDITOR-001',
          issueDate: '2026-08-29',
          currencyCode: 'COP',
          payableAmount: '42000.00',
          issuer: { name: 'Proveedor Auditor S.A.S.', number: '901111222' },
          state: 'VERIFIED',
          proveedorId: 'provider-auditor',
          events: [],
        }],
      }),
    }))

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('dian-events-panel')
    await expect(panel).toContainText('SETP-AUDITOR-001')
    await expect(panel).toContainText('Vista de sólo lectura')
    await expect(panel.getByTestId('dian-import-received')).toHaveCount(0)
    await expect(panel.getByRole('button', { name: '030 Acuse' })).toHaveCount(0)
  })

  test('reconcilia por operationId persistido aunque no exista clave de sessionStorage', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: { isReady: true, missingItems: [] },
    })
    const operationId = '52700000-0000-4000-8000-000000000030'
    const postPaths: string[] = []
    await page.route('**/api/cpe/dian/**', async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (request.method() === 'POST') {
        postPaths.push(pathname)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            state: 'COMPLETED',
            resultKind: 'ACCEPTED',
            responseCode: '00',
          }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{
            id: 'invoice-retry',
            cufe: 'D'.repeat(96),
            documentId: 'SETP-RETRY-001',
            issueDate: '2026-08-29',
            currencyCode: 'COP',
            payableAmount: '19000.00',
            issuer: { name: 'Proveedor Retry S.A.S.', number: '901333444' },
            state: 'VERIFIED',
            proveedorId: 'provider-retry',
            events: [{
              id: 'event-retry-030',
              operationId,
              eventCode: '030',
              eventCude: 'E'.repeat(96),
              resultKind: 'TECHNICAL_ERROR',
              responseCode: 'DIAN_TIMEOUT_UNCERTAIN',
              attempt: 2,
              canRetry: true,
              capabilities: { retry: true, reconcile: true },
            }],
          }],
        }),
      })
    })

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })
    const panel = page.getByTestId('dian-events-panel')
    await expect(panel).toContainText('intento 2')
    const persistedKeys = await page.evaluate(() => Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith('dian-event:')))
    expect(persistedKeys).toEqual([])

    await panel.getByTestId(`dian-retry-event-${operationId}`).click()
    await expect(panel.getByRole('status')).toContainText('DIAN confirmó el evento')
    expect(postPaths).toEqual([
      `/backend/api/cpe/dian/facturas-recibidas/eventos/${operationId}/reintentar/`,
    ])
  })

  test('importa una FEV y recorre 030→032→033 más 034 con contratos e idempotencia', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: {
        isReady: true,
        missingItems: [],
      },
    })

    const cufe = 'A'.repeat(96)
    const receivedInvoiceId = '52700000-0000-4000-8000-000000000001'
    const issuedInvoiceId = '52600000-0000-4000-8000-000000000001'
    const receivedEvents: Array<{
      id: string
      operationId: string
      eventCode: '030' | '032' | '033'
      resultKind: 'ACCEPTED'
      responseCode: '00'
    }> = []
    const calls: Array<{
      pathname: string
      method: string
      idempotencyKey?: string
      body?: unknown
    }> = []

    await page.route('**/api/cpe/comprobantes**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{
            id: issuedInvoiceId,
            tipoDocumento: '01',
            tipoComprobante: 'Factura electrónica',
            serie: 'FE01',
            numero: 1,
            fechaEmision: '2026-08-29',
            cliente: 'Cliente Colombia QA S.A.S.',
            clienteRuc: '900123456-8',
            total: 119_000,
            moneda: 'COP',
            estado: 'ACEPTADO',
            fechaCreacion: '2026-08-29T12:00:00-05:00',
          }],
        }),
      })
    })
    await page.route('**/api/compras/proveedores**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{
            id: '52700000-0000-4000-8000-000000000002',
            razon_social: 'Proveedor DIAN S.A.S.',
            ruc: '900123456-8',
          }],
        }),
      })
    })
    await page.route('**/api/cpe/dian/**', async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [{
              id: receivedInvoiceId,
              cufe,
              documentId: 'SETP990000001',
              issueDate: '2026-08-29',
              currencyCode: 'COP',
              payableAmount: '119000.00',
              issuer: { name: 'Proveedor DIAN S.A.S.', number: '900123456' },
              state: 'VERIFIED',
              proveedorId: '52700000-0000-4000-8000-000000000002',
              events: receivedEvents,
            }],
          }),
        })
      }
      const body = request.postDataJSON() as { eventCode?: '030' | '032' | '033' }
      calls.push({
        pathname,
        method: request.method(),
        idempotencyKey: (await request.headerValue('Idempotency-Key')) ?? undefined,
        body,
      })
      if (body.eventCode) {
        receivedEvents.push({
          id: `event-${body.eventCode}`,
          operationId: `operation-${body.eventCode}`,
          eventCode: body.eventCode,
          resultKind: 'ACCEPTED',
          responseCode: '00',
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          state: 'COMPLETED',
          resultKind: 'ACCEPTED',
          responseCode: '00',
        }),
      })
    })
    await page.route(`**/api/cpe/${issuedInvoiceId}/dian/eventos**`, async (route) => {
      const request = route.request()
      calls.push({
        pathname: new URL(request.url()).pathname,
        method: request.method(),
        idempotencyKey: (await request.headerValue('Idempotency-Key')) ?? undefined,
        body: request.postDataJSON(),
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          state: 'COMPLETED',
          resultKind: 'ACCEPTED',
          responseCode: '00',
        }),
      })
    })

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('dian-events-panel')
    await expect(panel).toHaveAttribute('data-operational', 'true')
    await expect(panel).toContainText('SETP990000001')
    await expect(panel).toContainText('Proveedor DIAN S.A.S.')

    await panel.getByTestId('dian-received-cufe').fill(cufe)
    await panel.getByTestId('dian-received-provider').selectOption(
      '52700000-0000-4000-8000-000000000002',
    )
    await panel.getByTestId('dian-import-received').click()
    await expect(panel.getByRole('status')).toContainText('importada')

    await panel.getByRole('button', { name: '030 Acuse' }).click()
    const composer = panel.getByTestId('dian-event-composer')
    await composer.getByLabel('Número de identificación').fill('1012345678')
    await composer.getByLabel('Nombres').fill('Ana')
    await composer.getByLabel('Apellidos').fill('Pérez')
    await composer.getByLabel('Cargo').fill('Jefe de compras')
    await composer.getByLabel('Área responsable').fill('Compras')
    await composer.getByTestId('dian-submit-event').click()
    await expect(panel.getByRole('status')).toContainText('Acuse de recibo')

    await panel.getByRole('button', { name: '032 Recibo' }).click()
    await panel.getByTestId('dian-event-composer').getByTestId('dian-submit-event').click()
    await expect(panel.getByRole('status')).toContainText('Recibo de bienes o servicios')

    await panel.getByRole('button', { name: '033 Aceptar' }).click()
    await panel.getByTestId('dian-event-composer').getByTestId('dian-submit-event').click()
    await expect(panel.getByRole('status')).toContainText('Aceptación expresa')

    await panel.getByRole('button', { name: '034 Tácita' }).click()
    await panel.getByText(/Declaro bajo juramento/).click()
    await panel.getByTestId('dian-submit-event').click()
    await expect(panel.getByRole('status')).toContainText('Aceptación tácita')

    expect(calls).toHaveLength(5)
    expect(calls[0]).toMatchObject({
      pathname: '/backend/api/cpe/dian/facturas-recibidas/importar/',
      method: 'POST',
      body: {
        cufe,
        proveedorId: '52700000-0000-4000-8000-000000000002',
      },
    })
    expect(calls[0]?.idempotencyKey).toMatch(/^dian-import-ui:/)
    expect(calls[1]).toMatchObject({
      pathname: `/backend/api/cpe/dian/facturas-recibidas/${receivedInvoiceId}/eventos/`,
      method: 'POST',
      body: {
        eventCode: '030',
        responsiblePerson: {
          identityType: '13',
          identityNumber: '1012345678',
          firstName: 'Ana',
          familyName: 'Pérez',
          jobTitle: 'Jefe de compras',
          organizationDepartment: 'Compras',
        },
      },
    })
    expect(calls[1]?.idempotencyKey).toMatch(/^dian-event-ui:/)
    expect(calls[2]).toMatchObject({
      pathname: `/backend/api/cpe/dian/facturas-recibidas/${receivedInvoiceId}/eventos/`,
      method: 'POST',
      body: {
        eventCode: '032',
        responsiblePerson: {
          identityType: '13',
          identityNumber: '1012345678',
          firstName: 'Ana',
          familyName: 'Pérez',
          jobTitle: 'Jefe de compras',
          organizationDepartment: 'Compras',
        },
      },
    })
    expect(calls[2]?.idempotencyKey).toMatch(/^dian-event-ui:/)
    expect(calls[3]).toMatchObject({
      pathname: `/backend/api/cpe/dian/facturas-recibidas/${receivedInvoiceId}/eventos/`,
      method: 'POST',
      body: { eventCode: '033' },
    })
    expect(calls[3]?.idempotencyKey).toMatch(/^dian-event-ui:/)
    expect(calls[4]).toMatchObject({
      pathname: `/backend/api/cpe/${issuedInvoiceId}/dian/eventos/`,
      method: 'POST',
      body: {
        eventCode: '034',
        swornConfirmation: true,
      },
    })
    expect(calls[4]?.idempotencyKey).toMatch(/^dian-event-ui:/)
  })
})
