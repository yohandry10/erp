import {test,expect,type BrowserContext} from '@playwright/test'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {loginPeruLocal} from './helpers/peru-login-local'
import {readLocalSql,consumeLocalAccounting} from './helpers/peru-local-accounting'

const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
if(process.env.E2E_EPHEMERAL_LOCAL_DB!=='1'||process.env.PGPORT!=='55456'||process.env.LOCAL_API_URL!=='http://127.0.0.1:3126')throw Error('Sólo stack efímero propio')
const fixture=(name:string)=>JSON.parse(readFileSync(path.join(output,name+'-fixture.json'),'utf8'))
const localOnly=(context:BrowserContext)=>context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))

test('Impresión: reporte HTML real de planilla conserva empleados e importes al generar PDF',async({page,context})=>{
 test.setTimeout(180000);page.setDefaultTimeout(25000);await localOnly(context)
 const f=fixture('payroll-plame'),proof={complete:false,remoteWrites:false,scope:'Actual payroll HTML download rendered by Chromium; no physical printer or PVS acceptance',steps:[] as any[],scriptErrors:[] as string[]}
 page.on('pageerror',e=>proof.scriptErrors.push(e.message));let preview:any
 try{
  await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!');await page.goto('/dashboard/rrhh/planillas/',{waitUntil:'domcontentloaded',timeout:120000})
  expect(Number(readLocalSql(`SELECT count(*) FROM planillas WHERE tenant_id='${f.tenant}'`))).toBe(1)
  await expect(page.getByRole('button',{name:'Reporte',exact:true})).toHaveCount(1)
  const response=page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/rrhh/planillas/'+f.payroll_id+'/detalle'))
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Reporte',exact:true}).click()])
  const actual=await response;expect(actual.status()).toBe(200);const details=(await actual.json()).data;expect(Array.isArray(details)).toBe(true);expect(details.length).toBeGreaterThan(0)
  const htmlFile=path.join(output,'payroll-current-report.html');await download.saveAs(htmlFile)
  const html=readFileSync(htmlFile,'utf8');preview=await context.newPage();await preview.setContent(html,{waitUntil:'domcontentloaded'})
  await expect(preview.getByRole('heading',{name:'Resumen Ejecutivo',exact:true})).toBeVisible()
  await expect(preview.locator('tbody tr')).toHaveCount(details.length+1)
  for(const employee of details){await expect(preview.getByText((employee.empleados.nombres+' '+employee.empleados.apellidos).trim(),{exact:true})).toBeVisible();await expect(preview.getByText(employee.empleados.numero_documento,{exact:true})).toBeVisible()}
  const income=details.reduce((sum:number,row:any)=>sum+Number(row.total_ingresos),0).toFixed(2),net=details.reduce((sum:number,row:any)=>sum+Number(row.neto_pagar),0).toFixed(2)
  await expect(preview.locator('.total-row')).toContainText(income);await expect(preview.locator('.total-row')).toContainText(net)
  await preview.emulateMedia({media:'print'});await preview.pdf({path:path.join(output,'payroll-current-report.pdf'),printBackground:true,preferCSSPageSize:true})
  proof.steps.push({name:'real_payroll_download_employee_rows_and_totals_match_live_detail',result:'PASS',payrollId:f.payroll_id,employees:details.length,income,net,html:'payroll-current-report.html',pdf:'payroll-current-report.pdf'})
  expect(proof.scriptErrors).toEqual([]);proof.complete=true
 }finally{await preview?.close();writeFileSync(path.join(output,'browser-payroll-print.json'),JSON.stringify(proof,null,2))}
})

