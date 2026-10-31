import {test,expect,type BrowserContext,type Page,type Route} from '@playwright/test'
import {SignJWT} from 'jose'
import fs from 'node:fs/promises'
import path from 'node:path'
const tenant='c0ba0000-0000-4000-8000-000000000001',actor='c0ba0000-0000-4000-8000-000000000002',doc='c0ba0000-0000-4000-8000-000000000003',batchId='c0ba0000-0000-4000-8000-000000000004'
const user={id:actor,tenant_id:tenant,email:'baja-isolated@example.test',nombre:'Bajas',apellido:'Fixture',roles:['ADMIN'],is_super_admin:false}
type Kind='RA'|'RC'
const eligible=(kind:Kind)=>({id:doc,tipo:kind,tipoDocumento:kind==='RA'?'01':'03',serie:kind==='RA'?'F999':'B999',numero:'00000001',fechaEmision:'2026-10-15',receptor:'FIXTURE-'+kind,total:118,moneda:'PEN',reversaComercialConfirmada:true})
async function setup(context:BrowserContext,page:Page,kind:Kind,mode='valid'){
 expect(process.env.E2E_ISOLATED_BROWSER).toBe('1')
 // El middleware sólo entrega el shell prefetch. Toda API se intercepta abajo;
 // este caso no atribuye aceptación a autenticación ni a una autoridad fiscal.
 await context.setExtraHTTPHeaders({purpose:'prefetch'})
 const token=await new SignJWT({tenant_id:tenant,roles:user.roles,email:user.email}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode('LOCAL-ISOLATED-CPE-UI-ONLY-32-BYTES'))
 await context.addCookies([{name:'access_token',value:token,url:process.env.BASE_URL||'http://localhost:3310',httpOnly:true,sameSite:'Lax'}])
 await context.addInitScript(user=>{localStorage.setItem('erp.auth.session.snapshot',JSON.stringify({user}));sessionStorage.setItem('erp.auth.session.snapshot',JSON.stringify({user}));localStorage.setItem('erp_onboarding_completed',JSON.stringify(['admin']));localStorage.setItem('selectedCountry','1')},user)
 const state={mode,kind,stage:'EMPTY',createBody:null as any,createCalls:[] as any[],sendCalls:[] as any[],queries:0,unexpected:[] as string[],held:[] as Array<{route:Route;body:any}>,scriptErrors:[] as string[]}
 page.on('pageerror',error=>state.scriptErrors.push(error.message))
 const lot=()=>({id:batchId,tenant_id:tenant,tipo:kind,estado:state.stage,comprobantes_ids:[doc],idempotency_key:state.createBody?.idempotencyKey,fecha_comunicacion:state.createBody?.fechaComunicacion,fecha_referencia:state.createBody?.fechaReferencia,motivo_baja:state.createBody?.motivoBaja,numero_comunicacion:kind==='RA'?'RA-LOCAL-0001':undefined,numero_resumen:kind==='RC'?'RC-LOCAL-0001':undefined,ticket_sunat:['ENVIADO','RECHAZADO'].includes(state.stage)?'LOCAL-FIXTURE-TICKET':undefined,ultimo_error:state.sendCalls.length===1?'Transporte simulado pendiente':undefined,codigo_respuesta:state.stage==='RECHAZADO'?'LOCAL-SIMULADO':undefined})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),pathname=url.pathname.replace(/^\/backend(?=\/api\/)/,'').replace(/\/$/,'')
  if(!['127.0.0.1','localhost'].includes(url.hostname)||!new Set([new URL(process.env.BASE_URL||'http://localhost:3310').port,new URL(process.env.NEXT_PUBLIC_API_URL||'http://localhost:3311').port]).has(url.port))return route.abort()
  if(!pathname.includes('/api/'))return route.continue()
  const json=(body:any,status=200,headers:any={})=>route.fulfill({status,json:body,headers})
  if(pathname==='/api/auth/profile')return json(user)
  if(pathname==='/api/tenants/me')return json({data:{id:tenant,nombre:'Empresa aislada',pais:'PE',moneda:'PEN',estado:'ACTIVO'}})
  if(pathname==='/api/configuration/context/country')return json({success:true,requiresSetup:false,data:{id:'c0ba0000-0000-4000-8000-000000000005',tenantId:tenant,pais_id:1,pais:'PE',monedaDefecto:'PEN',igvPorcentaje:18,isDemo:false,arcaPuntoVenta:null,arcaCondicionIva:null}})
  if(pathname==='/api/configuration/status')return json({success:true,data:{isComplete:true,completionPercentage:100,isDemo:false,fiscal:{isReady:false,missingItems:['Fixture aislado']}}})
  if(pathname==='/api/demo/status')return json({is_demo:false,is_expired:false})
  if(pathname==='/api/usuarios-sistema/me/permissions')return json({data:[]})
  if(pathname==='/api/documentos/lista')return json({success:true,data:[]})
  if(pathname==='/api/documentos/stats')return json({success:true,data:{totalDocumentos:0,facturas:0,boletas:0,notasCredito:0,contratos:0,pendientesEnvio:0}})
  if(pathname==='/api/cpe/baja/elegibles'||pathname==='/api/cpe/baja/lotes'){
   const requested=(url.searchParams.get('tipo')||'RA') as Kind,isEligible=pathname.endsWith('/elegibles')
   let body:any={success:true,data:isEligible?(state.stage==='EMPTY'?[eligible(requested)]:[]):(state.stage==='EMPTY'?[]:[lot()])}
   if(state.mode==='holdRA'&&requested==='RA'){state.held.push({route,body});return}
   if(isEligible&&state.mode==='503')return json({message:'Fixture de lectura no disponible'},503)
   if(isEligible&&state.mode==='malformed')body={success:true,data:{unexpected:'not-an-array'}}
   return json(body,200,isEligible&&state.mode==='cache'?{'x-erp-offline-cache':'true'}:{})
  }
  const family=kind==='RA'?'comunicacion':'resumen'
  if(pathname==='/api/cpe/baja/'+family&&request.method()==='POST'){
   const body=request.postDataJSON();state.createCalls.push(body)
   if(state.createBody===null){state.createBody=body;state.stage='PENDIENTE';return json({message:'Reserva simulada persistida; firma pendiente'},503)}
   expect(body).toEqual(state.createBody);state.stage='GENERADO';return json({success:true,data:lot()},201)
  }
  if(pathname==='/api/cpe/baja/'+family+'/'+batchId+'/enviar'&&request.method()==='POST'){
   state.sendCalls.push(request.postDataJSON())
   if(state.sendCalls.length===1)return json({message:'Envío simulado no confirmado'},503)
   expect(state.sendCalls[1]).toEqual(state.sendCalls[0]);state.stage='ENVIADO';return json({success:true,data:lot()},201)
  }
  if(pathname==='/api/cpe/baja/'+family+'/'+batchId+'/estado'&&request.method()==='GET'){
   state.queries+=1;state.stage='RECHAZADO';return json({success:true,data:lot()})
  }
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){state.unexpected.push(request.method()+' '+pathname);return route.abort()}
  return json({success:true,data:[]})
 })
 await page.goto('/dashboard/documentos/',{waitUntil:'domcontentloaded'})
 await expect(page.getByRole('tab',{name:'RA · Facturas',exact:true})).toBeVisible()
 if(kind==='RC')await page.getByRole('tab',{name:'RC · Boletas',exact:true}).click()
 return state
}
for(const mode of ['valid','503','malformed','cache','holdRA'])test('Bajas RA/RC aisladas: lectura '+mode,async({page,context})=>{
 test.setTimeout(90000);page.setDefaultTimeout(20000)
 const state=await setup(context,page,'RA',mode)
 try{
  if(mode==='holdRA'){
   await page.getByRole('tab',{name:'RC · Boletas',exact:true}).click();await expect(page.getByLabel('Seleccionar B999-00000001',{exact:true})).toBeVisible()
   const held=state.held.splice(0);expect(held.length).toBeGreaterThanOrEqual(2)
   for(const item of held)await item.route.fulfill({status:200,json:item.body})
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   await expect(page.getByLabel('Seleccionar B999-00000001',{exact:true})).toBeVisible();await expect(page.getByLabel('Seleccionar F999-00000001',{exact:true})).toHaveCount(0)
  }else if(mode==='valid'){
   await expect(page.getByLabel('Seleccionar F999-00000001',{exact:true})).toBeVisible();await page.getByRole('tab',{name:'RC · Boletas',exact:true}).click();await expect(page.getByLabel('Seleccionar B999-00000001',{exact:true})).toBeVisible()
  }else{
   await expect(page.getByRole('alert').filter({hasText:'Verifica los permisos'})).toBeVisible();await expect(page.getByRole('button',{name:'Crear y firmar RA',exact:true})).toBeDisabled()
   await expect(page.getByText('No hay facturas pendientes de baja fiscal.',{exact:true})).toHaveCount(0)
   state.mode='valid';await page.getByRole('button',{name:'Actualizar bajas',exact:true}).click();await expect(page.getByLabel('Seleccionar F999-00000001',{exact:true})).toBeVisible()
  }
  expect(state.unexpected).toEqual([]);expect(state.scriptErrors).toEqual([])
 }finally{for(const item of state.held)await item.route.abort().catch(()=>{});state.held=[]}
})
for(const kind of ['RA','RC'] as const)test('Bajas '+kind+' aisladas: original de firma, envío, retry y ticket',async({page,context})=>{
 test.setTimeout(90000);page.setDefaultTimeout(20000)
 const state=await setup(context,page,kind)
 await page.getByLabel('Seleccionar '+(kind==='RA'?'F999':'B999')+'-00000001',{exact:true}).check()
 await page.getByRole('button',{name:'Crear y firmar '+kind,exact:true}).click()
 await expect(page.getByRole('button',{name:'Reanudar firma',exact:true})).toBeEnabled();expect(state.createCalls).toHaveLength(1)
 await page.getByRole('button',{name:'Reanudar firma',exact:true}).click()
 await expect(page.getByRole('tab',{name:kind==='RA'?'RA · Facturas':'RC · Boletas',exact:true})).toHaveAttribute('aria-selected','true')
 await expect(page.getByRole('button',{name:'Enviar',exact:true})).toBeEnabled();expect(state.createCalls).toHaveLength(2);expect(state.createCalls[1]).toEqual(state.createCalls[0])
 await page.getByRole('button',{name:'Enviar',exact:true}).click();await expect(page.getByRole('button',{name:'Reintentar envío',exact:true})).toBeEnabled()
 await page.getByRole('button',{name:'Reintentar envío',exact:true}).click();await expect(page.getByRole('button',{name:'Consultar ticket',exact:true})).toBeEnabled();expect(state.sendCalls).toHaveLength(2);expect(state.sendCalls[1]).toEqual(state.sendCalls[0])
 await page.getByRole('button',{name:'Consultar ticket',exact:true}).click();await expect(page.getByRole('cell',{name:'RECHAZADO',exact:true})).toBeVisible();expect(state.queries).toBe(1)
 await expect(page.getByRole('button',{name:'Enviar',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Consultar ticket',exact:true})).toHaveCount(0)
 expect(state.unexpected).toEqual([]);expect(state.scriptErrors).toEqual([])
 if(process.env.LOCAL_BAJA_UI_OUTPUT)await fs.writeFile(path.join(process.env.LOCAL_BAJA_UI_OUTPUT,'baja-'+kind+'-fixture-actions.json'),JSON.stringify({scope:'ISOLATED_UI_RA_RC_ACTION_FIXTURES_BEFORE_API_NOT_FISCAL_ACCEPTANCE',success:true,kind,creationOriginalReplayed:true,sendOriginalReplayed:true,terminalFixture:'RECHAZADO',realAPIWriterReached:false,externalFiscalAcceptance:false,businessWrites:0,requests:{create:state.createCalls,send:state.sendCalls,queries:state.queries}},null,2))
})
