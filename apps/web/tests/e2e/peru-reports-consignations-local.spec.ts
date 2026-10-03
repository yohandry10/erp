import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!;
const first=JSON.parse(fs.readFileSync(path.join(output,'tax-intents-fixture.json'),'utf8')),other=JSON.parse(fs.readFileSync(path.join(output,'tax-other-fixture.json'),'utf8'));
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');assert.equal(new URL(process.env.LOCAL_API_URL!).hostname,'127.0.0.1');
const sql=(query:string)=>execFileSync(process.env.PSQL_BIN!,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT!,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
const endpoint=(r:{url():string})=>new URL(r.url()).pathname.replace(/^\/backend/,'').replace(/\/$/,'');
async function setup(context:any,page:any,fixture:any){
 await context.route('**/*',(route:any)=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'));
 await page.goto('/login/');await page.locator('#email').fill(fixture.email);await page.locator('#password').fill('Cliente-Local-2026-Only!');
 for(let attempt=0;attempt<2;attempt++){
  const [login]=await Promise.all([page.waitForResponse((r:any)=>endpoint(r)==='/api/auth/login'&&r.request().method()==='POST'),page.getByRole('button',{name:'Iniciar Sesión',exact:true}).click()]);
  if(login.status()===429&&attempt===0){const seconds=Number(await login.headerValue('retry-after'));expect(seconds).toBeGreaterThan(0);expect(seconds).toBeLessThanOrEqual(60);await new Promise(resolve=>setTimeout(resolve,seconds*1000));continue;}
  expect(login.status()).toBe(201);await expect(page).toHaveURL(/\/dashboard\//,{timeout:25000});break;
 }
}
test('Consignaciones: respuesta perdida recupera entrega y nueva intención idéntica crea otra',async({page,context})=>{
 test.setTimeout(240000);page.setDefaultTimeout(25000);
 const proof:{success:boolean;remoteWrites:boolean;scope:string;checks:Array<{check:string;passed:boolean}>;unexpected_errors:string[]}={success:false,remoteWrites:false,scope:'Navegador/API/PostgreSQL reales locales de consignaciones',checks:[],unexpected_errors:[]};page.on('pageerror',e=>proof.unexpected_errors.push(e.message));
 try{
  await setup(context,page,first);await page.goto('/dashboard/contabilidad/consignaciones/');await expect(page.getByRole('heading',{name:'Mercadería en consignación'})).toBeVisible();
  const fill=async()=>{await page.getByRole('button',{name:'Nueva consignación'}).click();await page.getByRole('textbox',{name:/Consignatario/}).fill('UI-ENTREGA-IDENTICA');await page.getByRole('spinbutton',{name:/Cantidad/}).fill('2');await page.getByRole('spinbutton',{name:/Valor unitario/}).fill('12.34');};
  const count=()=>Number(sql(`SELECT count(*) FROM registro_consignaciones WHERE tenant_id='${first.tenant}'::uuid AND consignatario_nombre='UI-ENTREGA-IDENTICA';`));const before=count();
  await fill();let calls=0,created:any;const matcher=/\/api\/contabilidad\/registro-consignaciones\/?$/;
  await context.route(matcher,async route=>{if(route.request().method()!=='POST')return route.continue();if(++calls===1){const actual=await route.fetch();expect(actual.status(),await actual.text()).toBe(201);created=(await actual.json()).data;await route.fulfill({status:503,json:{message:'Respuesta perdida local de consignación'}});}else await route.continue();});
  await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/contabilidad/registro-consignaciones'&&r.request().method()==='POST'&&r.status()===503),page.getByRole('button',{name:'Guardar',exact:true}).click()]);await expect(page.getByRole('textbox',{name:/Consignatario/})).toHaveValue('UI-ENTREGA-IDENTICA');expect(count()).toBe(before+1);
  const [replay]=await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/contabilidad/registro-consignaciones'&&r.request().method()==='POST'&&r.status()===201),page.getByRole('button',{name:'Guardar',exact:true}).click()]);expect((await replay.json()).data.id).toBe(created.id);expect(count()).toBe(before+1);proof.checks.push({check:'Fallo tras commit conserva campos y retry recupera una sola entrega',passed:true});
  await context.unroute(matcher);await fill();const [newDelivery]=await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/contabilidad/registro-consignaciones'&&r.request().method()==='POST'),page.getByRole('button',{name:'Guardar',exact:true}).click()]);expect(newDelivery.status()).toBe(201);expect((await newDelivery.json()).data.id).not.toBe(created.id);expect(count()).toBe(before+2);proof.checks.push({check:'Nueva entrega idéntica después de éxito tiene ID propio',passed:true});
  await page.reload();await expect(page.locator('tbody tr').filter({hasText:'UI-ENTREGA-IDENTICA'})).toHaveCount(2);expect(proof.unexpected_errors).toEqual([]);proof.success=true;
 }finally{fs.writeFileSync(path.join(output,'browser-consignations.json'),JSON.stringify(proof,null,2));}
});
test('Consolidación: controladora registra su tasa y ambas empresas generan reporte desde UI',async({page,context,browser})=>{
 test.setTimeout(300000);page.setDefaultTimeout(25000);
 const proof:{success:boolean;remoteWrites:boolean;scope:string;checks:Array<{check:string;passed:boolean}>;unexpected_errors:string[]}={success:false,remoteWrites:false,scope:'Navegador/API/PostgreSQL reales locales de consolidación',checks:[],unexpected_errors:[]};page.on('pageerror',e=>proof.unexpected_errors.push(e.message));let invitedContext:any;
 try{
  await setup(context,page,first);await page.goto('/dashboard/contabilidad/consolidacion/');await expect(page.getByRole('heading',{name:'Consolidación y reportes configurables'})).toBeVisible();
  await page.getByRole('textbox',{name:'Código',exact:true}).first().fill('UI-GROUP-USD');await page.getByRole('textbox',{name:'Nombre del grupo'}).fill('UI grupo USD');const presentation=page.getByRole('textbox',{name:'Moneda de presentación'});await presentation.fill('USD');
  const [created]=await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/contabilidad/consolidacion/grupos'&&r.request().method()==='POST'),presentation.locator('..').getByRole('button').click()]);expect(created.status()).toBe(201);const group=(await created.json()).data;
  await page.getByRole('combobox',{name:'Grupo',exact:true}).selectOption(group.id);await page.getByRole('textbox',{name:'RUC exacto de la empresa'}).fill(other.ruc);
  const [invite]=await Promise.all([page.waitForResponse(r=>endpoint(r).endsWith('/invitaciones')&&r.request().method()==='POST'),page.getByRole('button',{name:'Invitar',exact:true}).click()]);expect(invite.status()).toBe(201);
  invitedContext=await browser.newContext({baseURL:process.env.BASE_URL});const invited=await invitedContext.newPage();await setup(invitedContext,invited,other);await invited.goto('/dashboard/contabilidad/consolidacion/');await invited.getByRole('combobox',{name:'Grupo',exact:true}).selectOption(group.id);
  const [accepted]=await Promise.all([invited.waitForResponse((r:any)=>endpoint(r).endsWith('/respuesta')&&r.request().method()==='POST'),invited.getByRole('button',{name:'Aceptar',exact:true}).click()]);expect(accepted.status()).toBe(201);proof.checks.push({check:'Grupo e invitación creados en UI; otra empresa acepta por su sesión',passed:true});
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();const rateMember=page.getByRole('combobox',{name:'Tenant miembro',exact:true}).nth(1);
  await expect(rateMember.locator(`option[value="${first.tenant}"]`)).toHaveCount(1);
  for(const [tenant,factor] of [[first.tenant,'0.25'],[other.tenant,'0.5']]){
   await rateMember.selectOption(tenant);await page.locator('input[aria-label="Fecha"]').first().fill('2026-09-30');await page.getByRole('combobox',{name:'Tipo',exact:true}).first().selectOption('PROMEDIO');const field=page.getByRole('spinbutton',{name:'Factor',exact:true});await field.fill(factor);
   const [rate]=await Promise.all([page.waitForResponse(r=>endpoint(r).endsWith('/tasas')&&r.request().method()==='POST'),field.locator('..').getByRole('button').click()]);expect(rate.status()).toBe(201);
  }
  proof.checks.push({check:'Controladora y miembro registran tasas necesarias por UI',passed:true});
  await page.getByRole('textbox',{name:'Código',exact:true}).nth(1).fill('UI-REPORT-USD');await page.getByRole('textbox',{name:'Nombre',exact:true}).first().fill('UI reporte real USD');
  const [saved]=await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/contabilidad/reportes-configurables'&&r.request().method()==='POST'),page.getByRole('button',{name:'Guardar definición atómica'}).click()]);expect(saved.status()).toBe(201);const report=(await saved.json()).data;
  await page.getByRole('combobox',{name:'Reporte',exact:true}).selectOption(report.id);await page.locator('input[aria-label="Fecha desde"]').fill('2026-09-01');await page.locator('input[aria-label="Fecha hasta"]').fill('2026-09-30');
  const [generated]=await Promise.all([page.waitForResponse(r=>endpoint(r).endsWith('/generar')),page.getByRole('button',{name:'Generar',exact:true}).click()]);expect(generated.status(),await generated.text()).toBe(200);const value=(await generated.json()).data;expect(value.empresas_incluidas).toBe(2);expect(Number(value.lineas.find((l:any)=>l.codigo==='RESULTADO').valor)).toBe(125);
  await expect(page.locator('tr').filter({has:page.getByText('RESULTADO',{exact:true})})).toContainText('125.00');proof.checks.push({check:'Definición y fórmula UI muestran 125.00 de dos empresas con fuentes reales',passed:true});
  await page.reload();await expect(page.getByRole('combobox',{name:'Grupo'}).locator(`option[value="${group.id}"]`)).toHaveCount(1);expect(proof.unexpected_errors).toEqual([]);proof.success=true;
 }finally{await invitedContext?.close();fs.writeFileSync(path.join(output,'browser-consolidation.json'),JSON.stringify(proof,null,2));}
});
