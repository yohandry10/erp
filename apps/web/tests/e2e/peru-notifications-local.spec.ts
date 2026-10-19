import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Campana de notificaciones con la UI real: un vendedor sin permisos
// administrativos ve, abre y marca sus avisos; un fallo del servidor no se
// presenta como éxito. Sólo hosts locales.
test('Notificaciones: la campana del vendedor lista, marca todas y no finge un borrado fallido', async ({ page, context, request }) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'notif-browser-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de notificaciones con API/PostgreSQL locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'notifications-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const api = process.env.LOCAL_API_URL!
  const post = async (endpoint: string, data: unknown, token?: string) => {
    const response = await request.post(`${api}/api/${endpoint}/`, { data, headers: { 'idempotency-key': randomUUID(), ...(token ? { authorization: `Bearer ${token}` } : {}) } })
    expect(response.status(), endpoint).toBe(201)
    return response.json()
  }
  try {
    const admin = (await post('auth/login', { email: fixture.email, password: 'Cliente-Local-2026-Only!' })).access_token
    const sellerRole = sql(`SELECT id FROM roles WHERE tenant_id='${fixture.tenant}'::uuid AND upper(nombre)='VENDEDOR' AND activo ORDER BY created_at LIMIT 1;`)
    const sellerEmail = `vendedor.campana.${randomUUID().slice(0, 8)}@local.test`
    const seller = (await post('usuarios-sistema/crear', { idempotency_key: randomUUID(), nombre: 'Vendedora', apellido: 'Campana', email: sellerEmail, password: 'Vendedora-Local-2026', rol_id: sellerRole, estado: 'ACTIVO' }, admin)).data
    const sellerId = seller.usuario_id ?? seller.id ?? seller.usuario?.id
    for (const body of [
      { title: 'Aviso global de la empresa', type: 'integration_error', severity: 'error', message: 'Falla de integración local' },
      { title: 'Aviso para vendedores', type: 'pedido_confirmado', severity: 'info', message: 'Pedido local confirmado', roles_destinatarios: [sellerRole] },
      { title: 'Aviso personal de la vendedora', type: 'stock_bajo', severity: 'warning', message: 'Stock bajo local', usuario_id: sellerId },
    ]) await post('notifications', body, admin)

    await loginPeruLocal(page, sellerEmail, 'Vendedora-Local-2026')
    const bell = page.getByRole('button', { name: 'Abrir notificaciones' })
    await expect(bell).toContainText('3')
    await bell.click()
    for (const title of ['Aviso global de la empresa', 'Aviso para vendedores', 'Aviso personal de la vendedora']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }
    checks.push({ operation: 'La vendedora abre su campana y ve global, rol y personal', passed: true }); save()

    const [allRead] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/notifications/mark-all-read')),
      page.getByRole('button', { name: 'Marcar todas', exact: true }).click(),
    ])
    expect(allRead.status()).toBe(200)
    // Sin notifications.update sólo se marca lo personal: lo compartido sigue pendiente.
    await expect(bell).toContainText('2')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Abrir notificaciones' })).toContainText('2')
    expect(sql(`SELECT count(*) FROM notificaciones WHERE tenant_id='${fixture.tenant}'::uuid AND usuario_id IS NULL AND leida;`)).toBe('0')
    let sharedMarks = 0
    page.on('request', r => { if (r.method() === 'PUT' && /\/api\/notifications\/[0-9a-f-]{36}\/read\/?$/.test(new URL(r.url()).pathname)) sharedMarks++ })
    await page.getByRole('button', { name: 'Abrir notificaciones' }).click()
    await page.getByRole('heading', { name: 'Aviso global de la empresa' }).click()
    await expect(page.getByText('No se pudo marcar la notificación como leída. Inténtalo de nuevo.')).toHaveCount(0)
    expect(sharedMarks).toBe(0)
    checks.push({ operation: 'Marcar todas persiste lo personal y no marca lo compartido sin permiso', passed: true }); save()

    await page.context().clearCookies()
    await loginPeruLocal(page, fixture.email, 'Cliente-Local-2026-Only!')
    await post('notifications', { title: 'Aviso del administrador', type: 'stock_bajo', severity: 'warning', message: 'Para la prueba de borrado' }, admin)
    await page.reload()
    await page.getByRole('button', { name: 'Abrir notificaciones' }).click()
    const item = page.getByRole('heading', { name: 'Aviso del administrador' })
    await expect(item).toBeVisible()
    await page.route(/\/api\/notifications\/[0-9a-f-]{36}\/?$/, route => route.request().method() === 'DELETE'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, message: 'Notificaciones no disponibles' }) })
      : route.continue())
    await page.getByRole('button', { name: 'Eliminar notificación', exact: true }).first().click()
    await expect(page.getByText('No se pudo eliminar la notificación. Inténtalo de nuevo.')).toBeVisible()
    await expect(item).toBeVisible()
    checks.push({ operation: 'Un borrado rechazado por el servidor no desaparece de la lista', passed: true })
    proof.success = true
  } finally {
    save()
  }
})
