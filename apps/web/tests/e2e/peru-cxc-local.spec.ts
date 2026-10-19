import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Reprogramación de CxC desde la UI real: cada intento lleva su propia
// intención, volver a una fecha ya usada se aplica y un rechazo del servidor
// no cierra el formulario como si hubiera funcionado. Sólo hosts locales.
test('CxC: reprogramar desde la pantalla aplica cada cambio y no finge un rechazo', async ({ page, context, request }) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'cxc-browser-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de reprogramación CxC con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'cxc-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const api = process.env.LOCAL_API_URL!
  const post = async (endpoint: string, data: unknown, token?: string) => {
    const response = await request.post(`${api}/api/${endpoint}/`, { data, headers: { 'idempotency-key': randomUUID(), ...(token ? { authorization: `Bearer ${token}` } : {}) } })
    expect(response.status(), endpoint + ' ' + (await response.text()).slice(0, 200)).toBe(201)
    const body = await response.json()
    return body.data ?? body
  }
  const plusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
  try {
    const token = (await post('auth/login', { email: fixture.email, password: 'Cliente-Local-2026-Only!' })).access_token
    const forge = createRequire(path.resolve('../erp-api/package.json'))('node-forge')
    const pair = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate()
    cert.publicKey = pair.publicKey; cert.serialNumber = '08'
    cert.validity.notBefore = new Date(Date.now() - 86400000); cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
    const attrs = [{ name: 'commonName', value: 'CERTIFICADO LOCAL ' + fixture.ruc }, { name: 'countryName', value: 'PE' }, { name: 'organizationName', value: 'Ensayo CxC navegador' }, { type: '2.5.4.5', value: fixture.ruc }]
    cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(pair.privateKey, forge.md.sha256.create())
    const p12 = forge.pkcs12.toPkcs12Asn1(pair.privateKey, [cert], 'Clave-CXC-ui', { algorithm: '3des' })
    const certificateBase64 = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary').toString('base64')
    await post('configuration/complete', { configuration: { ruc: fixture.ruc, pais: 'PE', pais_id: 1, razonSocial: 'Empresa CxC navegador', direccion: 'Origen CxC 123', ubigeo: '150101', tipo_empresa: 'MICRO', regimen_tributario: 'GENERAL', serie_factura: 'F001', serie_boleta: 'B001', serie_guia_remision: 'T001', certificateBase64, certificatePassword: 'Clave-CXC-ui', sunat_environment: 'homologacion' } }, token)
    // RUC sintético con dígito verificador válido (mismo cálculo que los fixtures).
    const base = '2098765463', weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    const check = 11 - weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0) % 11
    const receiverRuc = base + String(check === 10 ? 0 : check === 11 ? 1 : check)
    const client = await post('ventas/clientes', { tipo: 'EMPRESA', documento_tipo: 'RUC', documento_numero: receiverRuc, razon_social: 'Cliente CxC navegador' }, token)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
    const cpe = await post('cpe/comprobantes', { tipo_documento: '01', serie: 'F001', cliente_id: client.id, tipo_documento_receptor: '6', documento_receptor: receiverRuc, razon_social_receptor: 'Cliente CxC navegador', moneda: 'PEN', fecha_emision: today, condicion_pago: 'CREDITO', plazo_pago_dias: 30, items: [{ codigo: 'CXC-UI', descripcion: 'Servicio CxC navegador', cantidad: 1, precio_unitario: 100, valor_venta: 100, igv: 18, total: 118, unidadMedida: 'ZZ' }] }, token)
    const cxc = sql(`SELECT id FROM cuentas_por_cobrar WHERE documento_id=(SELECT documento_id FROM cpe WHERE id='${cpe.id}'::uuid);`)
    assert.match(cxc, /^[0-9a-f-]{36}$/)
    const due = () => sql(`SELECT fecha_vencimiento::text FROM cuentas_por_cobrar WHERE id='${cxc}'::uuid;`)

    await loginPeruLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
    await page.goto('/dashboard/finanzas/cxc/', { timeout: 120000 })
    await expect(page.getByRole('row').filter({ hasText: 'Cliente CxC navegador' })).toBeVisible({ timeout: 60000 })
    const row = page.getByRole('row').filter({ hasText: 'Cliente CxC navegador' })
    const intentKeys: string[] = []
    const reprogram = async (date: string) => {
      await row.getByRole('button', { name: 'Reprogramar', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Nueva fecha de vencimiento').fill(date)
      const [response] = await Promise.all([
        page.waitForResponse(r => r.request().method() === 'POST' && /\/finanzas\/cxc\/[0-9a-f-]{36}\/reprogramar\/?$/.test(new URL(r.url()).pathname)),
        dialog.getByRole('button', { name: 'Reprogramar', exact: true }).click(),
      ])
      intentKeys.push(response.request().headers()['idempotency-key'] ?? '')
      return response
    }
    // El formulario sólo admite fechas >= vencimiento vigente; volver atrás lo cubre la sonda API.
    const [D2, D3, D4] = [plusDays(55), plusDays(70), plusDays(85)]
    for (const date of [D2, D3]) {
      const response = await reprogram(date)
      expect(response.status()).toBe(201)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(due()).toBe(date)
    }
    expect(intentKeys.every(key => key.length >= 8), 'La pantalla no envía Idempotency-Key').toBe(true)
    expect(new Set(intentKeys).size).toBe(2)
    checks.push({ operation: 'Cada reprogramación desde la pantalla lleva su propia intención y se aplica', passed: true }); save()

    await page.route(/\/finanzas\/cxc\/[0-9a-f-]{36}\/reprogramar\/?$/, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Cuentas por cobrar no disponibles' }) }))
    const rejected = await reprogram(D4)
    expect(rejected.status()).toBe(503)
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Cuentas por cobrar no disponibles').first()).toBeVisible()
    expect(due()).toBe(D3)
    checks.push({ operation: 'Un rechazo del servidor deja el formulario abierto con el motivo', passed: true })
    proof.success = true
  } finally {
    save()
  }
})
