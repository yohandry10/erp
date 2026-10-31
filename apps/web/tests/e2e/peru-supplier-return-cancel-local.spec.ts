import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
const sql=(q:string)=>readLocalSql(q.trim().replace(/;$/,'')+';')
import { loginPeruLocal } from './helpers/peru-login-local'
import { readLocalSql } from './helpers/peru-local-accounting'

test('Compras Perú: anular borrador de devolución conserva stock y no crea asiento ni salida', async ({ page, context }) => {
  test.setTimeout(180000)
  expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1')
  expect(process.env.PGPORT).toBe('55456')
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'supplier-return-cancel-ui-fixture.json'), 'utf8'))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const auth = await loginPeruLocal(page, fixture.email, 'Local-Peru-2026-Only!')
  const created = await page.request.post(process.env.LOCAL_API_URL + '/api/compras/devoluciones', {
    headers: { Authorization: 'Bearer ' + (auth.access_token ?? auth.data?.access_token), 'Idempotency-Key': fixture.intent.idempotency_key }, data: fixture.intent,
  })
  expect(created.status()).toBe(201)
  const body = await created.json(), draft = body.data ?? body
  expect(draft.estado).toBe('PENDIENTE')
  const stock = () => readLocalSql(`SELECT stock_actual::text FROM productos WHERE tenant_id='${fixture.tenant}' AND id='${fixture.productId}';`)
  const originalStock = stock()
  await page.goto('/dashboard/compras/devoluciones/' + draft.id + '/')
  await context.route(new RegExp('/api/compras/devoluciones/'+draft.id+'/anular/?$'),route=>route.fulfill({status:503,json:{message:'Fallo local antes de anular; original conservado'}}),{times:1})
  const [failed]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/devoluciones/'+draft.id+'/anular')),page.getByRole('button',{name:'Anular borrador',exact:true}).click()])
  expect(failed.status()).toBe(503)
  await expect(page.getByText('Fallo local antes de anular; original conservado',{exact:true}).first()).toBeVisible()
  await expect(page.getByText('Devolución pendiente anulada.',{exact:true})).toHaveCount(0)
  expect(readLocalSql(`SELECT estado FROM devoluciones_proveedor WHERE id='${draft.id}';`)).toBe('PENDIENTE');expect(stock()).toBe(originalStock)
  const [cancelled] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/,'').endsWith('/devoluciones/' + draft.id + '/anular') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Anular borrador', exact: true }).click(),
  ])
  expect(cancelled.status()).toBe(200)
  await expect(page.getByText('Devolución pendiente anulada.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('ANULADA', { exact: true })).toHaveCount(2)
  await expect(page.getByText('ANULADA', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Anular borrador', exact: true })).toHaveCount(0)
  expect(readLocalSql(`SELECT estado FROM devoluciones_proveedor WHERE tenant_id='${fixture.tenant}' AND id='${draft.id}';`)).toBe('ANULADA')
  expect(stock()).toBe(originalStock)
  expect(readLocalSql(`SELECT count(*) FROM outbox_events WHERE aggregate_id='${draft.id}';`)).toBe('0')
  for (const item of draft.items) expect(readLocalSql(`SELECT count(*) FROM movimientos_inventario WHERE referencia_id='${item.id}';`)).toBe('0')
  expect(errors).toEqual([])
  fs.writeFileSync(path.join(output, 'supplier-return-cancel-real-ui.json'), JSON.stringify({ complete: true,
    scope: 'FRESH_REAL_UI_PENDING_SUPPLIER_RETURN_CANCEL_NO_STOCK_GL_EFFECT', remoteWrites: false, fixtureCreatedViaAPI: true,
    steps: [{ name: 'real_UI_supplier_return_draft_cancel_reload_SQL_stock_outbox_unchanged', result: 'PASS', returnId: draft.id }], page_errors: errors }, null, 2))
})

test('Finanzas Perú: revertir detracción no depositada restaura la deuda sin cargo bancario',async({page,context})=>{
 test.setTimeout(180000);const errors:string[]=[];expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456');page.on('pageerror',e=>errors.push(e.message))
 await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort('blockedbyclient'))
 const f=JSON.parse(fs.readFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,'tax-adjustments-fixture.json'),'utf8')),auth=await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!'),key=randomUUID(),reference='UI-REV-'+key.slice(0,8)
 const debt=()=>Number(sql(`SELECT saldo FROM cuentas_por_pagar WHERE id='${f.invoice_ui_id}'`)),bank=()=>sql(`SELECT saldo::text FROM cuentas_bancarias WHERE id='${f.bank_id}'`),beforeDebt=debt(),beforeBank=bank(),today=sql(`SELECT app.hoy_tenant('${f.tenant}')`)
 const created=await page.request.post(process.env.LOCAL_API_URL+'/api/retenciones/ajustes',{headers:{Authorization:'Bearer '+(auth.access_token??auth.data?.access_token),'Idempotency-Key':key},data:{idempotency_key:key,origen:'PROVEEDOR',tipo:'DETRACCION',cuenta_id:f.invoice_ui_id,monto:2,moneda:'PEN',fecha:today,referencia:reference}});expect(created.status()).toBe(201);const adjustment=(await created.json()).data;expect(debt()).toBe(beforeDebt-2)
 await page.goto('/dashboard/finanzas/ajustes-fiscales/');const card=page.getByText(reference,{exact:true}).first().locator('..').locator('..').locator('..');await card.getByRole('button',{name:'Revertir detracción no depositada',exact:true}).click();await card.getByRole('textbox',{name:'Motivo',exact:true}).fill('Reversión de ensayo UI local')
 const [reversed]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/retenciones/'+adjustment.id+'/revertir-detraccion-proveedor')&&r.request().method()==='POST'),card.getByRole('button',{name:'Confirmar reversión pendiente',exact:true}).click()]);expect(reversed.status()).toBe(201)
 await page.reload();expect(debt()).toBe(beforeDebt);expect(bank()).toBe(beforeBank);await expect(page.getByRole('button',{name:'Revertir detracción no depositada',exact:true})).toHaveCount(0)
 expect(errors).toEqual([]);fs.writeFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,'pending-detraction-reverse-real-ui.json'),JSON.stringify({complete:true,scope:'FRESH_REAL_UI_PENDING_SUPPLIER_DETRACTION_REVERSE_SQL',remoteWrites:false,page_errors:errors,steps:[{name:'real_UI_pending_supplier_detraction_reverse_reload_SQL_debt_bank',result:'PASS',adjustmentId:adjustment.id,fixtureCreatedViaAPI:true}]},null,2))
})
