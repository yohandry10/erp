import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { SignJWT } from 'jose'
import fs from 'node:fs'
import path from 'node:path'

const baseURL = process.env.BASE_URL || 'http://localhost:3001'

const user = {
  id: 'pos-ar-fiscal-user',
  email: 'pos-ar-fiscal@erp.local',
  nombre: 'QA',
  apellido: 'POS Argentina',
  roles: ['ADMIN'],
  tenant_id: 'pos-ar-fiscal-tenant',
  is_super_admin: false,
}

const product = {
  id: 'pos-ar-product',
  codigo: 'AR-POS-001',
  codigo_barras: '779000000001',
  nombre: 'Producto gravado Argentina',
  categoria: 'General',
  precio_venta: 100,
  stock_actual: 5,
  stock_disponible: 5,
  stock_minimo: 0,
  impuesto: 21,
  afectacion_igv: '10',
  es_servicio: false,
}

const paymentMethod = {
  id: 'pos-ar-card',
  codigo: 'tarjeta',
  nombre: 'Tarjeta',
  tipo: 'TARJETA',
  requiere_referencia: false,
  comision_porcentaje: 0,
}

const scenarios = [
  {
    documentType: 'CUIL',
    documentNumber: '27123456780',
    expectedFiscalType: '86',
    ivaCondition: 'CONSUMIDOR_FINAL',
  },
  {
    documentType: 'CDI',
    documentNumber: '30712345671',
    expectedFiscalType: '87',
    ivaCondition: 'CLIENTE_EXTERIOR',
  },
] as const

function readJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET

  for (const envPath of [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../erp-api/.env'),
  ]) {
    if (!fs.existsSync(envPath)) continue
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((entry) => /^\s*JWT_SECRET=/.test(entry))
    if (!line) continue
    return line
      .replace(/^\s*JWT_SECRET=/, '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
  }

  throw new Error('JWT_SECRET no está disponible para el E2E aislado del POS argentino')
}

async function authenticate(context: BrowserContext, page: Page) {
  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(readJwtSecret()))

  await context.addCookies([
    {
      name: 'access_token',
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('user', JSON.stringify(sessionUser))
    window.localStorage.setItem('selectedCountry', '5')
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']))
  }, user)
}

test.describe('POS Argentina conserva identidad fiscal de cliente en UI → HTTP', () => {
  for (const scenario of scenarios) {
    test(`${scenario.documentType} se envía como ${scenario.expectedFiscalType} con condición IVA`, async ({
      context,
      page,
    }) => {
      await authenticate(context, page)

      const client = {
        id: `pos-ar-client-${scenario.documentType.toLowerCase()}`,
        tipo_documento: scenario.documentType,
        documento_tipo: scenario.documentType,
        numero_documento: scenario.documentNumber,
        documento_numero: scenario.documentNumber,
        razon_social: `Cliente ${scenario.documentType} Argentina`,
        direccion: 'Av. Corrientes 1234, CABA',
        arca_condicion_iva: scenario.ivaCondition,
      }

      await page.route('**/api/**', async (route) => {
        const request = route.request()
        const pathname = new URL(request.url()).pathname
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
              pais_id: 5,
              pais: 'AR',
              paisCodigo: 'AR',
              monedaDefecto: 'ARS',
              igvPorcentaje: 21,
            },
          })
        }
        if (/\/api\/demo\/status\/?$/.test(pathname)) {
          return json({ is_demo: true, is_expired: false, dias_restantes: 10 })
        }
        if (/\/api\/pos\/productos\/?$/.test(pathname)) {
          return json({ success: true, data: [product] })
        }
        if (/\/api\/pos\/clientes\/?$/.test(pathname)) {
          return json({ success: true, data: [client] })
        }
        if (/\/api\/pos\/metodos-pago\/?$/.test(pathname)) {
          return json({ success: true, data: [paymentMethod] })
        }
        if (/\/api\/pos\/configuration-status\/?$/.test(pathname)) {
          return json({ success: true, data: { isDemo: true, isComplete: true } })
        }
        if (/\/api\/configuration\/gre-thresholds\/?$/.test(pathname)) {
          return json({
            success: true,
            data: { umbralGREAutomatico: 0, greAutomaticoHabilitado: false },
          })
        }
        if (/\/api\/pos\/empresa-config\/?$/.test(pathname)) {
          return json({
            success: true,
            data: {
              razon_social: 'Empresa Demo Argentina S.A.',
              ruc: '30700000008',
              pais: 'AR',
              moneda_defecto: 'ARS',
            },
          })
        }
        if (/\/api\/pos\/ventas-recientes\/?$/.test(pathname)) {
          return json({ success: true, data: [] })
        }
        if (/\/api\/cajas\/?$/.test(pathname)) {
          return json({ success: true, data: [{ id: 'pos-ar-cashbox', nombre: 'Caja Argentina' }] })
        }
        if (/\/api\/pos\/sesion-caja\/?$/.test(pathname)) {
          return json({
            success: true,
            data: {
              id: 'pos-ar-session',
              caja_id: 'pos-ar-cashbox',
              estado: 'ABIERTA',
              monto_inicio: 1000,
              hora_cierre: null,
              fecha_cierre: null,
            },
          })
        }
        if (
          request.method() === 'POST'
          && /\/api\/pos\/venta\/?$/.test(pathname)
        ) {
          return json({
            success: true,
            data: {
              venta_id: `sale-${scenario.documentType.toLowerCase()}`,
              numero_ticket: '00012-00000001',
              subtotal: 100,
              impuestos: 21,
              total: 121,
              estado: 'PAGADA',
              factura_electronica: true,
            },
          })
        }

        return json({ success: true, data: [] })
      })

      await page.goto('/dashboard/pos/', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Verificando autenticación...')).toBeHidden({ timeout: 30_000 })
      await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible({
        timeout: 30_000,
      })

      await page.getByLabel('Cliente de la venta').selectOption(client.id)
      await page.getByRole('button', { name: `Agregar ${product.nombre}` }).click()
      await page.getByRole('button', { name: 'Cobrar' }).click()

      const checkout = page.getByRole('dialog', { name: /Cobrar \$/ })
      await expect(checkout).toBeVisible()
      await checkout.getByRole('button', { name: paymentMethod.nombre }).click()

      const saleRequestPromise = page.waitForRequest((request) => {
        const pathname = new URL(request.url()).pathname
        return request.method() === 'POST' && /\/api\/pos\/venta\/?$/.test(pathname)
      })
      await checkout.getByRole('button', { name: 'Confirmar cobro' }).click()

      const saleRequest = await saleRequestPromise
      const payload = saleRequest.postDataJSON()

      expect(payload).toMatchObject({
        cliente_id: client.id,
        cliente_documento: scenario.documentNumber,
        cliente_tipo_documento: scenario.expectedFiscalType,
        cliente_condicion_iva: scenario.ivaCondition,
        emitir_cpe: true,
        comprobante: { tipo: '03' },
      })
      expect(saleRequest.headers()['x-country-id']).toBe('5')
    })
  }
})
