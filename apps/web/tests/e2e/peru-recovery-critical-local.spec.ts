import {test,expect} from './helpers/peru-local-surface'
import {readFileSync,writeFileSync} from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import path from 'node:path'
import {readLocalSql} from './helpers/peru-local-accounting'

test('Recuperación crítica: recibos reales, almacenamiento, actor retenido y abandono rechazan confirmaciones falsas',async({page,context})=>{
 test.setTimeout(600000)
 expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456')
 const native=!!process.env.LOCAL_NATIVE_CDP_URL,origin=native?'http://tauri.localhost':process.env.LOCAL_WEB_URL!
 const api=process.env.LOCAL_API_URL!,out=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
 expect(api).toBe('http://127.0.0.1:3126')
 const fixture=JSON.parse(readFileSync(path.join(out,`asset-critical-${native?'native':'browser'}-fixture.json`),'utf8'))
 const other=JSON.parse(readFileSync(path.join(out,'accounting-other-fixture.json'),'utf8'))
 const q=(v:string)=>{expect(v).toMatch(/^[a-f0-9-]{36}$/i);return `'${v}'::uuid`}
 const actorOf=(f:any)=>{expect(f.email).toMatch(/^[a-zA-Z0-9@._+\-]+$/);return readLocalSql(`SELECT id FROM usuarios_sistema WHERE tenant_id=${q(f.tenant)} AND email='${f.email}';`)}
 const actor=actorOf(fixture),otherActor=actorOf(other),tenant=q(fixture.tenant)
 const key=`erp.accounting.asset-lifecycle.pending.v1.${fixture.tenant}:${actor}`
 const steps:any[]=[],errors:string[]=[],requests:any[]=[];let complete=false
 const pending=()=>page.evaluate(k=>localStorage.getItem(k),key)
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await context.route('**/*',r=>['localhost','127.0.0.1','[::1]',...(native?['tauri.localhost','ipc.localhost']:[])].includes(new URL(r.request().url()).hostname)?r.continue():r.abort('blockedbyclient'))
 const login=async(p:typeof page,f:any)=>{
  await p.goto(origin+'/login/',{waitUntil:'domcontentloaded'})
  // The owned Windows profile can already have a valid session. Hydration
  // redirects /login asynchronously, so observe the settled state before
  // deciding whether the real logout is required.
  await expect(p.locator('#email:enabled').or(p.getByRole('button',{name:'Cerrar Sesión',exact:true}))).toBeVisible({timeout:30000})
  if(new URL(p.url()).pathname.includes('/dashboard/')){
   await p.getByRole('button',{name:'Cerrar Sesión',exact:true}).click()
   await expect(p).toHaveURL(/\/login\/?(?:[?#].*)?$/)
  }
  await expect(p.locator('#email')).toBeEnabled({timeout:30000});await p.locator('#email').fill(f.email);await p.locator('#password').fill('Cliente-Local-2026-Only!')
  for(let attempt=0;attempt<2;attempt++){
   const [response]=await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/api/auth/login')),p.getByRole('button',{name:'Iniciar Sesión',exact:true}).click()])
   if(response.status()===429&&attempt===0){const seconds=Number(await response.headerValue('retry-after')||60);expect(seconds).toBeGreaterThan(0);expect(seconds).toBeLessThanOrEqual(60);await p.waitForTimeout(seconds*1000);continue}
   expect(response.status()).toBe(201);await p.waitForURL('**/dashboard/**');return
  }
  throw Error('No se confirmó la sesión local')
 }
 const apiLogin=async()=>{for(let attempt=0;attempt<2;attempt++){const response=await page.request.post(api+'/api/auth/login',{data:{email:fixture.email,password:'Cliente-Local-2026-Only!'}});if(response.status()===429&&attempt===0){const seconds=Number(response.headers()['retry-after']||60);expect(seconds).toBeGreaterThan(0);expect(seconds).toBeLessThanOrEqual(60);await page.waitForTimeout(seconds*1000);continue}expect(response.status()).toBe(201);const value=await response.json(),token=value.access_token??value.data?.access_token;expect(token).toBeTruthy();return token}throw Error('Login API local no confirmado')}
 const restoreStorage=()=>page.evaluate(()=>{const w=window as any;if(w.__uatSetItem){Storage.prototype.setItem=w.__uatSetItem;delete w.__uatSetItem}})
 const restoreResponseObserver=()=>page.evaluate(()=>{const w=window as any;if(w.__uatCriticalOriginalFetch){window.fetch=w.__uatCriticalOriginalFetch;delete w.__uatCriticalOriginalFetch}})
 const observeResponseMarker=async(header:string,assetId:string)=>page.evaluate(({header,assetId})=>{
  const w=window as any;w.__uatCriticalMarker=null;w.__uatCriticalOriginalFetch=window.fetch
  window.fetch=async(...args:Parameters<typeof fetch>)=>{
   const response=await w.__uatCriticalOriginalFetch.apply(window,args)
   if(new URL(response.url).pathname.replace(/\/$/,'').endsWith('/activos-fijos/'+assetId))w.__uatCriticalMarker=response.headers.get(header)
   return response
  }
 },{header,assetId})
 const quota=async(kind:'intents'|'receipts')=>page.evaluate(kind=>{const w=window as any;w.__uatQuotaWrite=null;w.__uatSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('erp.accounting.asset-lifecycle.')&&k.includes('.'+kind+'.')){w.__uatQuotaWrite={key:k,raw:v};throw new DOMException('Almacenamiento local de ensayo agotado','QuotaExceededError')}return w.__uatSetItem.call(this,k,v)}},kind)
 try{
  await login(page,fixture);const token=await apiLogin()
  const today=readLocalSql(`SELECT app.hoy_tenant(${tenant})::text;`),[year,month]=today.split('-').map(Number)
  const opened=await page.request.post(api+'/api/contabilidad/periodos',{headers:{authorization:'Bearer '+token,'idempotency-key':randomUUID()},data:{anio:year,mes:month}});expect(opened.status(),await opened.text()).toBe(201)
  await page.goto(origin+'/dashboard/contabilidad/activos-fijos/',{waitUntil:'domcontentloaded'});expect(await pending()).toBeNull()
  const code='AF-CRITICAL-'+randomUUID().slice(0,8).toUpperCase()
  await page.getByRole('button',{name:'Registrar activo',exact:true}).click()
  for(const [label,value] of [['Código del activo',code],['Nombre del activo','Activo recuperación crítica'],['Fecha de adquisición',today],['Inicio de depreciación',today],['Valor residual','1'],['Vida útil en meses','12']])await page.getByLabel(label,{exact:true}).fill(value)
  await page.getByRole('spinbutton',{name:'Valor de adquisición',exact:true}).fill('3.01')
  const [created]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/contabilidad\/activos-fijos\/?$/.test(new URL(r.url()).pathname)),page.getByRole('button',{name:'Guardar activo',exact:true}).click()]);expect(created.status()).toBe(201)
  const asset=readLocalSql(`SELECT id FROM activos_fijos WHERE tenant_id=${tenant} AND codigo='${code}';`);q(asset)
  const matcher=new RegExp('/api/contabilidad/activos-fijos/'+asset+'/?$')
  const count=()=>Number(readLocalSql(`SELECT count(*) FROM app.asset_lifecycle_operations_570 WHERE tenant_id=${tenant} AND asset_id=${q(asset)} AND action='UPDATE';`))
  const edit=async(name:string)=>{await page.goto(origin+'/dashboard/contabilidad/activos-fijos/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Editar '+code,exact:true}).click();await page.getByLabel('Nombre editado',{exact:true}).fill(name)}
  const retry=page.getByRole('button',{name:'Reintentar operación original',exact:true})
  const recover=async(captured:any,before:number)=>{
   const original=await pending();expect(original).toBeTruthy();expect(JSON.parse(original!).body).toBe(captured.body);expect(JSON.parse(original!).idempotencyKey).toBe(captured.key)
   const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'&&matcher.test(new URL(r.url()).pathname)),retry.click()])
   expect(response.status(),await response.text()).toBe(200);expect(response.request().postData()).toBe(captured.body);expect(response.request().headers()['idempotency-key']).toBe(captured.key)
   const receipt=await response.json();expect(receipt.complete).toBe(true);expect(receipt.idempotent).toBe(true);expect(receipt.operation.operation_id).toBe(captured.receipt.operation.operation_id)
   await expect(retry).toHaveCount(0);expect(await pending()).toBeNull();expect(count()).toBe(before+1)
  }
  for(const mode of ['empty','partial','foreignTenant','foreignActor','contradictory','cached','queued','503','tcp','receiptQuota']){
   const before=count(),captured:any={};await edit('Recuperación '+mode)
   const markerHeader=mode==='cached'?'x-erp-offline-cache':mode==='queued'?'x-erp-offline-queued':null
   if(markerHeader)await observeResponseMarker(markerHeader,asset)
   if(mode==='receiptQuota')await quota('receipts')
   await page.route(matcher,async route=>{
    if(route.request().method()!=='PUT')return route.fallback()
    captured.body=route.request().postData();captured.key=route.request().headers()['idempotency-key']
    const actual=await route.fetch();expect(actual.status(),await actual.text()).toBe(200);captured.receipt=await actual.json();expect(captured.receipt.complete).toBe(true);expect(count()).toBe(before+1)
    if(mode==='tcp')return route.abort('connectionreset')
    if(mode==='503')return route.fulfill({status:503,json:{message:'ACK perdido después de COMMIT real'}})
    if(mode==='empty')return route.fulfill({status:200,contentType:'application/json',body:''})
    let value=structuredClone(captured.receipt);const headers:Record<string,string>={}
    if(mode==='partial')value={success:true}
    if(mode==='foreignTenant')value.tenant_id=randomUUID()
    if(mode==='foreignActor')value.operation.actor_id=randomUUID()
    if(mode==='contradictory')value.data.nombre='Nombre ajeno al original'
    if(mode==='cached')headers['x-erp-offline-cache']='true'
    if(mode==='queued')headers['x-erp-offline-queued']='true'
    // Cross-origin native fetch must be able to observe the injected marker.
    // This changes only the faulty-response fixture, never the app response.
    if(markerHeader)headers['access-control-expose-headers']=markerHeader
    await route.fulfill({status:200,json:value,headers})
   })
   await page.getByRole('button',{name:'Guardar',exact:true}).click()
   if(markerHeader){await expect.poll(()=>page.evaluate(()=>(window as any).__uatCriticalMarker)).toBe('true');captured.applicationObservedTransportMarker={header:markerHeader,value:'true'};await restoreResponseObserver()}
   await expect(retry).toBeEnabled()
   expect(count()).toBe(before+1);expect(await pending()).toBeTruthy();await page.unroute(matcher);await restoreStorage()
   await recover(captured,before)
   steps.push({name:'real_commit_'+mode+'_retains_original_then_exact_manual_replay',result:'PASS',operationId:captured.receipt.operation.operation_id,requestSha256:createHash('sha256').update(captured.body).digest('hex'),actualCommits:1,...(markerHeader?{applicationObservedTransportMarker:captured.applicationObservedTransportMarker}: {})})
  }
  // Failure to retain the immutable original is a pre-send barrier.
  const beforeQuota=count();await edit('Después de cuota de almacenamiento');await quota('intents')
  let puts=0;const observe=(r:import('@playwright/test').Request)=>{if(r.method()==='PUT'&&matcher.test(new URL(r.url()).pathname))puts++};page.on('request',observe)
  await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:/almacenamiento|agotado/i})).toBeVisible()
  expect(puts).toBe(0);expect(count()).toBe(beforeQuota);expect(await pending()).toBeNull();const neverSent=await page.evaluate(()=>JSON.parse((window as any).__uatQuotaWrite.raw));expect(neverSent.body).toBeTruthy();expect(neverSent.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/i);await restoreStorage()
  const [saved]=await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'&&matcher.test(new URL(r.url()).pathname)),retry.click()]);expect(saved.status()).toBe(200);expect(saved.request().postData()).toBe(neverSent.body);expect(saved.request().headers()['idempotency-key']).toBe(neverSent.idempotencyKey);await expect(page.getByLabel('Nombre editado',{exact:true})).toHaveCount(0);expect(count()).toBe(beforeQuota+1);page.off('request',observe)
  steps.push({name:'original_storage_quota_prevents_send_and_recovery_commits_once',result:'PASS'})
  if(!native){
   const before=count(),captured:any={};let release!:()=>void
   const held=new Promise<void>(resolve=>{release=resolve});await edit('Respuesta retenida del actor original')
   await page.route(matcher,async route=>{if(route.request().method()!=='PUT')return route.fallback();captured.body=route.request().postData();captured.key=route.request().headers()['idempotency-key'];const response=await route.fetch();expect(response.status()).toBe(200);captured.receipt=await response.json();await held;await route.fulfill({response})})
   await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect.poll(()=>!!captured.receipt).toBe(true);const original=await pending();expect(count()).toBe(before+1)
   const second=await context.newPage()
   try{await login(second,other);await expect.poll(()=>second.evaluate(()=>JSON.parse(localStorage.getItem('erp.auth.session.snapshot')||'null')?.user?.id)).toBe(otherActor);release();await page.waitForTimeout(250);expect(await pending()).toBe(original);expect(await second.evaluate(k=>localStorage.getItem(k),key)).toBe(original);expect(count()).toBe(before+1)}finally{release();await second.close();await page.unroute(matcher)}
   await login(page,fixture);await page.goto(origin+'/dashboard/contabilidad/activos-fijos/',{waitUntil:'domcontentloaded'});await expect(retry).toBeEnabled();await recover(captured,before)
   steps.push({name:'real_actor_and_tenant_switch_while_committed_reply_held_preserves_original_owner',result:'PASS',surface:'CHROMIUM',nativeCoverageClaimed:false})
  }
  const access=await apiLogin()
  const call=async(endpoint:string,body:any,status=201)=>{const response=await page.request.post(api+'/api/'+endpoint,{headers:{authorization:'Bearer '+access,'idempotency-key':randomUUID()},data:body});requests.push({method:'POST',endpoint,status:response.status()});expect(response.status(),await response.text()).toBe(status);const value=await response.json();return value.data??value}
  const suffix=randomUUID().slice(0,8),category='Recuperación '+suffix
  const originStore=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'RO-'+suffix,nombre:'Origen recuperación '+suffix,es_principal:true})
  const destination=await call('inventario/almacenes',{idempotency_key:randomUUID(),codigo:'RD-'+suffix,nombre:'Destino recuperación '+suffix,es_principal:false})
  await call('inventario/categorias',{idempotency_key:randomUUID(),codigo:'RC-'+suffix,nombre:category})
  const product=await call('inventario/productos',{idempotency_key:randomUUID(),codigo:'RP-'+suffix,nombre:'Producto recuperación '+suffix,categoria:category,unidad_medida:'NIU',precio_compra:10,precio_venta:20,controla_stock:true,almacen_id:originStore.id,stock_inicial:1,afectacion_igv:'10'})
  const stock=()=>readLocalSql(`SELECT jsonb_build_object('stock',(SELECT stock_actual FROM productos WHERE id=${q(product.id)}),'moves',(SELECT count(*) FROM movimientos_inventario WHERE tenant_id=${tenant}),'outbox',(SELECT count(*) FROM outbox_events WHERE tenant_id=${tenant}));`)
  for(const kind of ['AJUSTE','TRANSFERENCIA']){
   const original={producto_id:product.id,motivo:'Abandono original UAT',idempotency_key:randomUUID(),...(kind==='AJUSTE'?{almacen_id:originStore.id,delta:.125}:{almacen_origen_id:originStore.id,almacen_destino_id:destination.id,cantidad:.25})}
   const endpoint=kind==='AJUSTE'?'inventario/movimientos':'inventario/transferencias',before=stock()
   const resolution=await call(endpoint+'/resolver',{expected_scope:{tenant_id:fixture.tenant,actor_id:actor},original});expect(resolution.resolution).toBe('ABANDONED');expect(resolution.operation_identity).toMatchObject({tenant_id:fixture.tenant,actor_id:actor,idempotency_key:original.idempotency_key,type:kind});expect(stock()).toBe(before)
   await call(endpoint,original,409);expect(stock()).toBe(before)
   const again=await call(endpoint+'/resolver',{expected_scope:{tenant_id:fixture.tenant,actor_id:actor},original});expect(again.resolution).toBe('ABANDONED');expect(again.operation_identity.operation_id).toBe(resolution.operation_identity.operation_id);expect(stock()).toBe(before)
   expect(readLocalSql(`SELECT count(*) FROM app.inventory_operation_abandonments_570 WHERE tenant_id=${tenant} AND type='${kind}' AND idempotency_key='${original.idempotency_key}';`)).toBe('1')
   expect(readLocalSql(`SELECT count(*) FROM operaciones_inventario WHERE tenant_id=${tenant} AND tipo='${kind}' AND idempotency_key='${original.idempotency_key}';`)).toBe('0')
   steps.push({name:'real_definitive_abandonment_then_late_'+kind+'_writer_blocked_without_stock_or_outbox_change',result:'PASS'})
  }
  expect(errors).toEqual([]);complete=true
 }finally{
  await restoreResponseObserver().catch(()=>{});await restoreStorage().catch(()=>{});writeFileSync(path.join(out,(native?'native':'browser')+'-critical-recovery.json'),JSON.stringify({complete,remoteWrites:false,preservedUATWrites:0,surface:native?'WINDOWS_TAURI_WEBVIEW2':'CHROMIUM',scope:'Fresh owned real API/SQL commits; mutated acknowledgements and actual Storage quota exceptions; real tenant switch on Chromium; definitive inventory abandonment and late writers. No reboot or physical-device claim.',steps,requests,scriptErrors:errors},null,2))
 }
})
