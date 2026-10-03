import {test,expect} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
import {loginPeruLocal} from './helpers/peru-login-local';
test('Caja Perú: apertura, ingreso perdido tras commit, cierre, descargas, contabilidad y recuperación de lecturas',async({page,context})=>{
 test.setTimeout(300000);page.setDefaultTimeout(25000);
 const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!;const fixture=JSON.parse(fs.readFileSync(path.join(output,'cash-browser-fixture.json'),'utf8'));
 assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
 assert.match(fixture.tenant,/^[0-9a-f-]{36}$/);assert.match(fixture.caja_id,/^[0-9a-f-]{36}$/);
 const sql=(query:string)=>execFileSync(process.env.PSQL_BIN!,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT!,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
 assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
 const checks:any[]=[];const proof={success:false,remoteWrites:false,complete_acceptance:false,scope:'UI real de caja con API/PostgreSQL locales',checks};
 const save=()=>fs.writeFileSync(path.join(output,'cash-browser.json'),JSON.stringify(proof,null,2));
 await context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'));
 try{
  await loginPeruLocal(page,fixture.email,'Cliente-Local-2026-Only!');
  await page.goto('/dashboard/cajas/');await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading',{name:'Gestión de Cajas'})).toBeVisible();
  await page.getByRole('button',{name:'Abrir Nueva Caja',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByText(fixture.caja_name,{exact:true}).locator('../..').click();
  await dialog.getByRole('spinbutton',{name:'Cantidad de billetes de S/ 100',exact:true}).fill('1');await dialog.getByRole('button',{name:'Confirmar Arqueo',exact:true}).click();
  const [opened]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/cajas/'+fixture.caja_id+'/apertura')),dialog.getByRole('button',{name:'Confirmar Apertura',exact:true}).click()]);expect(opened.status()).toBe(201);
  await expect(dialog).toHaveCount(0);const sessionId=sql(`SELECT id FROM sesiones_caja WHERE caja_id='${fixture.caja_id}'::uuid AND estado='ABIERTA';`);assert.match(sessionId,/^[0-9a-f-]{36}$/);checks.push({operation:'Open from denomination form',passed:true});save();
  await page.getByText(fixture.caja_name,{exact:true}).click();await page.getByRole('button',{name:'Ingreso/Gasto',exact:true}).click();
  const movementDialog=page.getByRole('dialog');await movementDialog.getByRole('spinbutton',{name:'Monto',exact:true}).fill('10');await movementDialog.getByRole('combobox',{name:'Contrapartida contable del movimiento',exact:true}).selectOption(fixture.income_account_id);await movementDialog.getByLabel('Motivo',{exact:true}).fill('Ingreso confirmado desde navegador local');
  // La API real confirma el movimiento; sólo se pierde la respuesta hacia el navegador una vez.
  let capturedKey:string|undefined,createdId:string|undefined,lost=false,replayed=false;const pattern=new RegExp('/cajas/movimientos/manual/'+sessionId+'/?(?:\\?.*)?$');
  await page.route(pattern,async route=>{
   const request=route.request();if(request.method()!=='POST')return route.continue();
   if(!lost){const committed=await route.fetch();expect(committed.status()).toBe(201);createdId=(await committed.json()).data.id;capturedKey=request.headers()['idempotency-key'];expect(capturedKey).toBeTruthy();lost=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({statusCode:503,message:'Confirmación local perdida tras el commit'})});}
   else {expect(request.headers()['idempotency-key']).toBe(capturedKey);replayed=true;await route.continue();}
  });
  const matchMovement=(r:any)=>r.request().method()==='POST'&&new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/cajas/movimientos/manual/'+sessionId);
  const [lostResponse]=await Promise.all([page.waitForResponse(matchMovement),movementDialog.getByRole('button',{name:'Registrar',exact:true}).click()]);expect(lostResponse.status()).toBe(503);
  await expect(movementDialog.getByText('Error registrando movimiento',{exact:true})).toBeVisible();await expect(movementDialog.getByRole('spinbutton',{name:'Monto',exact:true})).toHaveValue('10');await expect(movementDialog.getByRole('combobox',{name:'Contrapartida contable del movimiento',exact:true})).toHaveValue(fixture.income_account_id);await expect(movementDialog.getByLabel('Motivo',{exact:true})).toHaveValue('Ingreso confirmado desde navegador local');
  expect(Number(sql(`SELECT saldo_nuevo FROM movimientos_caja WHERE sesion_caja_id='${sessionId}'::uuid ORDER BY secuencia DESC LIMIT 1;`))).toBe(110);
  const [created]=await Promise.all([page.waitForResponse(matchMovement),movementDialog.getByRole('button',{name:'Registrar',exact:true}).click()]);expect(created.status()).toBe(201);expect((await created.json()).data.id).toBe(createdId);expect(replayed).toBe(true);await expect(movementDialog).toHaveCount(0);await page.unroute(pattern);
  expect(Number(sql(`SELECT count(*) FROM movimientos_caja WHERE sesion_caja_id='${sessionId}'::uuid AND tipo_movimiento='INGRESO';`))).toBe(1);checks.push({operation:'Lost acknowledgement after real commit keeps form and replays same intent once',passed:true});
  expect(Number(sql(`SELECT saldo_nuevo FROM movimientos_caja WHERE sesion_caja_id='${sessionId}'::uuid ORDER BY secuencia DESC LIMIT 1;`))).toBe(110);checks.push({operation:'Manual income with selected posting account',passed:true});save();
  await page.getByText(fixture.caja_name,{exact:true}).click();await page.getByRole('button',{name:'Cerrar Caja',exact:true}).click();const closeDialog=page.getByRole('dialog');
  await closeDialog.getByRole('spinbutton',{name:'Cantidad de billetes de S/ 100',exact:true}).fill('1');await closeDialog.getByRole('spinbutton',{name:'Cantidad de billetes de S/ 10',exact:true}).fill('1');await closeDialog.getByRole('button',{name:'Confirmar Arqueo',exact:true}).click();
  await page.screenshot({path:path.join(output,'cash-close.png'),fullPage:true});
  const [closed]=await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/cajas/cerrar/'+sessionId)),closeDialog.getByRole('button',{name:'Confirmar Cierre',exact:true}).click()]);expect(closed.status()).toBe(201);await expect(closeDialog).toHaveCount(0);
  expect(sql(`SELECT estado||'|'||monto_contado::text FROM sesiones_caja WHERE id='${sessionId}'::uuid;`)).toMatch(/^CERRADA\|110/);checks.push({operation:'Count, preview and advanced close persist amount/cut',passed:true});
  expect(Number(sql(`SELECT count(*) FROM cortes_caja WHERE sesion_caja_id='${sessionId}'::uuid;`))).toBe(1);
  await page.reload();await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(output,'cash-closed.png'),fullPage:true});checks.push({operation:'Reload durable closed state',passed:true});save();
  const cutId=sql(`SELECT id FROM cortes_caja WHERE sesion_caja_id='${sessionId}'::uuid;`);assert.match(cutId,/^[0-9a-f-]{36}$/);
  // La fila más reciente es el corte recién confirmado; se contrasta el ID de la descarga.
  for(const format of ['csv','pdf']){
   const [download,response]=await Promise.all([page.waitForEvent('download'),page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/cajas/cortes/'+cutId+'/'+format)),page.getByRole('button',{name:format.toUpperCase(),exact:true}).first().click()]);
   expect(response.status()).toBe(200);expect(download.suggestedFilename()).toBe('corte-'+cutId+'.'+format);const saved=path.join(output,'cash-browser-cut.'+format);await download.saveAs(saved);const bytes=fs.readFileSync(saved);
   if(format==='pdf')expect(bytes.subarray(0,5).toString()).toBe('%PDF-');else expect(bytes.toString()).toContain('"SESION","ID","'+sessionId+'"');
   checks.push({operation:'Download '+format.toUpperCase()+' from actual durable cut row',passed:true});save();
  }
  const apiDirectory=path.resolve('../erp-api'),requireApi=createRequire(path.join(apiDirectory,'package.json'));
  const consume=(label:string)=>fs.writeFileSync(path.join(output,label+'.log'),execFileSync(process.execPath,[requireApi.resolve('ts-node/dist/bin.js'),'--transpile-only','tests/e2e/helpers/local-api-harness.ts','--accounting-drain'],{cwd:apiDirectory,env:process.env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:5000000}));
  consume('cash-browser-accounting-first');
  const entries=JSON.parse(sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'status',e.status,'entries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=e.event_id),'balanced',(SELECT bool_and(a.total_debe=a.total_haber AND a.estado='CONFIRMADO') FROM asientos_contables a WHERE a.source_event_id=e.event_id)) ORDER BY e.created_at),'[]') FROM outbox_events e WHERE tenant_id='${fixture.tenant}'::uuid AND e.payload->>'sesionCajaId'='${sessionId}';`));
  fs.writeFileSync(path.join(output,'cash-browser-accounting.json'),JSON.stringify(entries,null,2));
  expect(entries.some((e:any)=>e.event_type==='caja.movimiento_manual.registrado'&&e.status==='completed'&&e.entries===1&&e.balanced)).toBe(true);
  const countEntries=()=>sql(`SELECT count(*) FROM asientos_contables WHERE tenant_id='${fixture.tenant}'::uuid;`),beforeEntries=countEntries();consume('cash-browser-accounting-retry');expect(countEntries()).toBe(beforeEntries);
  checks.push({operation:'Real accounting worker confirms balanced browser income exactly once',passed:true});save();
  // Corte real de permisos por lectura; cada componente debe limpiar su error al recuperarse.
  const outage=async({table,endpoint,message,ready}:{table:string,endpoint:string,message:RegExp,ready:()=>any})=>{
   expect(sql(`SELECT has_table_privilege('service_role','public.${table}','SELECT');`)).toBe('t');
   try{sql(`REVOKE SELECT ON public.${table} FROM service_role;`);await page.reload();await expect(page.getByText(message).first()).toBeVisible({timeout:25000});}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}
   const box=page.getByText(message).first();
   const [restored]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith(endpoint)),box.getByRole('button',{name:'Reintentar',exact:true}).click()]);expect(restored.status()).toBe(200);
   const cleared=await expect(page.getByText(message)).toHaveCount(0,{timeout:5000}).then(()=>true,()=>false);
   const shown=cleared&&await expect(ready()).toBeVisible({timeout:5000}).then(()=>true,()=>false);
   await page.screenshot({path:path.join(output,'cash-recovery-'+table+'.png'),fullPage:true});
   checks.push({operation:'Retry after real '+table+' SELECT outage clears error and shows durable data',endpoint,retry_http_status:restored.status(),error_cleared:cleared,data_visible:shown,passed:cleared&&shown});save();
  };
  await outage({table:'sesiones_caja',endpoint:'/cajas/sesiones',message:/Error cargando sesiones/,ready:()=>page.getByText(fixture.caja_name,{exact:true}).first()});
  await page.reload();await page.waitForLoadState('networkidle');
  await outage({table:'cortes_caja',endpoint:'/cajas/cortes',message:/No se pudieron cargar los cortes/,ready:()=>page.getByRole('button',{name:'CSV',exact:true}).first()});
  const failed=checks.filter(c=>c.passed===false);expect(failed,JSON.stringify(failed)).toEqual([]);
  proof.success=true;
 }finally{save();}
});
