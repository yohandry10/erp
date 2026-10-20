import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Facturar desde el detalle del pedido con la UI real: si la respuesta se pierde
// (el servidor sí emitió), reintentar debe mostrar la factura y no un error de
// estado. Sólo hosts locales.
test('Facturar pedido: reintentar tras perder la respuesta muestra la factura emitida', async ({ page, context, request }) => {
  test.setTimeout(300000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'fact-browser-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const q = (id: string) => { assert.match(id, /^[0-9a-f-]{36}$/i); return `'${id}'::uuid` }
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de facturación desde el pedido con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'sales-invoice-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const api = process.env.LOCAL_API_URL!
  const call = async (endpoint: string, data?: unknown, token?: string, status = data === undefined ? 200 : 201) => {
    const headers = { 'idempotency-key': randomUUID(), ...(token ? { authorization: `Bearer ${token}` } : {}) }
    const response = data === undefined
      ? await request.get(`${api}/api/${endpoint}/`, { headers })
      : await request.post(`${api}/api/${endpoint}/`, { data, headers })
    expect(response.status(), endpoint + ' ' + (await response.text()).slice(0, 200)).toBe(status)
    const body = await response.json()
    return body.data ?? body
  }
  // Aserciones blandas en la UI: la línea base registra cada defecto de la
  // pantalla aunque el primero falle; los estados de la base son estrictos.
  const step = async (operation: string, action: () => Promise<void>) => {
    const before = test.info().errors.length
    await action()
    checks.push({ operation, passed: test.info().errors.length === before })
  }
  const PASSWORD = 'Cliente-Local-2026-Only!'
  try {
    const token = (await call('auth/login', { email: fixture.email, password: PASSWORD })).access_token
    const forge = createRequire(path.resolve('../erp-api/package.json'))('node-forge')
    const pair = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate()
    cert.publicKey = pair.publicKey; cert.serialNumber = '0D'
    cert.validity.notBefore = new Date(Date.now() - 86400000); cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
    const attrs = [{ name: 'commonName', value: 'CERTIFICADO LOCAL ' + fixture.ruc }, { name: 'countryName', value: 'PE' }, { name: 'organizationName', value: 'Ensayo facturación navegador' }, { type: '2.5.4.5', value: fixture.ruc }]
    cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(pair.privateKey, forge.md.sha256.create())
    const p12 = forge.pkcs12.toPkcs12Asn1(pair.privateKey, [cert], 'Clave-Fact-ui', { algorithm: '3des' })
    const certificateBase64 = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary').toString('base64')
    await call('configuration/complete', { configuration: { ruc: fixture.ruc, pais: 'PE', pais_id: 1, razonSocial: 'Empresa facturación navegador', direccion: 'Origen facturación 123', ubigeo: '150101', tipo_empresa: 'MICRO', regimen_tributario: 'GENERAL', serie_factura: 'F001', serie_boleta: 'B001', serie_guia_remision: 'T001', certificateBase64, certificatePassword: 'Clave-Fact-ui', sunat_environment: 'homologacion' } }, token)
    // Sin sugerencia de GRE: el recorrido termina en el aviso de la factura.
    sql(`UPDATE empresa_config SET gre_automatico_habilitado=false WHERE tenant_id=${q(fixture.tenant)};`)
    const warehouse = await call('inventario/almacenes', { idempotency_key: randomUUID(), codigo: 'FACT-UI', nombre: 'Almacén facturación UI', es_principal: true }, token)
    await call('inventario/categorias', { idempotency_key: randomUUID(), codigo: 'FACT-UI', nombre: 'Mercaderías facturación UI' }, token)
    const product = await call('inventario/productos', { idempotency_key: randomUUID(), codigo: 'FACT-UI-STOCK', nombre: 'Producto facturación UI', categoria: 'Mercaderías facturación UI', unidad_medida: 'NIU', precio_compra: 10, precio_venta: 20, controla_stock: true, almacen_id: warehouse.id, stock_inicial: 20, afectacion_igv: '10' }, token)
    const base = '2098765485', weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    const digit = 11 - weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0) % 11
    const receiverRuc = base + String(digit === 10 ? 0 : digit === 11 ? 1 : digit)
    const client = await call('ventas/clientes', { tipo: 'EMPRESA', documento_tipo: 'RUC', documento_numero: receiverRuc, razon_social: 'Cliente facturación navegador' }, token)
    const order = await call('ventas/pedidos', { cliente_id: client.id, notas: 'Pedido UI para facturar', detalle: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 2, precio_unitario: 20 }] }, token)
    await call(`ventas/pedidos/${order.id}/confirmar`, {}, token)
    const estado = () => sql(`SELECT estado FROM pedidos_venta WHERE id=${q(order.id)};`)
    const cpes = () => Number(sql(`SELECT count(*) FROM cpe WHERE tenant_id=${q(fixture.tenant)};`))
    expect(['LISTO_FACTURAR', 'CONFIRMADO']).toContain(estado())

    await loginPeruLocal(page, fixture.email, PASSWORD)
    // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
    await page.goto(`/dashboard/ventas/pedidos/${order.id}/`, { timeout: 120000 })
    const generate = async () => {
      await page.getByRole('button', { name: 'Generar Factura', exact: true }).click()
      await page.getByRole('button', { name: 'Generar factura', exact: true }).click()
    }
    await expect(page.getByRole('button', { name: 'Generar Factura', exact: true })).toBeVisible({ timeout: 60000 })

    // La respuesta se pierde después de que el servidor emitió la factura.
    let served = 0
    const invoiceUrl = (url: URL) => /\/generar-factura\/?$/.test(url.pathname)
    await page.route(invoiceUrl, async route => {
      const response = await route.fetch()
      served = response.status()
      await route.abort('failed')
    })
    await generate()
    await expect.poll(() => served, { timeout: 60000 }).toBeGreaterThan(0)
    await page.unroute(invoiceUrl)
    expect([200, 201]).toContain(served)
    expect(estado()).toBe('FACTURADO')
    const emitted = cpes()
    expect(emitted).toBe(1)

    await step('Tras perder la respuesta el usuario termina viendo la factura emitida, sin otro comprobante', async () => {
      // La pantalla puede recargar el pedido sola; si aún ofrece generar, el
      // reintento debe devolver la misma factura y no un error de estado.
      const invoiceButton = page.getByRole('button', { name: 'Generar Factura', exact: true })
      await page.waitForTimeout(3000)
      if (await invoiceButton.isVisible()) {
        const [retry] = await Promise.all([
          page.waitForResponse(r => r.request().method() === 'POST' && /\/generar-factura\/?$/.test(new URL(r.url()).pathname)),
          generate(),
        ])
        expect.soft(retry.status(), 'Reintento').toBeLessThan(300)
        await expect.soft(page.getByText('Factura generada', { exact: true })).toBeVisible({ timeout: 15000 })
        await expect.soft(page.getByText('No se puede generar factura para un pedido en estado', { exact: false })).toHaveCount(0)
      }
      await expect.soft(page.getByRole('button', { name: 'Ver factura A4' })).toBeVisible({ timeout: 30000 })
      expect(cpes()).toBe(emitted)
      expect(estado()).toBe('FACTURADO')
    })
    proof.success = checks.every(check => check.passed)
  } finally {
    save()
  }
})
