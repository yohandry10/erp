import { test, expect, type Locator } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { loginPeruLocal } from './helpers/peru-login-local'

test('Documentos Perú: borradores, recuperación original, XML firmado y envío sin credenciales', async ({ page, context }) => {
  test.setTimeout(300000)
  page.setDefaultTimeout(30000)
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGPORT, '55456')
  assert.equal(process.env.LOCAL_API_URL, 'http://127.0.0.1:3126')
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const first = JSON.parse(fs.readFileSync(path.join(output, 'cpe-first-fixture.json'), 'utf8'))
  assert.match(first.tenant, /^[0-9a-f-]{36}$/i)
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', '55456', '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: 'BEGIN READ ONLY;' + query + ';ROLLBACK;', encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton"), 'erp_e2e|DEV|localerpephemeralqax')
  const today = sql(`SELECT app.hoy_tenant('${first.tenant}'::uuid)::text`)
  const probe = 'DOC-UI-' + randomUUID().slice(0, 8)
  const proof: any = { success: false, complete: false, scope: 'REAL_WEB_MANUAL_DOCUMENT_CREATE_EDIT_CANCEL_SIGN_AND_UNCONFIGURED_TRANSPORT_BOUNDARY', remoteWrites: false, checks: [], requests: [], unexpectedWriters: [], scriptErrors: [] }
  let state: any = {}
  const endpoint = (url: string) => new URL(url).pathname.replace(/^\/backend(?=\/api\/)/, '').replace(/\/$/, '')
  const record = (check: string, details: any = {}) => proof.checks.push({ check, passed: true, ...details })
  page.on('pageerror', error => proof.scriptErrors.push(error.message))
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), pathname = endpoint(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !['3125', '3126'].includes(url.port)) { await route.abort(); return }
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
    const allowed = ['/api/auth/login', '/api/auth/logout', '/api/documentos/validar-documento', '/api/documentos/crear'].includes(pathname) || /^\/api\/documentos\/[0-9a-f-]{36}(?:\/(?:anular|generar-xml|enviar-sunat))?$/.test(pathname)
    if (write && pathname.includes('/api/') && !allowed) { proof.unexpectedWriters.push(request.method() + ' ' + pathname); await route.abort(); return }
    if (write && pathname === state.path) {
      const body = request.postData()!, key = request.postDataJSON()?.idempotency_key
      if (state.body !== undefined) { expect(body).toBe(state.body); expect(key).toBe(state.key) } else { state.body = body; state.key = key }
      const response = await route.fetch(), receipt = await response.json()
      proof.requests.push({ method: request.method(), path: pathname, bodySha256: createHash('sha256').update(body).digest('hex'), key, serverStatus: response.status() })
      if (!response.ok()) { proof.unexpectedServerResponse = { path: pathname, status: response.status(), message: receipt.message }; await route.fulfill({ response }); return }
      if (!state.receipt) { state.receipt = receipt; await route.fulfill({ status: 503, json: { message: 'UAT: respuesta perdida después de confirmar la operación original' } }) }
      else { state.replay = receipt; await route.fulfill({ response }) }
      return
    }
    await route.continue()
  })
  const arm = (pathname: string) => { state = { path: pathname } }
  const click = async (button: Locator, pathname: string) => {
    const [response] = await Promise.all([page.waitForResponse(r => endpoint(r.url()) === pathname && ['POST', 'PUT'].includes(r.request().method())), button.click()])
    return response
  }
  const row = (name: string) => page.getByRole('row').filter({ hasText: name })
  const form = () => page.locator('form').filter({ has: page.getByRole('button', { name: /^(Crear Documento|Actualizar)$/ }) })
  const stored = (name: string) => JSON.parse(sql(`SELECT json_build_object('count',count(*),'total',sum(total),'states',json_agg(estado)) FROM documentos WHERE tenant_id='${first.tenant}' AND receptor_razon_social='${name}'`))
  const create = async (name: string) => {
    await page.getByRole('button', { name: 'Crear documento', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crear Nuevo Documento', exact: true })).toBeVisible()
    const f = form()
    await f.getByLabel('Información del documento', { exact: true }).selectOption('BOLETA')
    await f.getByLabel('Serie', { exact: true }).fill('B001')
    await f.getByLabel('Fecha de emisión *', { exact: true }).fill(today)
    await f.getByLabel('Información del cliente', { exact: true }).selectOption('DNI')
    await f.getByLabel('Número de documento *', { exact: true }).fill('12345678')
    await f.getByLabel('Razón social / nombre *', { exact: true }).fill(name)
    await f.getByLabel('Código', { exact: true }).fill('SERV-LOCAL')
    await f.getByLabel('Descripción *', { exact: true }).fill('Servicio local de aceptación documental')
    await f.getByLabel('Cantidad *', { exact: true }).fill('1')
    await f.getByLabel('Precio unit. *', { exact: true }).fill('10')
    arm('/api/documentos/crear')
    const button = f.getByRole('button', { name: 'Crear Documento', exact: true })
    expect((await click(button, state.path)).status()).toBe(503)
    expect(state.receipt).toBeTruthy()
    const id = state.receipt.data.id
    assert.match(id, /^[0-9a-f-]{36}$/i)
    expect(stored(name)).toEqual({ count: 1, total: 11.8, states: ['BORRADOR'] })
    await expect(button).toBeEnabled()
    expect(proof.requests.filter((r: any) => r.key === state.key)).toHaveLength(1)
    expect((await click(button, state.path)).status()).toBe(201)
    expect(state.replay.idempotent).toBe(true)
    expect(state.replay.data.id).toBe(id)
    await expect(page.getByRole('heading', { name: 'Crear Nuevo Documento', exact: true })).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(row(name)).toBeVisible()
    expect(stored(name)).toEqual({ count: 1, total: 11.8, states: ['BORRADOR'] })
    record('create_ack_loss_original_manual_retry_then_reload', { documentId: id, total: 11.8, duplicates: 0 })
    return id
  }
  try {
    await loginPeruLocal(page, first.email, 'Cliente-Local-2026-Only!')
    await page.goto('/dashboard/documentos/', { waitUntil: 'domcontentloaded' })
    const id = await create(probe)
    await row(probe).getByRole('button', { name: 'Editar', exact: true }).click()
    const f = form(), price = f.getByLabel('Precio unit. *', { exact: true })
    await expect(price).toHaveValue('10'); await price.fill('20')
    arm('/api/documentos/' + id)
    const update = f.getByRole('button', { name: 'Actualizar', exact: true })
    expect((await click(update, state.path)).status()).toBe(503)
    expect(stored(probe)).toEqual({ count: 1, total: 23.6, states: ['BORRADOR'] })
    await expect(update).toBeEnabled()
    expect((await click(update, state.path)).status()).toBe(200)
    expect(state.replay.idempotent).toBe(true); expect(state.replay.data.id).toBe(id)
    await expect(page.getByRole('heading', { name: 'Editar Documento', exact: true })).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(row(probe)).toContainText('23.60')
    record('update_ack_loss_original_manual_retry_then_reload', { documentId: id, total: 23.6 })
    await row(probe).getByRole('button', { name: 'Anular', exact: true }).click()
    await page.getByLabel('Motivo de anulación', { exact: true }).fill('Borrador local cerrado por UAT')
    arm('/api/documentos/' + id + '/anular')
    const cancel = page.getByRole('button', { name: 'Confirmar anulación', exact: true })
    expect((await click(cancel, state.path)).status()).toBe(503)
    expect(stored(probe)).toEqual({ count: 1, total: 23.6, states: ['ANULADO'] })
    await expect(cancel).toBeEnabled()
    expect([200, 201]).toContain((await click(cancel, state.path)).status())
    expect(state.replay.idempotent).toBe(true)
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(row(probe)).toContainText('Anulado')
    await expect(row(probe).getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)
    expect(sql(`SELECT count(*) FROM cpe WHERE tenant_id='${first.tenant}' AND documento_id='${id}'`)).toBe('0')
    record('cancel_draft_ack_loss_original_retry_no_fiscal_effect', { documentId: id })
    const name = probe + '-SIGN', signId = await create(name)
    arm('/api/documentos/' + signId + '/generar-xml')
    const sign = row(name).getByRole('button', { name: 'XML', exact: true })
    expect((await click(sign, state.path)).status()).toBe(503)
    expect(state.receipt).toBeTruthy(); await expect(sign).toBeEnabled()
    expect([200, 201]).toContain((await click(sign, state.path)).status())
    const receipt = state.replay
    expect(receipt.idempotent).toBe(true); expect(receipt.data.documento_id).toBe(signId)
    expect(receipt.data.xml_content).toMatch(/<(?:[A-Za-z0-9_]+:)?Signature(?:\s|>)/)
    const cpeId = receipt.data.cpe_id
    assert.match(cpeId, /^[0-9a-f-]{36}$/i)
    expect(sql(`SELECT count(*) FROM cpe WHERE tenant_id='${first.tenant}' AND documento_id='${signId}'`)).toBe('1')
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(row(name)).toContainText('Emitido')
    record('signed_xml_ack_loss_original_retry_one_linked_cpe', { documentId: signId, cpeId })
    state = {}
    const before = sql(`SELECT md5(jsonb_build_object('cpe',jsonb_build_object('id',c.id,'documento_id',c.documento_id,'total',c.total_venta,'xml',c.xml_firmado),'cxcs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM cuentas_por_cobrar x WHERE tenant_id='${first.tenant}'),'entries',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM asientos_contables a WHERE tenant_id='${first.tenant}'),'outbox',(SELECT count(*) FROM outbox_events WHERE tenant_id='${first.tenant}'))::text) FROM cpe c WHERE id='${cpeId}'`)
    const response = await click(row(name).getByRole('button', { name: 'Enviar', exact: true }), '/api/documentos/' + signId + '/enviar-sunat')
    expect(response.status()).toBe(503)
    expect(JSON.stringify(await response.json()).toLowerCase()).toMatch(/credencial|configur|sol|conexi/)
    expect(sql(`SELECT md5(jsonb_build_object('cpe',jsonb_build_object('id',c.id,'documento_id',c.documento_id,'total',c.total_venta,'xml',c.xml_firmado),'cxcs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM cuentas_por_cobrar x WHERE tenant_id='${first.tenant}'),'entries',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM asientos_contables a WHERE tenant_id='${first.tenant}'),'outbox',(SELECT count(*) FROM outbox_events WHERE tenant_id='${first.tenant}'))::text) FROM cpe c WHERE id='${cpeId}'`)).toBe(before)
    expect(sql(`SELECT count(*) FROM cpe WHERE id='${cpeId}' AND nullif(cdr_sunat,'') IS NOT NULL`)).toBe('0')
    record('unconfigured_send_rejected_without_external_acceptance', { status: response.status() })
    expect(proof.unexpectedWriters).toEqual([]); expect(proof.scriptErrors).toEqual([])
    proof.success = proof.complete = true
  } finally {
    fs.writeFileSync(path.join(output, 'document-manual-current-real-ui.json'), JSON.stringify(proof, null, 2))
  }
})
