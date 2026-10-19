import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Bandeja de aprobaciones con la UI real: una carga fallida no se muestra como
// bandeja vacía, el rechazo del servidor llega con su motivo y un pedido que
// otro usuario ya resolvió sale de la bandeja. Sólo hosts locales.
test('Aprobaciones: la bandeja dice por qué no se pudo decidir y no finge estar vacía', async ({ page, browser, request }) => {
  test.setTimeout(420000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'aprob-browser-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const q = (id: string) => { assert.match(id, /^[0-9a-f-]{36}$/i); return `'${id}'::uuid` }
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de la bandeja de aprobaciones con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'sales-approvals-browser.json'), JSON.stringify(proof, null, 2))
  const localOnly = async (target: Page) => target.context().route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  await localOnly(page)
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
  const PASSWORD = 'Cliente-Local-2026-Only!', APPROVER_PASSWORD = 'Aprobadora-Local-2026!'
  let approverContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
  try {
    const token = (await call('auth/login', { email: fixture.email, password: PASSWORD })).access_token
    const forge = createRequire(path.resolve('../erp-api/package.json'))('node-forge')
    const pair = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate()
    cert.publicKey = pair.publicKey; cert.serialNumber = '0B'
    cert.validity.notBefore = new Date(Date.now() - 86400000); cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
    const attrs = [{ name: 'commonName', value: 'CERTIFICADO LOCAL ' + fixture.ruc }, { name: 'countryName', value: 'PE' }, { name: 'organizationName', value: 'Ensayo aprobaciones navegador' }, { type: '2.5.4.5', value: fixture.ruc }]
    cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(pair.privateKey, forge.md.sha256.create())
    const p12 = forge.pkcs12.toPkcs12Asn1(pair.privateKey, [cert], 'Clave-Aprob-ui', { algorithm: '3des' })
    const certificateBase64 = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary').toString('base64')
    await call('configuration/complete', { configuration: { ruc: fixture.ruc, pais: 'PE', pais_id: 1, razonSocial: 'Empresa aprobaciones navegador', direccion: 'Origen aprobaciones 123', ubigeo: '150101', tipo_empresa: 'MICRO', regimen_tributario: 'GENERAL', serie_factura: 'F001', serie_boleta: 'B001', serie_guia_remision: 'T001', certificateBase64, certificatePassword: 'Clave-Aprob-ui', sunat_environment: 'homologacion' } }, token)
    const warehouse = await call('inventario/almacenes', { idempotency_key: randomUUID(), codigo: 'APROB-UI', nombre: 'Almacén aprobaciones UI', es_principal: true }, token)
    await call('inventario/categorias', { idempotency_key: randomUUID(), codigo: 'APROB-UI', nombre: 'Mercaderías aprobaciones UI' }, token)
    const product = await call('inventario/productos', { idempotency_key: randomUUID(), codigo: 'APROB-UI-STOCK', nombre: 'Producto aprobaciones UI', categoria: 'Mercaderías aprobaciones UI', unidad_medida: 'NIU', precio_compra: 10, precio_venta: 20, controla_stock: true, almacen_id: warehouse.id, stock_inicial: 20, afectacion_igv: '10' }, token)
    // RUC sintético con dígito verificador válido (mismo cálculo que los fixtures).
    const base = '2098765473', weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    const digit = 11 - weights.reduce((sum, weight, index) => sum + Number(base[index]) * weight, 0) % 11
    const receiverRuc = base + String(digit === 10 ? 0 : digit === 11 ? 1 : digit)
    const client = await call('ventas/clientes', { tipo: 'EMPRESA', documento_tipo: 'RUC', documento_numero: receiverRuc, razon_social: 'Cliente aprobaciones navegador' }, token)
    const adminRole = (await call('roles', undefined, token)).find((role: { nombre: string }) => role.nombre === 'ADMIN')
    assert.ok(adminRole, 'Rol ADMIN ausente')
    const approverEmail = `aprobadora.ui.${randomUUID().slice(0, 8)}@example.test`
    await call('users', { nombre: 'Aprobadora', apellido: 'Navegador', email: approverEmail, password: APPROVER_PASSWORD, roles: [adminRole.id], idempotency_key: randomUUID() }, token)
    const approverToken = (await call('auth/login', { email: approverEmail, password: APPROVER_PASSWORD })).access_token
    // Igual que la sonda API: PROD concede SELECT a service_role por los privilegios
    // por defecto de Supabase y la reconstrucción local no los emula.
    sql(`DO $$ BEGIN IF NOT has_table_privilege('service_role','public.pedido_aprobaciones','SELECT') THEN GRANT SELECT ON public.pedido_aprobaciones TO service_role; END IF; END $$;`)
    sql(`UPDATE empresa_config SET monto_maximo_sin_aprobacion=30 WHERE tenant_id=${q(fixture.tenant)};`)
    const estado = (id: string) => sql(`SELECT estado FROM pedidos_venta WHERE id=${q(id)};`)
    const pendingOrder = async () => {
      const order = await call('ventas/pedidos', { cliente_id: client.id, notas: 'Pedido UI sobre umbral', detalle: [{ producto_id: product.id, descripcion: product.nombre, cantidad: 2, precio_unitario: 20 }] }, token)
      expect((await call(`ventas/pedidos/${order.id}/confirmar`, {}, token)).requiere_aprobacion).toBe(true)
      expect(estado(order.id)).toBe('PENDIENTE_APROBACION')
      return order as { id: string; numero: string }
    }
    const [first, second] = [await pendingOrder(), await pendingOrder()]
    // Cuenta vencida posterior a los pedidos (con mora previa la confirmación se
    // bloquea por crédito): el fixture traslada emisión y vencimiento al pasado.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
    const cpe = await call('cpe/comprobantes', { tipo_documento: '01', serie: 'F001', cliente_id: client.id, tipo_documento_receptor: '6', documento_receptor: receiverRuc, razon_social_receptor: 'Cliente aprobaciones navegador', moneda: 'PEN', fecha_emision: today, condicion_pago: 'CREDITO', plazo_pago_dias: 30, items: [{ codigo: 'APROB-UI', descripcion: 'Servicio previo', cantidad: 1, precio_unitario: 100, valor_venta: 100, igv: 18, total: 118, unidadMedida: 'ZZ' }] }, token)
    const cxc = sql(`SELECT id FROM cuentas_por_cobrar WHERE documento_id=(SELECT documento_id FROM cpe WHERE id=${q(cpe.id)});`)
    sql(`UPDATE cuentas_por_cobrar SET fecha_emision=current_date-40, fecha_vencimiento=current_date-10 WHERE id=${q(cxc)};`)
    // Por texto y no por rol: con el diálogo modal abierto el resto de la página
    // queda aria-hidden y una búsqueda por rol daría la tarjeta por desaparecida.
    const card = (target: Page, numero: string) => target.locator('div.rounded-xl').filter({ has: target.locator('h3').getByText(numero, { exact: true }) })
    const decide = async (target: Page, numero: string, label: 'Aprobar' | 'Rechazar') => {
      await card(target, numero).getByRole('button', { name: label, exact: true }).click()
      const dialog = target.getByRole('dialog')
      const [response] = await Promise.all([
        target.waitForResponse(r => r.request().method() === 'POST' && /\/aprobaciones\/decision\/?$/.test(new URL(r.url()).pathname)),
        dialog.getByRole('button', { name: `${label} pedido`, exact: true }).click(),
      ])
      return response
    }

    // Aserciones blandas en la UI: la línea base registra cada defecto de la
    // pantalla aunque el primero falle; los estados de la base son estrictos.
    const step = async (operation: string, action: () => Promise<void>) => {
      const before = test.info().errors.length
      await action()
      checks.push({ operation, passed: test.info().errors.length === before })
    }
    await loginPeruLocal(page, fixture.email, PASSWORD)
    await step('Bandeja sin lectura muestra el error y no "sin pendientes"; Actualizar la recupera', async () => {
      assert.equal(sql("SELECT has_table_privilege('service_role','public.pedidos_venta','SELECT');"), 't')
      sql('REVOKE SELECT ON public.pedidos_venta FROM service_role;')
      try {
        // La primera visita compila la página en Next dev: plazo propio para no confundirlo con un fallo.
        await page.goto('/dashboard/ventas/aprobaciones/', { timeout: 120000 })
        await expect.soft(page.locator('#aprobaciones-load-error')).toBeVisible({ timeout: 30000 })
        await expect.soft(page.getByText('No hay pedidos pendientes de aprobación')).toHaveCount(0)
      } finally {
        sql('GRANT SELECT ON public.pedidos_venta TO service_role;')
      }
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
      await expect(card(page, first.numero)).toBeVisible({ timeout: 30000 })
      await expect.soft(page.locator('#aprobaciones-load-error')).toHaveCount(0)
    })

    await step('Autoaprobación rechazada muestra el motivo del servidor', async () => {
      await decide(page, first.numero, 'Aprobar')
      await expect.soft(page.getByText('El creador del pedido no puede aprobar su propio pedido', { exact: false })).toBeVisible({ timeout: 10000 })
      expect(estado(first.id)).toBe('PENDIENTE_APROBACION')
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
    })

    approverContext = await browser.newContext()
    const approver = await approverContext.newPage()
    approver.setDefaultTimeout(25000)
    await localOnly(approver)
    await loginPeruLocal(approver, approverEmail, APPROVER_PASSWORD)
    await approver.goto('/dashboard/ventas/aprobaciones/', { timeout: 120000 })
    await expect(card(approver, first.numero)).toBeVisible({ timeout: 60000 })
    await step('La aprobadora ve la morosidad del cliente con cuenta vencida', async () => {
      await expect.soft(card(approver, first.numero).getByText('Con morosidad')).toBeVisible({ timeout: 10000 })
    })

    await step('La aprobadora aprueba desde la bandeja y el pedido sale de ella', async () => {
      const approved = await decide(approver, first.numero, 'Aprobar')
      expect.soft(approved.status()).toBe(201)
      await expect.soft(approver.getByRole('dialog')).toHaveCount(0)
      await expect.soft(card(approver, first.numero)).toHaveCount(0)
      expect(estado(first.id)).toBe('PENDIENTE')
    })

    await step('Decidir un pedido ya resuelto muestra el motivo y la bandeja se actualiza', async () => {
      // Otro usuario resuelve el segundo pedido mientras la bandeja sigue abierta.
      await call(`ventas/pedidos/${second.id}/aprobaciones/decision`, { decision: 'RECHAZADO' }, approverToken)
      expect(estado(second.id)).toBe('CANCELADO')
      const late = await decide(approver, second.numero, 'Aprobar')
      expect.soft(late.status()).toBe(409)
      await expect.soft(approver.getByText('El pedido ya no está pendiente de aprobación', { exact: false })).toBeVisible({ timeout: 10000 })
      await expect.soft(approver.getByRole('dialog')).toHaveCount(0)
      await expect.soft(card(approver, second.numero)).toHaveCount(0, { timeout: 15000 })
      expect(estado(second.id)).toBe('CANCELADO')
    })
    proof.success = checks.every(check => check.passed)
  } finally {
    await approverContext?.close()
    save()
  }
})
