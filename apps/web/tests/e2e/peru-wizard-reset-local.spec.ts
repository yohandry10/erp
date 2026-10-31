import {test,expect,type Page} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import {readLocalSql} from './helpers/peru-local-accounting'

async function submitLocalLogin(page: Page) {
  // Todos los usuarios del ensayo comparten la IP local. Conservar el límite
  // real de autenticación y respetar Retry-After cuando se agota su ventana.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ response, auth }] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '').endsWith('/api/auth/login')
        && response.request().method() === 'POST').then(async response => ({
          response, auth: response.status() === 201 ? await response.json() : null,
        })),
      page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click(),
    ])
    if (response.status() === 429 && attempt === 0) {
      const retryAfter = Number(await response.headerValue('retry-after') || 60)
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(60)
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
      continue
    }
    expect(response.status(), 'El login real debe responder 201').toBe(201)
    expect(auth).toBeTruthy()
    await expect(page).toHaveURL(/\/(?:superadmin\/)?dashboard\//, { timeout: 25000 })
    await page.waitForLoadState('domcontentloaded')
    return auth
  }
}


test('Perú: reinicio confirmado del asistente recupera ACK perdido y permite otra configuración nueva', async ({ page, context }) => {
  test.setTimeout(420000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const fixture = JSON.parse(await fs.readFile(path.join(output, 'wizard-reset-fixture.json'), 'utf8'))
  expect(fixture.tenant).toMatch(/^[0-9a-f-]{36}$/i)
  const tenant = `'${fixture.tenant}'::uuid`
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort('blockedbyclient'))
  const requests: { method: string; path: string; status: number }[] = []
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.pathname.includes('/api/configuration/')) requests.push({ method: response.request().method(), path: url.pathname, status: response.status() })
  })
  const stepKeys: (string | undefined)[] = []
  const completionKeys: (string | undefined)[] = []
  let lostStep = false
  let lostCompletion = false
  await page.route(/\/api\/configuration\/wizard\/step\/?(?:\?.*)?$/, async route => {
    if (route.request().method() !== 'POST') return route.continue()
    stepKeys.push(route.request().headers()['idempotency-key'])
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    if (!lostStep) {
      lostStep = true
      return route.fulfill({ status: 503, json: { message: 'Respuesta perdida local del paso' } })
    }
    return route.fulfill({ response })
  })
  await page.route(/\/api\/configuration\/complete\/?(?:\?.*)?$/, async route => {
    if (route.request().method() !== 'POST') return route.continue()
    completionKeys.push(route.request().headers()['idempotency-key'])
    const response = await route.fetch()
    expect(response.status()).toBe(201)
    if (!lostCompletion) {
      lostCompletion = true
      return route.fulfill({ status: 503, json: { message: 'Respuesta perdida local del cierre' } })
    }
    return route.fulfill({ response })
  })
  await page.goto('/login/')
  await page.locator('#email').fill(fixture.email)
  await page.locator('#password').fill('Cliente-Local-2026-Only!')
  await submitLocalLogin(page)
  await page.waitForURL('**/dashboard/**')
  const core = await (await page.request.get('/backend/api/configuration/status')).json()
  expect(core.data.isComplete).toBe(true)
  expect(readLocalSql(`SELECT coalesce(bool_or(completado),false) FROM wizard_progress WHERE tenant_id=${tenant};`)).toBe('f')
  const status = await page.request.get('/backend/api/demo/status')
  expect(status.status()).toBe(200)
  expect((await status.json()).is_demo).toBe(false)
  // DEMO_API_ENABLED=false en este harness. Sólo la consulta autenticada está disponible.
  expect((await page.request.get('/backend/api/demo/planes')).status()).toBe(403)
  await page.goto('/dashboard/wizard/')
  await expect(page.getByRole('heading', { name: 'Bienvenido', exact: true })).toBeVisible({ timeout: 30000 })
  const next = page.getByRole('button', { name: 'Siguiente', exact: true })
  await next.click()
  await expect(page.getByText('Error al guardar el progreso', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bienvenido', exact: true })).toBeVisible()
  await next.click()
  await expect(page.getByRole('heading', { name: 'Tipo de Empresa', exact: true })).toBeVisible()
  expect(stepKeys[0]).toBeTruthy()
  expect(stepKeys[1]).toBe(stepKeys[0])
  await page.getByRole('button', { name: /Microempresa/ }).click()
  await next.click()
  await page.locator('#ruc').fill('123')
  await page.locator('#razonSocial').fill('Primera empresa del navegador local')
  await page.locator('#direccion').fill('Av. QA local 456')
  await expect(next).toBeDisabled()
  await page.locator('#ruc').fill(fixture.ruc)
  await page.locator('#ubigeo').fill('150101')
  await next.click()
  await expect(page.locator('#certificatePassword')).toBeVisible()
  const progress = /\/api\/configuration\/wizard\/progress\/?(?:\?.*)?$/
  await page.route(progress, route => route.fulfill({ status: 503, json: { message: 'Consulta local fallida' } }))
  await page.reload()
  await expect(page.getByText('No se pudo recuperar la configuración guardada. Reintenta la consulta.', { exact: true })).toBeVisible()
  await expect(next).toHaveCount(0)
  await page.unroute(progress)
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.locator('#ruc')).toHaveValue(fixture.ruc)
  await expect(page.locator('#razonSocial')).toHaveValue('Primera empresa del navegador local')
  await next.click()
  await page.locator('input[type=file]').setInputFiles(path.join(output, 'wizard-reset-local.pfx'))
  await page.locator('#certificatePassword').fill('Clave-incorrecta-local')
  await next.click()
  await page.locator('#regimen_tributario').selectOption('GENERAL')
  await page.locator('#serie_factura').fill('F001')
  await page.locator('#serie_boleta').fill('B001')
  await page.locator('#serie_guia_remision').fill('T001')
  await next.click()
  await page.locator('#sunat_username').fill('SOL_SECUNDARIO_LOCAL')
  await page.locator('#sunat_password').fill('Clave-SOL-ensayo-local')
  await next.click()
  await expect(page.getByRole('heading', { name: 'Se encontraron problemas' })).toBeVisible()
  await expect(next).toBeDisabled()
  expect(readLocalSql(`SELECT coalesce(bool_or(completado),false) FROM wizard_progress WHERE tenant_id=${tenant};`)).toBe('f')
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Anterior', exact: true }).click()
  await page.locator('#certificatePassword').fill('Clave-PFX-local')
  await next.click()
  await expect(page.locator('#regimen_tributario')).toBeVisible()
  await next.click()
  await expect(page.locator('#sunat_username')).toHaveValue('SOL_SECUNDARIO_LOCAL')
  await next.click()
  await expect(page.getByText('Respuesta perdida local del cierre', { exact: true })).toBeVisible()
  expect(lostCompletion).toBe(true)
  expect(readLocalSql(`SELECT completado FROM wizard_progress WHERE tenant_id=${tenant};`)).toBe('t')

  await next.click()
  const reset=page.getByRole('button',{name:'Reiniciar configuración',exact:true})
  await expect(reset).toBeVisible()
  const resetKeys:(string|undefined)[]=[];let resetLost=false
  await page.route(/\/api\/configuration\/wizard\/reset\/?$/,async route=>{
    resetKeys.push(route.request().headers()['idempotency-key'])
    const response=await route.fetch();expect(response.status()).toBe(201)
    if(!resetLost){resetLost=true;return route.fulfill({status:503,json:{message:'Reinicio local confirmado; respuesta perdida'}})}
    return route.fulfill({response})
  })
  page.once('dialog',dialog=>dialog.dismiss());await reset.click();expect(resetKeys).toHaveLength(0)
  page.once('dialog',dialog=>dialog.accept());await reset.click()
  await expect(page.getByText('Reinicio local confirmado; respuesta perdida',{exact:true})).toBeVisible()
  expect(resetKeys).toHaveLength(1)
  const snapshot=()=>readLocalSql(`SELECT md5(jsonb_build_array((SELECT to_jsonb(x) FROM wizard_progress x WHERE tenant_id=${tenant}),(SELECT to_jsonb(x) FROM empresa_config x WHERE tenant_id=${tenant}))::text);`)
  const afterCommittedReset=snapshot()
  expect(readLocalSql(`SELECT paso_actual::text||':'||completado::text||':'||cardinality(pasos_completados)::text FROM wizard_progress WHERE tenant_id=${tenant};`)).toBe('1:false:0')
  expect(readLocalSql(`SELECT configuracion_completa::text||':'||(certificado_pfx IS NULL)::text FROM empresa_config WHERE tenant_id=${tenant};`)).toBe('false:true')
  page.once('dialog',dialog=>dialog.accept());await reset.click()
  await expect(page.getByRole('heading',{name:'Bienvenido',exact:true})).toBeVisible()
  expect(resetKeys).toHaveLength(2);expect(resetKeys[1]).toBe(resetKeys[0]);expect(resetKeys[0]).toBeTruthy();expect(snapshot()).toBe(afterCommittedReset)
  await page.reload();await expect(page.getByRole('heading',{name:'Bienvenido',exact:true})).toBeVisible()
  expect(completionKeys).toHaveLength(1)
  await next.click();await page.getByRole('button',{name:/Microempresa/}).click();await next.click()
  await page.locator('#ruc').fill(fixture.ruc);await page.locator('#razonSocial').fill('Empresa configurada después del reinicio');await page.locator('#direccion').fill('Av. Reinicio nuevo 789');await page.locator('#ubigeo').fill('150101');await next.click()
  await page.locator('input[type=file]').setInputFiles(path.join(output,'wizard-reset-local.pfx'));await page.locator('#certificatePassword').fill('Clave-PFX-local');await next.click()
  await page.locator('#regimen_tributario').selectOption('GENERAL');await page.locator('#serie_factura').fill('F001');await page.locator('#serie_boleta').fill('B001');await page.locator('#serie_guia_remision').fill('T001');await next.click()
  await page.locator('#sunat_username').fill('SOL_NUEVO_REINICIO');await page.locator('#sunat_password').fill('Clave-SOL-nuevo-local');await next.click()
  await expect.poll(()=>readLocalSql(`SELECT configuracion_completa FROM empresa_config WHERE tenant_id=${tenant};`)).toBe('t')
  await next.click();await page.getByRole('button',{name:'Ir al Dashboard',exact:true}).click();await page.waitForURL(/\/dashboard\/$/)
  expect(completionKeys).toHaveLength(2);expect(completionKeys[1]).not.toBe(completionKeys[0])
  await page.goto('/dashboard/wizard/');await expect(page.getByRole('heading',{name:'Resumen de Configuración',exact:true})).toBeVisible();await expect(page.getByText('Empresa configurada después del reinicio',{exact:true})).toBeVisible()
  expect(readLocalSql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${tenant} AND event_type='configuracion.wizard.completado';`)).toBe('2')
  await fs.writeFile(path.join(output,'browser-wizard-reset-original-ui.json'),JSON.stringify({success:true,remoteWrites:false,scope:'Fresh UI/API/SQL: cancelled reset sends nothing, committed reset ACK loss retries same key without second mutation, reload and new configuration use a new completion intent',cancelledResetRequests:0,resetRequests:2,resetSameOriginalKey:true,resetSQLSnapshotUnchangedOnReplay:true,newCompletionKey:true,completedWizardEvents:2,requests},null,2))
})
