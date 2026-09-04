import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'
import { fiscalDateForCountry } from '../../lib/fiscal-date'
import { formatFiscalDocumentNumber } from '../../lib/fiscal-document-number'

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

const colombiaConsumer = {
  id: '52600000-0000-4000-8000-000000000092',
  documento_tipo: 'CC',
  documento_numero: '1234567890',
  razon_social: 'Cliente Demo Colombia',
  direccion: 'Calle 26 # 10-20, Bogotá D.C.',
  dian_perfil_fiscal: 'CONSUMIDOR_FINAL',
  dian_responsabilidad_fiscal: 'R-99-PN',
  dian_responsabilidad_list_name: '49',
  dian_tributo_id: 'ZY',
  dian_tributo_nombre: 'No causa',
}

const colombiaLegacyDocuments = [
  {
    id: '52600000-0000-4000-8000-000000000093',
    tipo_documento: 'FACTURA',
    serie: 'FE01',
    numero: '00000073',
    fecha_emision: '2026-08-29',
    receptor_numero_doc: '9001234568',
    receptor_razon_social: 'Cliente legado borrador S.A.S.',
    total: 119_000,
    moneda: 'COP',
    estado: 'BORRADOR',
  },
  {
    id: '52600000-0000-4000-8000-000000000094',
    tipo_documento: 'FACTURA',
    serie: 'FE01',
    numero: '00000074',
    fecha_emision: '2026-08-29',
    receptor_numero_doc: '9011234567',
    receptor_razon_social: 'Cliente legado emitido S.A.S.',
    total: 238_000,
    moneda: 'COP',
    estado: 'EMITIDO',
  },
]

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
  failDemoStatus = false,
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
      if (failDemoStatus) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Estado demo no disponible' }),
        })
      }
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
    if (/\/api\/cpe\/receptores\/[^/]+\/?$/.test(pathname)) {
      return json({ success: true, data: colombiaConsumer })
    }
    if (/\/api\/cpe\/receptores\/?$/.test(pathname)) {
      return json({
        data: [colombiaConsumer],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
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
            isDemoRepresentation: fiscalStatus.isDemo === true,
            fechaCreacion: '2026-08-29T12:00:00-05:00',
          },
        ],
      })
    }
    if (/\/api\/documentos\/lista\/?$/.test(pathname)) {
      return json({ success: true, data: colombiaLegacyDocuments })
    }
    if (/\/api\/documentos\/stats\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          totalDocumentos: 2,
          facturas: 2,
          boletas: 0,
          notasCredito: 0,
          contratos: 0,
          pendientesEnvio: 2,
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
    window.localStorage.setItem('selectedCountry', '2')
  }, user)
}

