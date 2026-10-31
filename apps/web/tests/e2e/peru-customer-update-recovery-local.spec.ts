import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

test('cliente conserva una sola edición con respuesta perdida, recarga y sincronización', async ({ page }) => {
  test.setTimeout(180_000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1' || process.env.PGPORT !== '55456'
    || process.env.LOCAL_API_URL !== 'http://127.0.0.1:3126') {
    throw new Error('Este caso exige el stack efímero propio; nunca usa UAT protegida ni PROD')
  }
  const root = path.resolve(process.cwd(), '../..')
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  if (!output || !path.resolve(output).startsWith(path.join(root, 'artifacts') + path.sep)) throw new Error('Directorio de prueba inválido')
  const sources = ['apps/web/lib/offline-store.ts', 'apps/web/app/dashboard/ventas/clientes/[id]/editar/ClientPage.tsx',
    'apps/erp-api/src/modules/ventas/clientes/clientes.service.ts', 'apps/erp-api/src/modules/ventas/clientes/clientes.controller.ts',
    'supabase/migrations/584__customer_update_durable_intents.sql', 'apps/web/tests/e2e/peru-customer-update-recovery-local.spec.ts']
  const sourceHashes = Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]))
  const steps: { name: string; result: string }[] = []
  const pageErrors: string[] = []
  const diagnostics: Record<string, unknown> = {}
  page.on('pageerror', error => pageErrors.push(error.message))
  const sql = (query: string) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: '' }
    for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete env[key]
    const raw = execFileSync(process.env.PSQL_BIN || 'psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', '55456',
      '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1', '-c', query], { env, encoding: 'utf8', windowsHide: true })
    return JSON.parse(raw.trim().split(/\r?\n/).find(line => line.startsWith('{'))!)
  }
  let complete = false
  try {
    const identity = randomUUID()
    const email = `customer-recovery-${identity}@example.test`
    const fixture = sql(`BEGIN;
      DO $fixture$ DECLARE d jsonb; BEGIN
        IF current_database()<>'erp_e2e' OR NOT EXISTS (SELECT 1 FROM app.deployment_environment
          WHERE singleton AND environment='DEV' AND project_ref='localerpephemeralqax') THEN
          RAISE EXCEPTION 'CUSTOMER_RECOVERY_REQUIRES_EPHEMERAL_DB'; END IF;
        d:=public.create_demo_tenant_ready_tx('Customer recovery local',14,'PE','customer-recovery-${identity}');
        UPDATE public.usuarios_sistema SET email='${email}',
          password_hash=extensions.crypt('Customer-Local-2026!',extensions.gen_salt('bf')),estado='ACTIVO'
          WHERE id=(d->>'user_id')::uuid;
        PERFORM set_config('test.customer_recovery_fixture',d::text,true);
      END $fixture$;
      SELECT jsonb_build_object('tenant',(current_setting('test.customer_recovery_fixture')::jsonb)->>'tenant_id',
        'actor',(current_setting('test.customer_recovery_fixture')::jsonb)->>'user_id',
        'customer',(SELECT id FROM public.clientes WHERE tenant_id=((current_setting('test.customer_recovery_fixture')::jsonb)->>'tenant_id')::uuid ORDER BY id LIMIT 1));
      COMMIT;`)
    expect(fixture.customer).toMatch(/^[a-f0-9-]{36}$/)
    const state = () => sql(`BEGIN READ ONLY;SELECT jsonb_build_object(
      'phone',(SELECT telefono FROM public.clientes WHERE tenant_id='${fixture.tenant}' AND id='${fixture.customer}'),
      'updates',(SELECT count(*) FROM public.audit_log WHERE tenant_id='${fixture.tenant}' AND table_name='clientes' AND record_id='${fixture.customer}' AND operation='UPDATE'),
      'intents',(SELECT count(*) FROM public.customer_update_intents WHERE tenant_id='${fixture.tenant}'),
      'journals',(SELECT count(*) FROM public.asientos_contables WHERE tenant_id='${fixture.tenant}'));
      ROLLBACK;`)
    const before = state()
    diagnostics.before = before
    await page.goto('/login/', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(/correo|email/i).fill(email)
    await page.getByLabel(/contraseña/i).fill('Customer-Local-2026!')
    await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click()
    await page.waitForURL('**/dashboard/**')
    await page.goto(`/dashboard/ventas/clientes/${fixture.customer}/editar/`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#telefono')).toBeVisible()
    await page.locator('#telefono').fill('987571100')
    let firstKey = '', firstBody = '', replayKey = '', replayBody = '', lostAck = false
    const target = `**/api/ventas/clientes/${fixture.customer}**`
    await page.route(target, async route => {
      if (route.request().method() !== 'PUT') return route.continue()
      firstKey = route.request().headers()['idempotency-key']
      firstBody = route.request().postData()!
      const response = await route.fetch()
      expect(response.status()).toBe(200)
      const receipt = await response.json()
      expect(receipt.id ?? receipt.data?.id).toBe(fixture.customer)
      // La API y PostgreSQL ya confirmaron; el navegador pierde únicamente el ACK.
      const committed = state()
      diagnostics.afterCommitBeforeLostAck = committed
      expect(committed).toEqual({ phone: '987571100', updates: before.updates + 1,
        intents: 1, journals: before.journals })
      lostAck = true
      await route.abort('connectionreset')
    })
    await page.getByRole('button', { name: 'Actualizar Cliente', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Cambio guardado en este dispositivo' })).toBeVisible()
    expect(lostAck).toBe(true)
    expect(firstKey).toBeTruthy()
    await page.unroute(target)
    steps.push({ name: 'customer_real_commit_then_http_ack_lost', result: 'PASS' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('erp.desktop.offline.outbox') || '[]'))
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ tenant_id: fixture.tenant, user_id: fixture.actor, body: firstBody, status: 'pending' })
    expect(pending[0].headers.find((h: any) => h.name.toLowerCase() === 'idempotency-key')?.value).toBe(firstKey)
    expect(pending[0].headers.some((h: any) => ['authorization','cookie'].includes(h.name.toLowerCase()))).toBe(false)
    steps.push({ name: 'customer_original_key_body_survive_reload', result: 'PASS' })
    const observedRequests: Promise<void>[] = []
    const replayRequests: { key?: string; method: string; url: string }[] = []
    page.on('request', request => {
      if (request.method() === 'PUT' && request.url().includes(`/api/ventas/clientes/${fixture.customer}`)) {
        observedRequests.push((async () => {
          replayKey = (await request.allHeaders())['idempotency-key']; replayBody = request.postData()!
          replayRequests.push({ key: replayKey, method: request.method(), url: request.url() })
        })())
      }
    })
    await page.goto('/dashboard/offline/', { waitUntil: 'domcontentloaded' })
    const row = page.getByRole('row').filter({ hasText: pending[0].id })
    await expect(row).toContainText('Pendiente')
    await page.getByRole('button', { name: 'Sincronizar', exact: true }).click()
    await expect(row).toContainText('Sincronizado', { timeout: 30_000 })
    await Promise.all(observedRequests)
    diagnostics.replayRequests = replayRequests
    diagnostics.afterReplay = state()
    expect(replayKey).toBe(firstKey); expect(replayBody).toBe(firstBody)
    expect(diagnostics.afterReplay).toEqual({ phone: '987571100', updates: before.updates + 1, intents: 1, journals: before.journals })
    steps.push({ name: 'customer_same_intent_replay_no_duplicate_update_audit', result: 'PASS' })
    await page.screenshot({ path: path.join(output, 'customer-update-recovery.png'), fullPage: true })
    expect(pageErrors).toEqual([])
    for (const [file, digest] of Object.entries(sourceHashes)) {
      expect(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')).toBe(digest)
    }
    complete = true
  } finally {
    writeFileSync(path.join(output, 'customer-update-recovery-ui.json'), JSON.stringify({ complete, remoteWrites: false,
      steps, page_errors: pageErrors, sourceHashes, diagnostics, scope: 'browser and real ephemeral API/PostgreSQL commit, reload and replay' }, null, 2))
  }
})
