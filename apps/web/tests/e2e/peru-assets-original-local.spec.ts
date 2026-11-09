import {type Locator} from '@playwright/test'
import {test,expect} from './helpers/peru-local-surface'
import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {readLocalSql,consumeLocalAccounting} from './helpers/peru-local-accounting'

test('Perú: activos reales recuperan alta, edición, depreciación, baja y venta después del commit',async({page,context})=>{
  test.setTimeout(360000)
  if(process.env.E2E_EPHEMERAL_LOCAL_DB!=='1')throw Error('Sólo infraestructura local efímera')
  const api=process.env.LOCAL_API_URL!,output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  const native=!!process.env.LOCAL_NATIVE_CDP_URL,origin=native?'http://tauri.localhost':process.env.LOCAL_WEB_URL!
  const evidencePrefix=native?'native-original-assets':'browser-original-assets'
  expect(new URL(api).hostname).toBe('127.0.0.1')
  expect(process.env.PGPORT).toBe('55456')
  const fixture=JSON.parse(await fs.readFile(path.join(output,'accounting-first-fixture.json'),'utf8'))
  expect(fixture.non_demo).toBe(true);expect(fixture.tenant).toMatch(/^[0-9a-f-]{36}$/i)
  const tenant=`'${fixture.tenant}'::uuid`,suffix=randomUUID().slice(0,8),codes=[`AF-UI-A-${suffix}`,`AF-UI-B-${suffix}`],storedCodes=codes.map(code=>code.toUpperCase())
  const errors:string[]=[],checks:Record<string,unknown>[]=[],requests:{method:string,path:string,status:number}[]=[]
  let success=false
  page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(120000)
  page.on('pageerror',e=>errors.push(e.message))
  page.on('dialog',d=>d.accept())
  page.on('response',r=>{const p=new URL(r.url()).pathname;if(p.includes('/api/contabilidad/activos-fijos'))requests.push({method:r.request().method(),path:p,status:r.status()})})
  await context.route('**/*',r=>['localhost','127.0.0.1','[::1]',...(native?['tauri.localhost','ipc.localhost']:[])].includes(new URL(r.request().url()).hostname)?r.continue():r.abort('blockedbyclient'))
  const sql=(q:string)=>readLocalSql(q)
  const visit=()=>page.goto(origin+'/dashboard/contabilidad/activos-fijos/',{waitUntil:'domcontentloaded'})
  const assertCurrentRegistry=async(acquisition:number,accumulated:number,net:number)=>{
    const region=page.getByRole('region',{name:'Saldos de activos vigentes',exact:true})
    for(const [label,amount]of [['Valor de adquisición',acquisition],['Depreciación acumulada',accumulated],['Valor neto en libros',net]]as const)
      await expect(region.getByRole('group',{name:label,exact:true}).getByText(new Intl.NumberFormat('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount),{exact:true})).toBeVisible()
  }
  const matches=(pattern:RegExp,method:string)=>(r:{url():string,request():{method():string}})=>pattern.test(new URL(r.url()).pathname)&&r.request().method()===method
  async function loginLocal(){
    for(let attempt=0;attempt<2;attempt++){
      const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/api/auth/login')&&r.request().method()==='POST'),page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click()])
      if(response.status()===429&&attempt===0){
        const seconds=Number(await response.headerValue('retry-after')||60)
        expect(seconds).toBeGreaterThan(0);expect(seconds).toBeLessThanOrEqual(60)
        await new Promise(resolve=>setTimeout(resolve,seconds*1000));continue
      }
      expect(response.status()).toBe(201);return response.json()
    }
    throw Error('No se confirmó el login local')
  }
  async function lostThenRecover(pattern:RegExp,method:string,status:number,button:Locator,retryLabel:string,check:()=>void){
    let originalBody='',originalKey='',receipt:Record<string,any>|undefined,loseCommittedReply=true
    const handler=async(route:import('@playwright/test').Route)=>{
      if(route.request().method()!==method||!loseCommittedReply)return route.fallback()
      loseCommittedReply=false
      originalBody=route.request().postData()!;originalKey=route.request().headers()['idempotency-key']
      expect(originalKey).toMatch(/^[0-9a-f-]{36}$/i)
      const response=await route.fetch();expect(response.status(),await response.text()).toBe(status)
      receipt=await response.json();expect(receipt?.complete).toBe(true)
      await route.fulfill({status:503,json:{message:'ACK perdido después de commit real local'}})
    }
    await page.route(pattern,handler)
    const [lost]=await Promise.all([page.waitForResponse(matches(pattern,method)),button.click()])
    expect(lost.status()).toBe(503);check()
    const before=requests.filter(r=>r.method===method&&pattern.test(r.path)).length
    await page.reload({waitUntil:'domcontentloaded'})
    const retry=page.getByRole('button',{name:retryLabel,exact:true});await expect(retry).toBeEnabled()
    expect(requests.filter(r=>r.method===method&&pattern.test(r.path))).toHaveLength(before)
    const [replay]=await Promise.all([page.waitForResponse(matches(pattern,method)),retry.click()])
    expect(replay.status(),await replay.text()).toBe(status)
    expect(replay.request().postData()).toBe(originalBody);expect(replay.request().headers()['idempotency-key']).toBe(originalKey)
    const final=await replay.json();expect(final.complete).toBe(true)
    if(final.operation.type==='ACCOUNTING_ASSET_CREATE')expect(final).not.toHaveProperty('idempotent')
    else expect(final.idempotent).toBe(true)
    expect(final.operation.operation_id).toBe(receipt?.operation.operation_id);check()
    await expect(retry).toHaveCount(0)
    checks.push({operation:method+' '+pattern.source,result:'PASS',lostCommittedReply:true,manualReplayAfterReload:true,sameBodyAndKey:true,originalOperationId:final.operation.operation_id})
    return final
  }
  try{
    expect(sql(`SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;`)).toBe('erp_e2e|DEV|localerpephemeralqax')
    await page.goto(origin+'/login/',{waitUntil:'domcontentloaded'})
    await expect(page.locator('#email')).toBeEnabled();await page.locator('#email').fill(fixture.email);await page.locator('#password').fill('Cliente-Local-2026-Only!')
    const auth=await loginLocal(),headers={Authorization:'Bearer '+(auth.access_token??auth.data?.access_token)}
    await page.waitForURL('**/dashboard/**')
    const today=sql(`SELECT app.hoy_tenant(${tenant})::text;`),start=sql(`SELECT (date_trunc('month',app.hoy_tenant(${tenant}))-interval '1 month')::date::text;`)
    const [year,month]=start.split('-').map(Number)
    for(const date of [start,today]){
      const [periodYear,periodMonth]=date.split('-').map(Number)
      if(sql(`SELECT count(*) FROM periodos_contables WHERE tenant_id=${tenant} AND anio=${periodYear} AND mes=${periodMonth};`)==='0'){
        const p=await page.request.post(api+'/api/contabilidad/periodos',{headers:{...headers,'idempotency-key':randomUUID()},data:{anio:periodYear,mes:periodMonth}});expect(p.status(),await p.text()).toBe(201)
      }
    }
    // Período y asiento de adquisición son precondiciones API explícitas. Las
    // cinco operaciones del registro de activos se ejecutan con sus controles UI.
    const assetCount=(code:string)=>sql(`SELECT count(*) FROM activos_fijos WHERE tenant_id=${tenant} AND codigo='${code}';`)
    const createPattern=/\/api\/contabilidad\/activos-fijos\/?$/
    const ids:string[]=[]
    for(const [i,cost]of [1001,601].entries()){
      expect(assetCount(storedCodes[i])).toBe('0');await visit()
      await page.getByRole('button',{name:'Registrar activo',exact:true}).click()
      await page.getByLabel('Código del activo',{exact:true}).fill(codes[i]);await page.getByLabel('Nombre del activo',{exact:true}).fill('Activo UI original '+i)
      await page.getByLabel('Fecha de adquisición',{exact:true}).fill(start);await page.getByLabel('Inicio de depreciación',{exact:true}).fill(start)
      await page.getByRole('spinbutton',{name:'Valor de adquisición',exact:true}).fill(String(cost));await page.getByLabel('Valor residual',{exact:true}).fill('1');await page.getByLabel('Vida útil en meses',{exact:true}).fill('3')
      const save=page.getByRole('button',{name:'Guardar activo',exact:true})
      if(i===0)await lostThenRecover(createPattern,'POST',201,save,'Reintentar alta',()=>expect(assetCount(storedCodes[i])).toBe('1'))
      else{const [r]=await Promise.all([page.waitForResponse(matches(createPattern,'POST')),save.click()]);expect(r.status(),await r.text()).toBe(201);await expect(save).toHaveCount(0)}
      const id=sql(`SELECT id FROM activos_fijos WHERE tenant_id=${tenant} AND codigo='${storedCodes[i]}';`);expect(id).toMatch(/^[0-9a-f-]{36}$/i);ids.push(id)
    }
    await visit();await page.getByRole('button',{name:'Editar '+storedCodes[0],exact:true}).click();await page.getByLabel('Nombre editado',{exact:true}).fill('Activo UI editado original')
    const editPattern=new RegExp('/api/contabilidad/activos-fijos/'+ids[0]+'/?$')
    await lostThenRecover(editPattern,'PUT',200,page.getByRole('button',{name:'Guardar',exact:true}),'Reintentar operación original',()=>{
      expect(sql(`SELECT nombre FROM activos_fijos WHERE id='${ids[0]}'::uuid AND tenant_id=${tenant};`)).toBe('Activo UI editado original')
      expect(sql(`SELECT count(*) FROM app.asset_lifecycle_operations_570 WHERE tenant_id=${tenant} AND asset_id='${ids[0]}'::uuid AND action='UPDATE';`)).toBe('1')
    })
    const account=(code:string)=>{const id=sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${tenant} AND codigo='${code}' AND activo AND acepta_movimiento;`);expect(id).toMatch(/^[0-9a-f-]{36}$/i);return id}
    const entry=await page.request.post(api+'/api/contabilidad/asiento-contable',{headers:{...headers,'idempotency-key':randomUUID()},data:{fecha:start,concepto:'Adquisición precondición activos UI '+suffix,estado:'BORRADOR',detalles:[{cuenta_id:account('33'),debe:1602,haber:0,concepto:'Adquisición de los dos activos UI'},{cuenta_id:account('1041'),debe:0,haber:1602,concepto:'Pago bancario de adquisición UI'}]}})
    expect(entry.status(),await entry.text()).toBe(201);const initialEntry=(await entry.json()).data
    const confirm=await page.request.post(api+'/api/contabilidad/asientos/'+initialEntry.id+'/confirmar',{headers:{...headers,'idempotency-key':randomUUID()},data:{}});expect(confirm.status(),await confirm.text()).toBe(201)
    await visit();await page.locator('#activos-fijos-ano').fill(String(year));await page.locator('#activos-fijos-mes').fill(String(month))
    const depreciation=await lostThenRecover(/\/api\/contabilidad\/activos-fijos\/depreciar\/?$/,'POST',201,page.getByRole('button',{name:'Depreciar período',exact:true}),'Reintentar lote original',()=>expect(sql(`SELECT count(*) FROM depreciaciones WHERE tenant_id=${tenant} AND activo_id IN('${ids[0]}'::uuid,'${ids[1]}'::uuid);`)).toBe('2'))
    expect(depreciation.data.activos_depreciados).toBe(2);expect(depreciation.data.total_depreciado).toBe(533.33)
    await assertCurrentRegistry(1602,533.33,1068.67)
    await consumeLocalAccounting(evidencePrefix+'-depreciation')
    for(const [i,type]of ['BAJA','VENTA'].entries()){
      await visit();await page.getByRole('button',{name:'Retirar '+storedCodes[i],exact:true}).click();await page.getByLabel('Fecha de baja',{exact:true}).fill(today)
      await page.getByLabel('Tipo de retiro',{exact:true}).selectOption(type);if(type==='VENTA')await page.getByLabel('Valor de venta',{exact:true}).fill('1.01')
      await page.getByLabel('Motivo de retiro',{exact:true}).fill('Retiro UI original con ACK perdido')
      const receipt=await lostThenRecover(new RegExp('/api/contabilidad/activos-fijos/'+ids[i]+'/baja/?$'),'POST',201,page.getByRole('button',{name:'Confirmar',exact:true}),'Reintentar operación original',()=>expect(sql(`SELECT situacion FROM activos_fijos WHERE tenant_id=${tenant} AND id='${ids[i]}'::uuid;`)).toBe(type==='VENTA'?'VENDIDO':'BAJA'))
      expect(receipt.journal.estado).toBe('CONFIRMADO');expect(receipt.journal.id).toBe(receipt.data.asiento_baja_id)
      const persisted=JSON.parse(sql(`SELECT json_build_object('count',count(*),'balanced',bool_and(total_debe=total_haber),'debit',sum(total_debe)) FROM asientos_contables WHERE tenant_id=${tenant} AND id='${receipt.journal.id}'::uuid;`))
      expect(persisted).toEqual({count:1,balanced:true,debit:i===0?1001:602.01})
      await assertCurrentRegistry(i===0?601:0,i===0?200:0,i===0?401:0)
    }
    expect(sql(`SELECT count(*) FROM app.asset_lifecycle_operations_570 WHERE tenant_id=${tenant} AND asset_id IN('${ids[0]}'::uuid,'${ids[1]}'::uuid);`)).toBe('3')
    expect(sql(`SELECT coalesce(sum(d.debe-d.haber),0)::numeric(18,2) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas c ON c.id=d.cuenta_id WHERE a.tenant_id=${tenant} AND a.estado='CONFIRMADO' AND c.codigo='33';`)).toBe('0.00')
    expect(sql(`SELECT coalesce(sum(d.debe-d.haber),0)::numeric(18,2) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id JOIN plan_cuentas c ON c.id=d.cuenta_id WHERE a.tenant_id=${tenant} AND a.estado='CONFIRMADO' AND c.codigo='39';`)).toBe('0.00')
    expect(errors).toEqual([]);expect(checks).toHaveLength(5)
    await page.screenshot({path:path.join(output,evidencePrefix+'-retired.png'),fullPage:true});success=true
  }finally{
    await fs.writeFile(path.join(output,evidencePrefix+'.json'),JSON.stringify({scope:'EPHEMERAL_REAL_UI_ASSET_CREATE_UPDATE_DEPRECIATION_RETIRE_SALE_WITH_COMMITTED_ACK_LOSS',surface:native?'WINDOWS_TAURI_WEBVIEW2':'CHROMIUM',success,remoteWrites:false,preservedUATWrites:0,preconditionsViaAPI:['open acquisition and retirement months','confirmed acquisition journal'],checks,requests,scriptErrors:errors,completedAt:new Date().toISOString()},null,2))
  }
})
