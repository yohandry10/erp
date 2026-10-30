import {test,expect,type BrowserContext} from '@playwright/test'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {loginPeruLocal} from './helpers/peru-login-local'

const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
if(process.env.E2E_EPHEMERAL_LOCAL_DB!=='1'||process.env.LOCAL_API_URL!=='http://127.0.0.1:3126'||!output)throw Error('Sólo stack efímero propio')
const fixture=(name:string)=>JSON.parse(readFileSync(path.join(output,name+'-fixture.json'),'utf8'))
const localOnly=(context:BrowserContext)=>context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'))
const endpoint=(url:string)=>new URL(url).pathname.replace(/^\/backend/,'').replace(/\/$/,'')
const proof={complete:false,remoteWrites:false,steps:[] as {name:string;result:'PASS';[key:string]:unknown}[],scriptErrors:[] as string[]}
test.afterAll(()=>writeFileSync(path.join(output,'browser-review-corrections.json'),JSON.stringify(proof,null,2)))
test.afterEach(async({},info)=>{if(info.status!==info.expectedStatus)proof.scriptErrors.push(info.title+': '+info.status)})

test('Revisión: tours repetidos conservan un único completado y notifican permisos reales',async({page,context,browser})=>{
 test.setTimeout(240000);page.setDefaultTimeout(25000)
 page.on('pageerror',e=>proof.scriptErrors.push(e.message));await localOnly(context)
 await loginPeruLocal(page,fixture('tax-intents').email,'Cliente-Local-2026-Only!')
 await page.evaluate(()=>localStorage.setItem('erp_onboarding_completed',JSON.stringify(['admin','admin',17])))
 await page.reload({waitUntil:'domcontentloaded'})
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'Abrir ayuda',exact:true}).click()
  await page.getByRole('button',{name:'Tour del Administrador',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'¡Bienvenido Administrador!',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Saltar',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('erp_onboarding_completed')||'[]'))).toEqual(['admin'])
 }
 proof.steps.push({name:'tour_repeat_deduplicates_legacy_and_current_completion',result:'PASS',repeats:2})

 const readerContext=await browser.newContext({baseURL:process.env.BASE_URL})
 try{
  await localOnly(readerContext);const reader=await readerContext.newPage();reader.on('pageerror',e=>proof.scriptErrors.push(e.message))
  await loginPeruLocal(reader,'reader-reports-local@example.test','Lector-Local-2026!')
  // Every authenticated reader may read its scoped inbox; mutation permissions
  // remain separate. Verify that real contract before injecting a UI-only403.
  const allowed=reader.waitForResponse(r=>endpoint(r.url())==='/api/notifications'&&r.request().method()==='GET')
  await reader.getByRole('button',{name:'Abrir notificaciones',exact:true}).click();expect((await allowed).status()).toBe(200)
  await expect(reader.getByRole('button',{name:'Eliminar notificación',exact:true})).toHaveCount(0)
  await reader.keyboard.press('Escape')
  let originalStatus:number|undefined
  const deniedRoute=/\/api\/notifications\/?$/
  await reader.route(deniedRoute,async route=>{const response=await route.fetch();originalStatus=response.status();expect(originalStatus).toBe(200);await route.fulfill({status:403,json:{message:'Permiso revocado sólo en la sonda de presentación'}})})
  await reader.getByRole('button',{name:'Abrir notificaciones',exact:true}).click()
  await expect(reader.getByText('No tienes permiso para consultar las notificaciones.',{exact:true})).toBeVisible()
  await expect(reader.getByText('Sin notificaciones',{exact:true})).toHaveCount(0)
  expect(originalStatus).toBe(200);await reader.unroute(deniedRoute)
  await reader.screenshot({path:path.join(output,'notifications-injected-permission.png')})
  await reader.goto('/dashboard/contabilidad/consolidacion/',{waitUntil:'domcontentloaded'})
  await expect(reader.getByRole('heading',{name:'Consolidación y reportes configurables'})).toBeVisible()
  await expect(reader.getByRole('button',{name:'Guardar definición atómica',exact:true})).toBeDisabled()
  proof.steps.push({name:'reader_scoped_inbox200_injected403_message_and_report_writer_disabled',result:'PASS',realInboxStatus:200,presentationFaultInjected:403})
 }finally{await readerContext.close()}

 let actualStatus:number|undefined
 const matcher=/\/api\/notifications\/?$/
 await context.route(matcher,async route=>{const response=await route.fetch();actualStatus=response.status();expect(actualStatus).toBe(200);await route.fulfill({status:503,json:{message:'Fallo transitorio inducido sólo en el ensayo'}})})
 await page.getByRole('button',{name:'Abrir notificaciones',exact:true}).click()
 await expect(page.getByText('No se pudieron cargar las notificaciones. Reintenta la consulta.',{exact:true})).toBeVisible()
 expect(actualStatus).toBe(200);await context.unroute(matcher)
 const recovered=page.waitForResponse(r=>endpoint(r.url())==='/api/notifications'&&r.request().method()==='GET')
 await page.getByRole('button',{name:'Reintentar',exact:true}).click();expect((await recovered).status()).toBe(200)
 await expect(page.getByText('No se pudieron cargar las notificaciones. Reintenta la consulta.',{exact:true})).toHaveCount(0)
 proof.steps.push({name:'notifications_503_retains_error_then_manual_retry_reads_real_200',result:'PASS'})
})

