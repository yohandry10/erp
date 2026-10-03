import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
test('Perú: logo real conserva recuperación de carga y borrado después de respuestas perdidas',async ({page,context})=>{
 test.setTimeout(240000);page.setDefaultTimeout(25000);
 expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');
 expect(process.env.PGHOST).toBe('127.0.0.1');expect(process.env.PGDATABASE).toBe('erp_e2e');
 const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!;
 const fixture=JSON.parse(fs.readFileSync(path.join(output,'configuration-admin-fixture.json'),'utf8'));
 const tenant=fixture.tenant.id??fixture.tenant.tenant_id??fixture.tenant;
 expect(tenant).toMatch(/^[0-9a-f-]{36}$/i);
 const sql=(query:string)=>execFileSync(process.env.PSQL_BIN!,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT!,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
 expect(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;")).toBe('erp_e2e|DEV|localerpephemeralqax');
 const proof={success:false,remoteWrites:false,scope:'UI y Storage real local; sólo el origen público contractual se adapta al gateway loopback',checks:[] as string[],unexpected_errors:[] as string[]};
 page.on('pageerror',error=>proof.unexpected_errors.push(error.message));
 const gateway=process.env.LOCAL_POSTGREST_URL!;
 expect(new URL(gateway).hostname).toBe('127.0.0.1');
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin==='https://wypnbcptofqdmoynlonq.supabase.co'&&url.pathname.startsWith('/storage/v1/object/public/company-assets/')){
   const actual=await context.request.get(gateway+url.pathname);return route.fulfill({response:actual});
  }
  return ['127.0.0.1','localhost','[::1]'].includes(url.hostname)?route.continue():route.abort('blockedbyclient');
 });
 const pathname=(value:{url():string})=>new URL(value.url()).pathname.replace(/^\/backend/,'').replace(/\/$/,'');
 const isLogo=(value:{url():string})=>pathname(value)==='/api/configuration/empresa/logo';
 try{
  await page.goto('/login/');await page.locator('#email').fill(fixture.email);await page.locator('#password').fill('Cliente-Local-2026-Only!');
  for(let attempt=0;attempt<2;attempt++){
   const [response]=await Promise.all([page.waitForResponse(r=>pathname(r)==='/api/auth/login'&&r.request().method()==='POST'),page.getByRole('button',{name:/iniciar sesi[oó]n/i}).click()]);
   if(response.status()===201)break;
   expect(response.status()).toBe(429);const seconds=Number(response.headers()['retry-after']);expect(seconds).toBeGreaterThanOrEqual(1);expect(seconds).toBeLessThanOrEqual(60);await page.waitForTimeout(seconds*1000);
  }
  await page.waitForURL('**/dashboard/**',{timeout:25000});
  await page.goto('/dashboard/configuracion/empresa/');await expect(page.getByLabel('Archivo de logo')).toBeAttached({timeout:30000});
  sql("UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=false WHERE singleton;");
  let uploadKey:string|undefined,assetId:string|undefined,deleteKey:string|undefined;
  let uploadInterrupted=false,deleteInterrupted=false;
  const transport=await context.newCDPSession(page),faultErrors:string[]=[],faultTasks:Promise<void>[]=[];
  transport.on('Fetch.requestPaused',event=>{
   faultTasks.push((async()=>{
    try{
     const method=event.request.method;
     if(!isLogo({url:()=>event.request.url})||(method!=='POST'&&method!=='DELETE')
       ||(method==='POST'&&uploadInterrupted)||(method==='DELETE'&&deleteInterrupted)){
      await transport.send('Fetch.continueRequest',{requestId:event.requestId});return;
     }
     expect(event.responseStatusCode).toBe(method==='POST'?201:200);
     const header=Object.entries(event.request.headers).find(([key])=>key.toLowerCase()==='idempotency-key')?.[1];
     const original=await transport.send('Fetch.getResponseBody',{requestId:event.requestId});
     const committed=JSON.parse(original.base64Encoded?Buffer.from(original.body,'base64').toString():original.body);
     if(method==='POST'){uploadKey=String(header);assetId=committed.data.asset_id;uploadInterrupted=true;}
     else{deleteKey=String(header);deleteInterrupted=true;}
     // El navegador ya envió su multipart original y la API confirmó el commit.
     await transport.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({message:method==='POST'?'Carga local confirmada; respuesta interrumpida':'Borrado local confirmado; respuesta interrumpida'})).toString('base64')});
    }catch(error){faultErrors.push(error instanceof Error?error.message:String(error));await transport.send('Fetch.continueRequest',{requestId:event.requestId}).catch(()=>{});}
   })());
  });
  await transport.send('Fetch.enable',{patterns:[{urlPattern:'*/api/configuration/empresa/logo*',requestStage:'Response'}]});
  const fileInput=page.getByLabel('Archivo de logo'),red=path.join(output,'logo-local-red.png');
  const [lost]=await Promise.all([page.waitForResponse(r=>isLogo(r)&&r.request().method()==='POST'),fileInput.setInputFiles(red)]);expect(lost.status()).toBe(503);
  await expect(page.getByText('Carga local confirmada; respuesta interrumpida',{exact:true})).toBeVisible();
  expect(sql(`SELECT count(*) FROM empresa_logo_assets WHERE tenant_id='${tenant}'::uuid AND estado='ACTIVA';`)).toBe('1');
  const [replay]=await Promise.all([page.waitForResponse(r=>isLogo(r)&&r.request().method()==='POST'),fileInput.setInputFiles(red)]);expect(replay.status()).toBe(201);expect(replay.request().headers()['idempotency-key']).toBe(uploadKey);expect((await replay.json()).data.asset_id).toBe(assetId);
  await expect(page.getByText('Logo guardado correctamente.',{exact:true})).toBeVisible();
  await page.reload();const logo=page.getByAltText('Logo de la empresa',{exact:true});await expect(logo).toBeVisible();await expect.poll(()=>logo.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(1);
  proof.checks.push('Carga perdida y replay preservan intención/asset; empresa e imagen sobreviven recarga');
  const [replacement]=await Promise.all([page.waitForResponse(r=>isLogo(r)&&r.request().method()==='POST'),page.getByLabel('Archivo de logo').setInputFiles(path.join(output,'logo-local-blue.png'))]);expect(replacement.status()).toBe(201);
  await expect(page.getByText('Logo guardado correctamente.',{exact:true})).toBeVisible();
  expect(sql(`SELECT count(*) FROM storage.objects WHERE bucket_id='company-assets' AND name LIKE '${tenant}/logos/%';`)).toBe('1');
  proof.checks.push('Reemplazo real conserva un objeto activo y limpia el anterior');
  await page.getByRole('button',{name:'Quitar',exact:true}).click();
  const [deleteLost]=await Promise.all([page.waitForResponse(r=>isLogo(r)&&r.request().method()==='DELETE'),page.getByRole('button',{name:'Quitar logo',exact:true}).click()]);expect(deleteLost.status()).toBe(503);
  await expect(page.getByText('Borrado local confirmado; respuesta interrumpida',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Quitar',exact:true}).click();
  const [deleteReplay]=await Promise.all([page.waitForResponse(r=>isLogo(r)&&r.request().method()==='DELETE'),page.getByRole('button',{name:'Quitar logo',exact:true}).click()]);expect(deleteReplay.status()).toBe(200);expect(deleteReplay.request().headers()['idempotency-key']).toBe(deleteKey);
  await page.reload();await expect(page.getByAltText('Logo de la empresa',{exact:true})).toHaveCount(0);
  expect(sql(`SELECT coalesce(logo_url,'') FROM empresa_config WHERE tenant_id='${tenant}'::uuid;`)).toBe('');
  expect(sql(`SELECT count(*) FROM storage.objects WHERE bucket_id='company-assets' AND name LIKE '${tenant}/logos/%';`)).toBe('0');
  proof.checks.push('Borrado perdido y replay conservan intención; configuración/objeto eliminados tras recarga');
  await Promise.all(faultTasks);expect(faultErrors).toEqual([]);await transport.send('Fetch.disable');
  expect(proof.unexpected_errors).toEqual([]);proof.success=true;
 }finally{
  sql("UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;");
  fs.writeFileSync(path.join(output,'browser-company-logo.json'),JSON.stringify(proof,null,2));
 }
});