test.describe('habilitación fiscal DIAN en CPE', () => {
  test('el estado demo desconocido no abre el wizard de credenciales reales', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: { isReady: true, missingItems: [] },
    }, dianAdminPermissions, true)

    const failedStatus = page.waitForResponse((response) =>
      /\/api\/demo\/status\/?$/.test(new URL(response.url()).pathname),
    )
    await page.goto('/dashboard/wizard', { waitUntil: 'domcontentloaded' })

    expect((await failedStatus).status()).toBe(503)
    await expect(page.getByText('¡Bienvenido al Asistente de Configuración!')).toHaveCount(0)
    await expect(page.getByText('Carga de Certificado Digital')).toHaveCount(0)
  })

  test('la fecha fiscal de Colombia no salta al día UTC siguiente', () => {
    expect(fiscalDateForCountry('CO', new Date('2026-08-30T03:30:00.000Z'))).toBe('2026-08-29')
  })

  test('la identidad DIAN concatena prefijo y consecutivo sin guion ni padding', () => {
    expect(formatFiscalDocumentNumber('CO', 'FE01', '00000073')).toBe('FE0173')
    expect(formatFiscalDocumentNumber('CO', '', '00000073')).toBe('73')
    expect(formatFiscalDocumentNumber('PE', 'F001', 73, { padNonColombiaTo: 8 })).toBe('F001-00000073')
    expect(formatFiscalDocumentNumber('AR', '00001', 73, { padNonColombiaTo: 8 })).toBe('00001-00000073')
  })

  test('Documentos Colombia queda como historial y deriva toda acción fiscal al Centro CPE', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: true,
      fiscal: { isReady: false, missingItems: ['Modo demo'] },
    })

    const legacyFiscalRequests: string[] = []
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (/\/api\/documentos\/[^/]+\/(?:generar-xml|enviar-sunat)\/?$/.test(pathname)) {
        legacyFiscalRequests.push(`${request.method()} ${pathname}`)
      }
    })

    await page.goto('/dashboard/documentos/', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'Gestión Documental y Facturación Electrónica' }),
    ).toBeVisible()
    await expect(page.getByText(/se gestionan exclusivamente desde el Centro CPE/i)).toBeVisible()
    await expect(page.getByText('FE0173', { exact: true })).toBeVisible()
    await expect(page.getByText('FE0174', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'XML', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'XML firmado', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gestionar en Centro CPE' })).toHaveCount(2)

    await page.getByRole('button', { name: 'Ir al Centro CPE' }).first().click()
    await expect(page).toHaveURL(/\/dashboard\/cpe\/?$/)
    expect(legacyFiscalRequests).toEqual([])
  })

  test('el alta RMA describe el cierre fiscal DIAN y no hereda el CPE 07 de Perú', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: true,
      fiscal: { isReady: false, missingItems: ['Modo demo'] },
    })

    await page.goto('/dashboard/ventas/rma/nuevo', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Nueva devolución de cliente' })).toBeVisible()
    await expect(
      page.getByText(/Nota crédito DIAN 91; CxC tras aceptación/),
    ).toBeVisible()
    await expect(page.getByText(/NC\/CPE 07, CxC y asiento/)).toHaveCount(0)
  })

  test('la RMA demo conserva la devolución física sin ofrecer una aceptación DIAN ficticia', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: true,
      fiscal: { isReady: false, missingItems: ['Modo demo'] },
    })
    const rmaId = '52600000-0000-4000-8000-000000000535'
    await page.route('**/api/ventas/rma/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname
      const data = /recursos-recepcion\/?$/.test(pathname)
        ? { control_calidad_requerido: false, almacenes: [], ubicaciones: [] }
        : {
            id: rmaId,
            numero: 'RMA-CO-DEMO-001',
            estado: 'RECIBIDA',
            motivo_general: 'Devolución demo',
            created_by: user.id,
            pedido_id: 'pedido-demo',
            documento_origen_id: 'documento-demo',
            cpe_origen_id: 'cpe-demo',
            cxc_origen_id: 'cxc-demo',
            nota_credito_documento_id: null,
            nota_credito_cpe_id: null,
            created_at: '2026-09-04T10:00:00-05:00',
            items: [],
            eventos: [],
            saldo_favor: null,
          }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data }),
      })
    })

    await page.goto(`/dashboard/ventas/rma/${rmaId}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'RMA-CO-DEMO-001' })).toBeVisible()
    await expect(page.getByText('Nota crédito DIAN 91 no disponible en demo')).toBeVisible()
    await expect(page.getByText(/No se simulará aceptación fiscal ni se reducirá la CxC/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Crear NC 91/ })).toHaveCount(0)
  })

  test('la RMA falla cerrado si no puede confirmar si el tenant es demo', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: { isReady: true, missingItems: [] },
    }, dianAdminPermissions, true)
    const rmaId = '52600000-0000-4000-8000-000000000539'
    let noteRequests = 0
    await page.route('**/api/ventas/rma/**', async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (request.method() === 'POST' && /\/nota-credito\/?$/.test(new URL(request.url()).pathname)) {
        noteRequests += 1
      }
      const data = /recursos-recepcion\/?$/.test(pathname)
        ? { control_calidad_requerido: false, almacenes: [], ubicaciones: [] }
        : {
            id: rmaId,
            numero: 'RMA-CO-STATUS-UNKNOWN',
            estado: 'RECIBIDA',
            motivo_general: 'Estado demo temporalmente desconocido',
            created_by: user.id,
            pedido_id: 'pedido-real',
            documento_origen_id: 'documento-real',
            cpe_origen_id: 'cpe-real',
            cxc_origen_id: 'cxc-real',
            nota_credito_documento_id: null,
            nota_credito_cpe_id: null,
            created_at: '2026-09-04T10:00:00-05:00',
            items: [],
            eventos: [],
            saldo_favor: null,
          }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data,
        }),
      })
    })

    await page.goto(`/dashboard/ventas/rma/${rmaId}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Estado fiscal no disponible')).toBeVisible()
    await expect(page.getByText(/Por seguridad no se habilita la Nota Crédito DIAN 91/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Crear NC 91/ })).toHaveCount(0)
    expect(noteRequests).toBe(0)
  })

  test('la RMA Colombia real crea la 91 sólo con motivo y queda pendiente sin tocar CxC', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: false,
      fiscal: { isReady: true, missingItems: [] },
    })
    const rmaId = '52600000-0000-4000-8000-000000000536'
    let linked = false
    let postedBody: unknown
    await page.route('**/api/ventas/rma/**', async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      const respond = (data: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data }),
      })
      if (/recursos-recepcion\/?$/.test(pathname)) {
        return respond({ control_calidad_requerido: false, almacenes: [], ubicaciones: [] })
      }
      if (request.method() === 'POST' && /nota-credito\/?$/.test(pathname)) {
        postedBody = request.postDataJSON()
        linked = true
        return respond({
          cpe_id: '52600000-0000-4000-8000-000000000537',
          documento_id: '52600000-0000-4000-8000-000000000538',
          financial_effect_status: 'PENDING_FISCAL_ACCEPTANCE',
        })
      }
      return respond({
        id: rmaId,
        numero: 'RMA-CO-REAL-001',
        estado: 'RECIBIDA',
        motivo_general: 'Devolución aceptada físicamente',
        created_by: user.id,
        pedido_id: 'pedido-real',
        documento_origen_id: 'documento-real',
        cpe_origen_id: 'cpe-real',
        cxc_origen_id: 'cxc-real',
        nota_credito_documento_id: linked
          ? '52600000-0000-4000-8000-000000000538'
          : null,
        nota_credito_cpe_id: linked
          ? '52600000-0000-4000-8000-000000000537'
          : null,
        created_at: '2026-09-04T10:00:00-05:00',
        items: [],
        eventos: [],
        saldo_favor: null,
      })
    })

    await page.goto(`/dashboard/ventas/rma/${rmaId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Crear Nota Crédito DIAN 91')).toBeVisible()
    await page.getByRole('button', { name: 'Crear NC 91 por líneas recibidas' }).click()

    await expect(page.getByText('Nota crédito DIAN 91 pendiente')).toBeVisible()
    await expect(page.getByText(/La CxC todavía no cambia/)).toBeVisible()
    expect(postedBody).toEqual({ motivo: 'Devolución por ítems' })
  })

  test('el pedido demo CO informa muestra local y nunca afirma emisión DIAN', async ({
    context,
    page,
  }) => {
    await prepareColombiaSession(context, page, {
      isDemo: true,
      fiscal: { isReady: false, missingItems: ['Modo demo'] },
    })

    const pedidoId = '52600000-0000-4000-8000-000000000533'
    await page.route(`**/api/ventas/pedidos/${pedidoId}**`, async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      const json = (body: unknown) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })

      if (request.method() === 'POST' && /\/generar-factura\/?$/.test(pathname)) {
        return json({
          success: true,
          factura_id: '52600000-0000-4000-8000-000000000534',
          sugerir_gre: false,
          is_demo_representation: true,
          warnings: [
            'Comprobante demo generado localmente: muestra sin transmisión ni validez DIAN',
          ],
          message: 'Muestra demo generada localmente, sin transmisión ni validez DIAN',
        })
      }

      return json({
        success: true,
        data: {
          id: pedidoId,
          numero: 'PED-CO-0533',
          estado: 'LISTO_FACTURAR',
          created_at: '2026-09-04T10:00:00-05:00',
          factura_id: null,
          subtotal: 100_000,
          igv: 19_000,
          total: 119_000,
          cliente: {
            documento_tipo: 'NIT',
            documento_numero: '9001234568',
            razon_social: 'Cliente Demo Colombia S.A.S.',
          },
          detalle: [{
            id: 'detalle-533',
            descripcion: 'Producto demo Colombia',
            cantidad: 1,
            cantidad_despachada: 1,
            precio_unitario: 100_000,
            subtotal: 100_000,
          }],
        },
      })
    })

    await page.goto(`/dashboard/ventas/pedidos/${pedidoId}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.getByRole('button', { name: 'Generar Factura' }).click()

    await expect(page.getByText(/Se generará el comprobante/)).toBeVisible()
    await expect(
      page.getByText(/en una cuenta demo se crea una muestra local/),
    ).toBeVisible()
    await expect(page.getByText(/Se emitirá el documento fiscal/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Generar factura' }).click()

    await expect(page.getByText('Muestra demo generada', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Comprobante demo generado localmente: muestra sin transmisión ni validez DIAN', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Factura generada', { exact: true })).toHaveCount(0)
  })

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
    await expect(page.getByTestId('cpe-status-52600000-0000-4000-8000-000000000001'))
      .toHaveText('MUESTRA LOCAL')
    await expect(page.getByText('FIRMADO', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Enviar DIAN' })).toBeDisabled()
    await expect(page.getByTestId('dian-events-panel')).toHaveAttribute('data-operational', 'false')
    await expect(page.getByTestId('dian-events-panel')).toContainText(
      'no consulta ni registra eventos reales en DIAN',
    )
  })

  test('la factura demo usa afectación DIAN por línea e idempotencia estable al reintentar', async ({
    context,
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-08-30T03:30:00.000Z'))
    await prepareColombiaSession(context, page, {
      isDemo: true,
      fiscal: { isReady: false, missingItems: ['Modo demo'] },
    })

    const requests: Array<{ body: Record<string, unknown>; idempotencyKey?: string }> = []
    await page.route(/\/api\/cpe\/comprobantes\/?$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      requests.push({
        body: route.request().postDataJSON(),
        idempotencyKey: (await route.request().headerValue('Idempotency-Key')) ?? undefined,
      })
      if (requests.length === 1) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Fallo controlado de emisión' }),
        })
      }
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'cpe-demo-colombia' } }),
      })
    })

    await page.goto('/dashboard/cpe', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Nueva factura sin transmisión' }).click()

    await expect(page.getByLabel('Fecha de Emisión *')).toHaveValue('2026-08-29')
    await expect(page.getByLabel('Prefijo fiscal')).toHaveValue('')
    await expect(page.getByLabel('Prefijo fiscal')).toHaveAttribute(
      'placeholder',
      'Asignado por DIAN / sin prefijo',
    )
    await page.getByLabel('Buscar').click()
    await page.getByRole('button', { name: /Cliente Demo Colombia/ }).click()
    await expect(page.getByLabel('Tipo de identificación *')).toHaveValue('CC')
    await expect(page.getByLabel('NIT/CC *')).toHaveValue('1234567890')
    await expect(page.getByLabel('NIT/CC *')).toHaveAttribute('readonly', '')
    await expect(page.getByLabel('Razón Social/Nombre *')).toHaveValue('Cliente Demo Colombia')
    const gravado = page.getByTestId('cpe-item-0')
    await gravado.getByLabel('Código').fill('SERV-GRAVADO')
    await gravado.getByLabel('Descripción *').fill('Servicio gravado')
    await gravado.getByLabel('Cantidad *').fill('2')
    await gravado.getByLabel('Valor Unitario *').fill('100000')
    await expect(gravado.getByLabel('Afectación IVA DIAN *')).toHaveValue('10')

    await page.getByRole('button', { name: '+ Agregar Item' }).click()
    const exento = page.getByTestId('cpe-item-1')
    await exento.getByLabel('Código').fill('SERV-EXENTO')
    await exento.getByLabel('Descripción *').fill('Servicio exento')
    await exento.getByLabel('Cantidad *').fill('1')
    await exento.getByLabel('Valor Unitario *').fill('50000')
    await exento.getByLabel('Afectación IVA DIAN *').selectOption('20')
    await expect(exento.getByRole('spinbutton', { name: 'IVA', exact: true })).toHaveValue('0.00')

    await page.getByRole('button', { name: '+ Agregar Item' }).click()
    const excluido = page.getByTestId('cpe-item-2')
    await excluido.getByLabel('Código').fill('SERV-EXCLUIDO')
    await excluido.getByLabel('Descripción *').fill('Servicio excluido')
    await excluido.getByLabel('Cantidad *').fill('1')
    await excluido.getByLabel('Valor Unitario *').fill('25000')
    await excluido.getByLabel('Afectación IVA DIAN *').selectOption('30')
    await expect(excluido.getByRole('spinbutton', { name: 'IVA', exact: true })).toHaveValue('0.00')

    await page.getByRole('button', { name: 'Crear Comprobante' }).click()
    await expect(page.locator('form [role="alert"]')).toHaveText('Fallo controlado de emisión')

    expect(requests).toHaveLength(1)
    const first = requests[0]?.body as {
      fechaEmision: string
      subtotal: unknown
      totalIgv: unknown
      total: unknown
      cliente_id: string
      idempotency_key: string
      items: Array<Record<string, unknown>>
    }
    expect(first).toMatchObject({
      fechaEmision: '2026-08-29',
      subtotal: 275_000,
      totalIgv: 38_000,
      total: 313_000,
      cliente_id: colombiaConsumer.id,
    })
    expect(first).not.toHaveProperty('serie')
    expect(requests[0]?.idempotencyKey).toMatch(/^cpe-ui-/)
    expect(first.idempotency_key).toBe(requests[0]?.idempotencyKey)
    expect(first).not.toHaveProperty('idempotencyKey')
    expect(typeof first.items[0]?.cantidad).toBe('number')
    expect(typeof first.items[0]?.valorUnitario).toBe('number')
    expect(first.items).toEqual([
      expect.objectContaining({
        codigo: 'SERV-GRAVADO', afectacion_igv: '10', tipo_afectacion_igv: '10',
        precioUnitario: 100_000, igv: 38_000,
      }),
      expect.objectContaining({
        codigo: 'SERV-EXENTO', afectacion_igv: '20', tipo_afectacion_igv: '20',
        precioUnitario: 50_000, igv: 0,
      }),
      expect.objectContaining({
        codigo: 'SERV-EXCLUIDO', afectacion_igv: '30', tipo_afectacion_igv: '30',
        precioUnitario: 25_000, igv: 0,
      }),
    ])

    await page.getByRole('button', { name: 'Crear Comprobante' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo Comprobante Electrónico' })).toBeHidden()

    expect(requests).toHaveLength(2)
    expect(requests[1]?.idempotencyKey).toBe(requests[0]?.idempotencyKey)
    expect(requests[1]?.body.idempotency_key).toBe(requests[0]?.idempotencyKey)

    await page.clock.setFixedTime(new Date('2026-08-30T05:30:00.000Z'))
    await page.getByRole('button', { name: 'Nueva factura sin transmisión' }).click()
    await expect(page.getByLabel('Fecha de Emisión *')).toHaveValue('2026-08-30')
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
    await expect(panel).toContainText('FE011')
    await expect(panel).not.toContainText('FE01-1')

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