test('Revisión: cortes reales mantienen columnas separadas y desplazamiento en móvil',async({page,context})=>{
 test.setTimeout(180000);page.setDefaultTimeout(25000);page.on('pageerror',e=>proof.scriptErrors.push(e.message))
 await localOnly(context);const cash=fixture('cash-browser');await loginPeruLocal(page,cash.email,'Cliente-Local-2026-Only!')
 await page.goto('/dashboard/cajas/',{waitUntil:'domcontentloaded'})
 const table=page.locator('table').filter({has:page.getByRole('columnheader',{name:'Docs',exact:true})})
 await expect(table.locator('tbody tr').first()).toBeVisible()
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});await expect(table.getByRole('columnheader',{name:'Fecha',exact:true})).toBeVisible()
  const geometry=await table.evaluate(node=>{
   const cells=[...node.querySelector('tbody tr')!.querySelectorAll('td')]
   return {tableWidth:node.getBoundingClientRect().width,parentWidth:node.parentElement!.clientWidth,
    overflow:getComputedStyle(node.parentElement!).overflowX,cells:cells.map(c=>({display:getComputedStyle(c).display,
     x:c.getBoundingClientRect().left,right:c.getBoundingClientRect().right,width:c.getBoundingClientRect().width,padding:getComputedStyle(c).paddingLeft}))}
  })
  expect(geometry.cells).toHaveLength(6);expect(geometry.cells.every(c=>c.display==='table-cell'&&c.width>0&&parseFloat(c.padding)>0)).toBe(true)
  expect(geometry.cells[1].x).toBeGreaterThanOrEqual(geometry.cells[0].right-1)
  expect(geometry.tableWidth).toBeGreaterThanOrEqual(760);expect(geometry.overflow).toMatch(/auto|scroll/)
  if(width===390){
   expect(geometry.tableWidth).toBeGreaterThan(geometry.parentWidth)
   const scrolled=await table.locator('..').evaluate(node=>{node.scrollLeft=node.scrollWidth;return node.scrollLeft})
   expect(scrolled).toBeGreaterThan(0)
   await expect(table.getByRole('button',{name:'CSV',exact:true}).first()).toBeInViewport()
   await table.locator('..').screenshot({path:path.join(output,'cash-cuts-390-actions.png')})
   await table.locator('..').evaluate(node=>{node.scrollLeft=0})
  }
  await table.locator('..').screenshot({path:path.join(output,`cash-cuts-${width}.png`)})
  proof.steps.push({name:`cash_cut_real_rows_columns_${width}`,result:'PASS',geometry,cutId:cash.first_cut_id})
 }
 expect(proof.scriptErrors).toEqual([]);proof.complete=true
})
