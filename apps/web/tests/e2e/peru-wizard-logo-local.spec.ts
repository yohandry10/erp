import {test,expect,type Page} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
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


test('Perú: asistente conserva cierre y logo reales ante pérdida de ambas respuestas', async ({ page, context }) => {
  test.setTimeout(300000)
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== '1') throw new Error('Requiere base local efímera')
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const fixture = JSON.parse(await fs.readFile(path.join(output, 'wizard-fixture.json'), 'utf8'))
  expect(fixture.tenant).toMatch(/^[0-9a-f-]{36}$/i)
  const tenant = `'${fixture.tenant}'::uuid`
  expect(process.env.PGPORT).toBe('55516')
  const ddl = (query:string) => execFileSync(process.env.PSQL_BIN!,['-XqAt','-h','127.0.0.1','-p','55516','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim()
  expect(ddl("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;")).toBe('erp_e2e|DEV|localerpephemeralqax')
  const gateway=process.env.LOCAL_POSTGREST_URL!;expect(new URL(gateway).hostname).toBe('127.0.0.1')
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url())
    if(url.origin==='https://wypnbcptofqdmoynlonq.supabase.co'&&url.pathname.startsWith('/storage/v1/object/public/company-assets/'))return route.fulfill({response:await context.request.get(gateway+url.pathname)})
    return ['127.0.0.1','localhost','[::1]'].includes(url.hostname)?route.continue():route.abort('blockedbyclient')
  })
  const logoKeys:(string|undefined)[]=[];let lostLogo=false;let logoAsset:string|undefined
  // Pause the real browser response after the original multipart reached API.
  // route.fetch() reserializes multipart in this transport and loses the file.
  const transport=await context.newCDPSession(page);const faultTasks:Promise<void>[]=[];const faultErrors:string[]=[]
  transport.on('Fetch.requestPaused',event=>{faultTasks.push((async()=>{
    try {
      if(event.request.method!=='POST'){await transport.send('Fetch.continueRequest',{requestId:event.requestId});return}
      expect(event.responseStatusCode).toBe(201)
      logoKeys.push(String(Object.entries(event.request.headers).find(([k])=>k.toLowerCase()==='idempotency-key')?.[1]))
      const body=await transport.send('Fetch.getResponseBody',{requestId:event.requestId})
      const committed=JSON.parse(body.base64Encoded?Buffer.from(body.body,'base64').toString():body.body)
      if(logoAsset)expect(committed.data.asset_id).toBe(logoAsset);else logoAsset=committed.data.asset_id
      if(!lostLogo){lostLogo=true;await transport.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({message:'Logo confirmado localmente; respuesta perdida'})).toString('base64')});return}
      await transport.send('Fetch.continueRequest',{requestId:event.requestId})
    } catch(error){faultErrors.push(String(error));await transport.send('Fetch.continueRequest',{requestId:event.requestId}).catch(()=>{})}
  })())})
  await transport.send('Fetch.enable',{patterns:[{urlPattern:'*/api/configuration/empresa/logo*',requestStage:'Response'}]})

  try {

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
  await page.locator('input[type=file]').setInputFiles(path.join(output,'logo-local-red.png'))
  await next.click()
  await page.locator('input[type=file]').setInputFiles(path.join(output, 'wizard-local.pfx'))
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
  ddl("UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=false WHERE singleton;")
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
  await page.getByRole('button', { name: 'Ir al Dashboard', exact: true }).click()
  await expect(page.getByText('Logo confirmado localmente; respuesta perdida',{exact:true})).toBeVisible()
  expect(logoKeys).toHaveLength(1)
  await page.getByRole('button', { name: 'Ir al Dashboard', exact: true }).click()
  await expect.poll(()=>logoKeys.length).toBe(2);expect(logoKeys[1]).toBe(logoKeys[0]);expect(logoAsset).toBeTruthy()
  expect(readLocalSql(`SELECT count(*) FROM empresa_logo_assets WHERE tenant_id=${tenant} AND estado='ACTIVA';`)).toBe('1')
  await page.waitForURL(/\/dashboard\/$/)
  expect(completionKeys).toHaveLength(3)
  expect(completionKeys[0]).toBeTruthy()
  expect(completionKeys[1]).toBe(completionKeys[0])
  expect(readLocalSql(`SELECT count(*) FROM outbox_events WHERE tenant_id=${tenant} AND event_type='configuracion.wizard.completado';`)).toBe('1')
  await page.goto('/dashboard/wizard/')
  await expect(page.getByRole('heading', { name: 'Resumen de Configuración', exact: true })).toBeVisible()
  const company = (await (await page.request.get('/backend/api/configuration/empresa')).json()).data
  expect(company.ruc).toBe(fixture.ruc)
  expect(company.certificateConfigured).toBe(true)
  expect(company.sunatUsernameConfigured).toBe(true)
  const logo=page.getByAltText('Logo de la empresa',{exact:true});await expect(logo).toBeVisible();await expect.poll(()=>logo.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(1)
  for (const secret of ['Clave-PFX-local', 'Clave-SOL-ensayo-local', 'Clave-incorrecta-local']) expect(JSON.stringify(company)).not.toContain(secret)
  await page.screenshot({ path: path.join(output, 'wizard-logo-completed.png'), fullPage: true })
  await fs.writeFile(path.join(output, 'browser-wizard-logo-original-ui.json'), JSON.stringify({ success: true, remoteWrites: false,
    scope: 'Primer ADMIN no demo, configuración fiscal local sin transmisión', requests,
    coreReadyBeforeWizard: true, progressRecovered: true, invalidRucRejected: true, invalidPfxRejected: true,
    stepReplyLostSameIntent: true, completionReplyLostSameIntent: true, singleCompletion: true, publicSecretsAbsent: true, logoLostReplyRecoveredWithSameKey: true, singleLogoAsset: true, logoVisibleAfterReload: true }, null, 2))
  await Promise.all(faultTasks);expect(faultErrors).toEqual([])
  } finally { await transport.send('Fetch.disable');ddl("UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;") }
})