test('Impresión: ranking y flujo financiero PEN/USD usan datos reales y singular de vencimiento',async({page,context})=>{
 test.setTimeout(240000);page.setDefaultTimeout(25000);await localOnly(context)
  // Cada tanda del ensayo arranca un Next dev nuevo: la primera visita a una ruta compila en fríos (plazo propio de 120 s).
 const f=fixture('finance'),proof={complete:false,remoteWrites:false,scope:'Actual finance UI print media PDFs; new invoices created only in owned local company',steps:[] as any[],scriptErrors:[] as string[]}
 page.on('pageerror',e=>proof.scriptErrors.push(e.message))
 try{
  const auth=await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!'),token=auth.access_token??auth.data?.access_token
  const post=async(endpoint:string,data:unknown)=>{const r=await context.request.post(process.env.LOCAL_API_URL+'/api/'+endpoint,{headers:{authorization:'Bearer '+token,'idempotency-key':randomUUID()},data});expect(r.status(),await r.text()).toBe(201);const v=await r.json();return v.data??v}
  const suffix=randomUUID().slice(0,8),base='20'+String(Date.now()).slice(-8),weights=[5,4,3,2,7,6,5,4,3,2],d=11-weights.reduce((sum,w,i)=>sum+Number(base[i])*w,0)%11
  const provider=await post('compras/proveedores',{ruc:base+String(d===10?0:d===11?1:d),razon_social:'Proveedor impresión '+suffix,direccion:'Av. Local 456',email:'print-'+suffix+'@example.test'})
  const date=(days:number)=>readLocalSql(`SELECT (app.hoy_tenant('${f.tenant}')+${days})::text`)
  for(const [currency,amount,days]of [['PEN',35.4,-1],['USD',11.8,30]]as const){
   await post('finanzas/cxp',{proveedor_id:provider.id,numero_documento:'F001-PRINT-'+currency+'-'+suffix,serie:'F001',tipo_documento:'FACTURA',fecha_emision:date(days-30),fecha_vencimiento:date(days),condiciones_pago:'CREDITO_30',subtotal:amount===35.4?30:10,igv:amount===35.4?5.4:1.8,total:amount,moneda:currency,tipo_cambio:currency==='PEN'?1:3.8,destino_credito_fiscal:'GRAVADAS'})
  }
  await consumeLocalAccounting('print-invoice-accounting')
  await page.goto('/dashboard/finanzas/reportes/',{waitUntil:'domcontentloaded',timeout:120000})
  await page.getByRole('button',{name:/^Proveedores con Mayor Deuda/}).click();await expect(page.getByRole('button',{name:'Imprimir / PDF',exact:true})).toBeEnabled()
  for(const currency of ['PEN','USD']){
   await page.locator('#proveedores-deuda-moneda').selectOption(currency)
   const row=page.locator('[data-finance-provider]').filter({has:page.getByRole('heading',{name:'Proveedor impresión '+suffix,exact:true})});await expect(row).toBeVisible()
   if(currency==='PEN'){await expect(row).toContainText('1 día');await expect(row).not.toContainText('1 días')}
   await page.emulateMedia({media:'print'});await page.pdf({path:path.join(output,'providers-current-'+currency+'.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'})
   proof.steps.push({name:'real_supplier_ranking_print_'+currency,result:'PASS',currency,pdf:'providers-current-'+currency+'.pdf',providerId:provider.id})
  }
  await page.getByRole('button',{name:/^Flujo de Caja Proyectado/}).click();await expect(page.getByRole('button',{name:'Imprimir / PDF',exact:true})).toBeEnabled()
  for(const currency of ['PEN','USD']){
   await page.getByRole('button',{name:currency,exact:true}).click()
   await page.emulateMedia({media:'print'});await page.pdf({path:path.join(output,'cashflow-current-'+currency+'.pdf'),format:'A4',printBackground:true});await page.emulateMedia({media:'screen'})
   proof.steps.push({name:'real_cashflow_print_'+currency,result:'PASS',currency,pdf:'cashflow-current-'+currency+'.pdf'})
  }
  for(const route of ['/dashboard/finanzas/tesoreria/','/dashboard/finanzas/tesoreria/programacion/']){
   await page.goto(route,{waitUntil:'domcontentloaded',timeout:120000});await expect(page.getByText('Proveedor impresión '+suffix,{exact:false}).first()).toBeVisible();await expect(page.locator('main')).not.toContainText(/\b1 días\b/)
  }
  proof.steps.push({name:'treasury_and_payment_schedule_keep_singular_for_one_day',result:'PASS'})
  expect(proof.scriptErrors).toEqual([]);proof.complete=true
 }finally{writeFileSync(path.join(output,'browser-finance-print.json'),JSON.stringify(proof,null,2))}
})
