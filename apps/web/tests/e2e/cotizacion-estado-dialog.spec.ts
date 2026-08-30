import { expect, test } from '@playwright/test'
import { SignJWT } from 'jose'

const onePageA4Pdf = () => {
  const stream = 'BT /F1 12 Tf 72 760 Td (Factura demo visible) Tj ET\n'
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body))
    body += object
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body)
}

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

test('el cliente encuentra y abre la representación A4 de una factura demo', async ({ context, page }) => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de CPE A4')

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

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({ data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', monedaDefecto: 'PEN', locale: 'es-PE' } })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: true, is_expired: false, dias_restantes: 14 })
    }
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({ data: [{ id: 'cpe-pdf', modulo: 'cpe', recurso: 'comprobantes', accion: 'descargar_pdf' }] })
    }
    if (/\/api\/cpe\/stats\/?$/.test(pathname)) {
      return json({ success: true, data: { cpeEmitidosHoy: 1, cpeDelMes: 1, montoFacturado: 118, rechazados: 0 } })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-a4-demo\/pdf\/?$/.test(pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: onePageA4Pdf(),
      })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-n[cd]-demo\/pdf\/?$/.test(pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: onePageA4Pdf(),
      })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-a4-demo\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          id: 'cpe-a4-demo',
          tipo_documento: '01',
          serie: 'F001',
          numero: 42,
          fecha_emision: '2026-08-25',
          pais_codigo: 'PE',
          moneda: 'PEN',
          estado: 'BORRADOR',
          simulated_origin: true,
          razon_social_receptor: 'Cliente Vista Previa S.A.C.',
          documento_receptor: '20600000013',
          direccion_receptor: 'Av. Demo 123, Lima',
          total_gravadas: 100,
          total_igv: 18,
          total_venta: 118,
          sunat_qr_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          valor_resumen: 'VALOR-RESUMEN-DEMO',
          emisor: {
            ruc: '20600000021',
            razon_social: 'Comercial Andina Demo S.A.C.',
            direccion_fiscal: 'Av. Emisor 456, Lima',
            telefono: '01 555 0101',
            email: 'ventas@demo.invalid',
            logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
          items: Array.from({ length: 8 }, (_, index) => ({
            cantidad: index === 0 ? 2 : 1,
            unidad_medida: 'NIU',
            descripcion: index === 0 ? 'Audífonos Bluetooth' : `Producto adicional ${index}`,
            precio_unitario: index === 0 ? 50 : 1,
            total_item: index === 0 ? 118 : 1,
          })),
        },
      })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-nc-demo\/?$/.test(pathname)) {
      return json({ success: true, data: {
        id: 'cpe-nc-demo', tipo_documento: '07', serie: 'FC01', numero: 7,
        fecha_emision: '2026-08-29', pais_codigo: 'PE', moneda: 'PEN', estado: 'FIRMADO',
        simulated_origin: true,
        razon_social_receptor: 'Cliente Nota S.A.C.', documento_receptor: '20600000013',
        total_gravadas: 50, total_igv: 9, total_venta: 59,
        documento_referencia_tipo: '01', documento_referencia_serie: 'F001',
        documento_referencia_numero: '15', tipo_nota_credito: '10',
        motivo_nota: 'Devolución parcial acordada con el cliente',
        fiscal_qr_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        emisor: { ruc: '20600000021', razon_social: 'Comercial Andina Demo S.A.C.', direccion_fiscal: 'Lima' },
        items: [{ cantidad: 1, unidad_medida: 'NIU', descripcion: 'Producto devuelto', total_item: 59 }],
      } })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-nd-demo\/?$/.test(pathname)) {
      return json({ success: true, data: {
        id: 'cpe-nd-demo', tipo_documento: '08', serie: 'FD01', numero: 8,
        fecha_emision: '2026-08-29', pais_codigo: 'PE', moneda: 'PEN', estado: 'FIRMADO',
        simulated_origin: true,
        razon_social_receptor: 'Cliente Nota S.A.C.', documento_receptor: '20600000013',
        total_gravadas: 10, total_igv: 1.8, total_venta: 11.8,
        documento_referencia_tipo: '03', documento_referencia_serie: 'B001',
        documento_referencia_numero: '9', tipo_nota_debito: '01', motivo_nota: 'Intereses por mora',
        fiscal_qr_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        emisor: { ruc: '20600000021', razon_social: 'Comercial Andina Demo S.A.C.', direccion_fiscal: 'Lima' },
        items: [{ cantidad: 1, unidad_medida: 'ZZ', descripcion: 'Intereses', total_item: 11.8 }],
      } })
    }
    if (/\/api\/cpe\/comprobantes\/?$/.test(pathname)) {
      return json({
        success: true,
        data: [{
          id: 'cpe-a4-demo',
          tipoDocumento: '01',
          tipoComprobante: 'Factura',
          serie: 'F001',
          numero: 42,
          fechaEmision: '25/08/2026',
          cliente: 'Cliente Vista Previa S.A.C.',
          clienteRuc: '20600000013',
          total: 118,
          moneda: 'PEN',
          estado: 'FIRMADO',
          fechaCreacion: '2026-08-25T12:00:00Z',
        }, {
          id: 'cpe-nc-demo', tipoDocumento: '07', tipoComprobante: 'Nota de crédito', serie: 'FC01', numero: 7,
          fechaEmision: '29/08/2026', cliente: 'Cliente Nota S.A.C.', clienteRuc: '20600000013',
          total: 59, moneda: 'PEN', estado: 'FIRMADO', fechaCreacion: '2026-08-29T12:00:00Z',
        }, {
          id: 'cpe-nd-demo', tipoDocumento: '08', tipoComprobante: 'Nota de débito', serie: 'FD01', numero: 8,
          fechaEmision: '29/08/2026', cliente: 'Cliente Nota S.A.C.', clienteRuc: '20600000013',
          total: 11.8, moneda: 'PEN', estado: 'FIRMADO', fechaCreacion: '2026-08-29T13:00:00Z',
        }],
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

  await page.goto('/dashboard/cpe/?cpe_id=cpe-a4-demo', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(/Usa “Vista A4” para ver un resumen/i)).toBeVisible({ timeout: 30_000 })

  const dialog = page.getByRole('dialog', { name: /Factura F001-00000042/i })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('210 × 297 mm', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/Muestra demo · sin validez SUNAT/i)).toBeVisible()
  await expect(dialog.getByTestId('cpe-a4-sheet')).toBeVisible()
  await expect(dialog.getByTestId('cpe-a4-html-preview')).toBeVisible()
  await expect(dialog.getByText('Comercial Andina Demo S.A.C.', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Cliente Vista Previa S.A.C.', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Audífonos Bluetooth', { exact: true })).toBeVisible()
  await expect(dialog.getByText('NIU', { exact: true }).first()).toBeVisible()
  await expect(dialog.getByTestId('cpe-a4-logo')).toBeVisible()
  await expect(dialog.getByTestId('cpe-a4-qr')).toHaveCount(0)
  await expect(dialog.getByText('Código QR SUNAT', { exact: true })).toHaveCount(0)
  await expect(dialog.getByTestId('cpe-a4-additional-items')).toContainText('+ 2 líneas adicionales')
  await expect(dialog.getByTestId('cpe-a4-preview-authority-note')).toContainText('PDF descargable es la representación completa y autoritativa')
  await expect(dialog.getByText('Representación impresa de la Factura Electrónica.', { exact: false })).toBeVisible()
  await expect(dialog.getByText(/imprime en A4 con escala 100%/i)).toBeVisible()
  await expect(dialog.getByText('S/ 118.00', { exact: true }).last()).toBeVisible()
  await expect(dialog.locator('iframe')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Descargar A4' })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: 'Abrir PDF / imprimir' })).toBeEnabled()

  await page.goto('/dashboard/cpe/?cpe_id=cpe-nc-demo', { waitUntil: 'domcontentloaded' })
  const creditDialog = page.getByRole('dialog', { name: /Nota de crédito FC01-00000007/i })
  const creditReference = creditDialog.getByTestId('cpe-a4-note-reference')
  await expect(creditReference).toContainText('Factura electrónica F001-00000015')
  await expect(creditReference).toContainText(/Código de motivo:\s*10/)
  await expect(creditReference).toContainText('Devolución parcial acordada con el cliente')

  await page.goto('/dashboard/cpe/?cpe_id=cpe-nd-demo', { waitUntil: 'domcontentloaded' })
  const debitDialog = page.getByRole('dialog', { name: /Nota de débito FD01-00000008/i })
  const debitReference = debitDialog.getByTestId('cpe-a4-note-reference')
  await expect(debitReference).toContainText('Boleta de venta electrónica B001-00000009')
  await expect(debitReference).toContainText(/Código de motivo:\s*01/)
  await expect(debitReference).toContainText('Intereses por mora')
  expect(browserErrors).toEqual([])
})

test('la representación A4 localiza etiquetas fiscales para Colombia y Argentina', async ({ context, page }) => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de CPE CO')

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

  let activeCountry: 'CO' | 'AR' = 'CO'
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user)
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({ data: activeCountry === 'CO'
        ? { pais_id: 3, pais: 'CO', paisCodigo: 'CO', monedaDefecto: 'COP', locale: 'es-CO' }
        : { pais_id: 2, pais: 'AR', paisCodigo: 'AR', monedaDefecto: 'ARS', locale: 'es-AR' } })
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: true, is_expired: false, dias_restantes: 14 })
    }
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({ data: [{ id: 'cpe-pdf-co', modulo: 'cpe', recurso: 'comprobantes', accion: 'descargar_pdf' }] })
    }
    if (/\/api\/cpe\/stats\/?$/.test(pathname)) {
      return json({ success: true, data: { cpeEmitidosHoy: 1, cpeDelMes: 1, montoFacturado: 119000, rechazados: 0 } })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-co-demo\/pdf\/?$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: onePageA4Pdf() })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-ar-demo\/pdf\/?$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: onePageA4Pdf() })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-co-demo\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          id: 'cpe-co-demo', tipo_documento: '01', serie: 'FV01', numero: 9,
          fecha_emision: '2026-08-29', pais_codigo: 'CO', moneda: 'COP', estado: 'BORRADOR',
          simulated_origin: true,
          razon_social_receptor: 'Cliente Colombiano S.A.S.', documento_receptor: '9011234567',
          direccion_receptor: 'Bogotá D.C.', total_gravadas: 100000, total_igv: 19000,
          tasa_igv: 19, total_venta: 119000,
          fiscal_qr_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          fiscal_print_info: {
            authorizationNumber: '18764001234567', authorizationPrefix: 'FV01',
            rangeFrom: 1, rangeTo: 5000, validFrom: '2026-01-01', validTo: '2027-01-01',
            consecutive: 'FV01-9', generatedAt: '2026-08-29T10:15:00-05:00',
            paymentForm: 'Contado', paymentTerm: 'Inmediato', paymentMethod: 'Transferencia',
            taxQualities: ['Responsable de IVA'], softwareId: 'SOFTWARE-DIAN-DEMO',
          },
          emisor: {
            ruc: '9001234567', razon_social: 'Emisor Colombia S.A.S.',
            direccion_fiscal: 'Bogotá D.C.',
          },
          items: [{ cantidad: 1, unidad_medida: 'NIU', descripcion: 'Servicio Colombia', total_item: 119000 }],
        },
      })
    }
    if (/\/api\/cpe\/comprobantes\/cpe-ar-demo\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          id: 'cpe-ar-demo', tipo_documento: '003', tipo_documento_fiscal: '003', serie: '00012', numero: 10,
          fecha_emision: '2026-08-29', pais_codigo: 'AR', moneda: 'ARS', estado: 'BORRADOR',
          simulated_origin: true,
          razon_social_receptor: 'Cliente Argentino S.A.', documento_receptor: '30712345678',
          direccion_receptor: 'Buenos Aires', total_gravadas: 100000, total_igv: 21000,
          tasa_igv: 21, total_venta: 121000,
          fiscal_qr_data_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          fiscal_print_info: {
            authorizationCode: '70417054367476', authorizationLabel: 'CAE',
            authorizationExpiry: '20260910', pointOfSale: 12, documentNumber: 10,
            specialLegend: null,
          },
          emisor: { ruc: '30700000001', razon_social: 'Emisor Argentina S.A.', direccion_fiscal: 'Buenos Aires' },
          items: [{ cantidad: 1, unidad_medida: 'UN', descripcion: 'Servicio Argentina', total_item: 121000 }],
        },
      })
    }
    if (/\/api\/cpe\/comprobantes\/?$/.test(pathname)) {
      return json({ success: true, data: activeCountry === 'CO' ? [{
        id: 'cpe-co-demo', tipoDocumento: '01', tipoComprobante: 'Factura', serie: 'FV01', numero: 9,
        fechaEmision: '29/08/2026', cliente: 'Cliente Colombiano S.A.S.', clienteRuc: '9011234567',
        total: 119000, moneda: 'COP', estado: 'FIRMADO',
      }] : [{
        id: 'cpe-ar-demo', tipoDocumento: '003', tipoComprobante: 'Nota de crédito', serie: '00012', numero: 10,
        fechaEmision: '29/08/2026', cliente: 'Cliente Argentino S.A.', clienteRuc: '30712345678',
        total: 121000, moneda: 'ARS', estado: 'FIRMADO',
      }] })
    }
    return json({ success: true, data: [] })
  })

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser })
    window.localStorage.setItem('erp.auth.session.snapshot', session)
    window.sessionStorage.setItem('erp.auth.session.snapshot', session)
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']))
    window.localStorage.setItem('selectedCountry', '3')
  }, user)

  await page.goto('/dashboard/cpe/?cpe_id=cpe-co-demo', { waitUntil: 'domcontentloaded' })
  const dialog = page.getByRole('dialog', { name: /Factura FV01-00000009/i })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByText(/Muestra demo · sin validez DIAN/i)).toBeVisible()
  await expect(dialog.getByText('NIT: 9001234567', { exact: true })).toBeVisible()
  await expect(dialog.getByText('IVA (19%):', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Código QR DIAN', { exact: true })).toHaveCount(0)
  await expect(dialog.getByTestId('cpe-dian-fiscal-info')).toContainText('18764001234567')
  await expect(dialog.getByTestId('cpe-dian-fiscal-info')).toContainText('FV01 1 a 5000')
  await expect(dialog.getByTestId('cpe-dian-fiscal-info')).toContainText('Transferencia')
  await expect(dialog.getByText(/Representación gráfica de la Factura Electrónica de Venta/i)).toBeVisible()
  await expect(dialog.getByText(/SUNAT/i)).toHaveCount(0)

  activeCountry = 'AR'
  await page.goto('/dashboard/cpe/?cpe_id=cpe-ar-demo', { waitUntil: 'domcontentloaded' })
  const arDialog = page.getByRole('dialog', { name: /Nota de crédito 00012-00000010/i })
  await expect(arDialog).toBeVisible({ timeout: 30_000 })
  await expect(arDialog.getByText(/Muestra demo · sin validez ARCA/i)).toBeVisible()
  await expect(arDialog.getByText('CUIT: 30700000001', { exact: true })).toBeVisible()
  await expect(arDialog.getByText('IVA (21%):', { exact: true })).toBeVisible()
  await expect(arDialog.getByTestId('cpe-arca-authorization')).toContainText('70417054367476')
  await expect(arDialog.getByTestId('cpe-arca-authorization')).toContainText('00012')
  await expect(arDialog.getByText('Código QR ARCA', { exact: true })).toHaveCount(0)
  await expect(arDialog.getByText(/Representación gráfica de la Nota de Crédito Electrónica/i)).toBeVisible()
  await expect(arDialog.getByText(/SUNAT|DIAN/i)).toHaveCount(0)
})

test('ADMIN autoaprueba su cotización en un solo flujo y conserva la observación', async ({ context, page }) => {
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

  await expect(page.getByText('APROBADA', { exact: true })).toBeVisible()
  expect(mutations).toHaveLength(1)
  expect(mutations[0].path).toMatch(/\/api\/ventas\/cotizaciones\/cotizacion-dialog\/aprobar\/?$/)
  expect(mutations[0].body).toEqual({ motivo: 'Aprobada en revisión QA' })
  expect(httpErrors).toEqual([])
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

  await expect(page.getByRole('heading', { name: 'PV-QA-DIALOG' })).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'No hay pedidos pendientes de aprobación' }),
  ).toBeVisible()
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
