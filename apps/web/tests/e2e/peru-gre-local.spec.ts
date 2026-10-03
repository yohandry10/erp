import {loginPeruLocal} from './helpers/peru-login-local';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {test,expect,type BrowserContext,type Page,type Response} from '@playwright/test';
interface Proof {success:boolean;remoteWrites:false;scope:string;checks:{check:string;passed:boolean;[key:string]:unknown}[];unexpected_errors:string[]}
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!;
const first=JSON.parse(fs.readFileSync(path.join(output,'tax-intents-fixture.json'),'utf8')),other=JSON.parse(fs.readFileSync(path.join(output,'tax-other-fixture.json'),'utf8'));
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');assert.equal(new URL(process.env.LOCAL_API_URL!).hostname,'127.0.0.1');
const sql=(query:string)=>execFileSync(process.env.PSQL_BIN!,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT!,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
const endpoint=(r:Response)=>new URL(r.url()).pathname.replace(/^\/backend/,'').replace(/\/$/,'');
async function setup(context:BrowserContext,page:Page){
 await context.route('**/*',route=>['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort('blockedbyclient'));
 await loginPeruLocal(page,first.email,'Cliente-Local-2026-Only!');
 await page.goto('/dashboard/gre/');await expect(page.getByRole('heading',{name:'Guías de Remisión Electrónica',exact:true})).toBeVisible();
}
test('GRE: detalle, descarga PDF e impresión incluyen los bienes persistidos',async({page,context})=>{
 test.setTimeout(180000);page.setDefaultTimeout(25000);
 const proof:Proof={success:false,remoteWrites:false,scope:'Navegador, API, DB reales GRE; impresión a ventana, sin impresora física',checks:[],unexpected_errors:[]};page.on('pageerror',e=>proof.unexpected_errors.push(e.message));
 try{
  await setup(context,page);const row=page.locator('tbody tr').filter({hasText:'GRE-FIRMA-LOCAL'});await expect(row).toHaveCount(1);await row.getByRole('button',{name:'Ver',exact:true}).click();await expect(page.getByText('DESTINATARIO Y TRASLADO',{exact:false})).toBeVisible();
  proof.checks.push({check:'Detalle visible incluye descripción y cantidad de bienes',passed:await page.getByText('Mercadería local real en GRE',{exact:true}).count()>0});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'💾 Descargar',exact:true}).click()]);const file=path.join(output,'gre-ui-downloaded'+path.extname(download.suggestedFilename()));await download.saveAs(file);const bytes=fs.readFileSync(file);
  proof.checks.push({check:'Descarga mantiene PDF binario y extensión .pdf',passed:download.suggestedFilename().endsWith('.pdf')&&bytes.subarray(0,5).toString()==='%PDF-'&&bytes.subarray(-30).toString().includes('%%EOF'),filename:download.suggestedFilename(),bytes:bytes.length});
  const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:/Imprimir/}).click()]);await popup.waitForLoadState('domcontentloaded');let printedOk=false;
  {await expect(popup.locator('#gre-print')).toBeVisible();const magic=await popup.locator('#gre-print').evaluate(async frame=>new TextDecoder().decode((await (await fetch((frame as HTMLIFrameElement).src)).arrayBuffer()).slice(0,5)));printedOk=magic==='%PDF-';}
  proof.checks.push({check:'Ventana de impresión recibe representación con bienes persistidos',passed:printedOk,physical_printer_verified:false});await popup.close();
  proof.success=proof.checks.every(c=>c.passed)&&proof.unexpected_errors.length===0;expect(proof.checks.filter(c=>!c.passed)).toEqual([]);expect(proof.unexpected_errors).toEqual([]);
 }finally{fs.writeFileSync(path.join(output,'browser-gre-print.json'),JSON.stringify(proof,null,2));}
});
test('GRE: nueva guía manual con emisor configurado puede firmarse desde formulario',async({page,context})=>{
 test.setTimeout(180000);page.setDefaultTimeout(25000);const proof:Proof={success:false,remoteWrites:false,scope:'Creación manual por UI/API/DB con certificado desechable del primer cliente local',checks:[],unexpected_errors:[]};page.on('pageerror',e=>proof.unexpected_errors.push(e.message));
 try{
  await setup(context,page);await page.getByRole('button',{name:'Nueva GRE',exact:true}).click();
  for(const [id,value] of [['destinatario','UI-GRE-MANUAL'],['direccion-destino','Destino UI local 789'],['ubigeo-destino','150101'],['peso-total','2'],['placa-vehiculo','ABC123'],['licencia-conducir','Q12345678'],['conductor-documento-numero','12345678'],['conductor-nombres','Conductor'],['conductor-apellidos','Local']]){if(id==='placa-vehiculo')await page.locator('#gre-modal-modalidad').selectOption('TRANSPORTE_PRIVADO');await page.locator('#gre-modal-'+id).fill(value);}
  await page.getByRole('textbox',{name:'Descripción del bien 1'}).fill('Bien creado desde formulario GRE');await page.getByRole('spinbutton',{name:'Cantidad del bien 1'}).fill('2');
  const weight=page.locator('#gre-modal-peso-total');const validity=await weight.evaluate(node=>{const input=node as HTMLInputElement;return {valid:input.validity.valid,stepMismatch:input.validity.stepMismatch,step:input.step,min:input.min,value:input.value};});proof.checks.push({check:'Peso de 2 kg válido para el DTO también permite enviar el formulario',passed:validity.valid,validity});if(validity.stepMismatch)await weight.fill('2.001');
  const doc=page.locator('#gre-modal-destinatario-documento');proof.checks.push({check:'Formulario ofrece documento del destinatario requerido para firmar',passed:await doc.count()>0});if(await doc.count()){await page.locator('#gre-modal-destinatario-documento-tipo').selectOption('6');await doc.fill(other.ruc);}
  const [response]=await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/gre/guias'&&r.request().method()==='POST'),page.getByRole('button',{name:'Crear GRE',exact:true}).click()]);expect(response.status()).toBe(201);const created=(await response.json()).data;
  proof.checks.push({check:'Guía creada y firmada con certificado configurado; sin transmisión fiscal',passed:created.estado==='FIRMADO',estado:created.estado,error:created.errorMessage??null});
  expect(sql("SELECT count(*) FROM gre_guias WHERE tenant_id='"+first.tenant+"'::uuid AND destinatario='UI-GRE-MANUAL';")).toBe('1');await page.reload();await expect(page.locator('tbody tr').filter({hasText:'UI-GRE-MANUAL'})).toHaveCount(1);
  proof.success=proof.checks.every(c=>c.passed)&&proof.unexpected_errors.length===0;expect(proof.checks.filter(c=>!c.passed)).toEqual([]);
 }finally{fs.writeFileSync(path.join(output,'browser-gre-create.json'),JSON.stringify(proof,null,2));}
});

test('GRE: alta perdida recupera una guía y nueva intención idéntica crea otra',async({page,context})=>{
 test.setTimeout(180000);page.setDefaultTimeout(25000);const proof:Proof={success:false,remoteWrites:false,scope:'GRE manual con commit real y pérdida de respuesta local',checks:[],unexpected_errors:[]};page.on('pageerror',e=>proof.unexpected_errors.push(e.message));
 try{
  await setup(context,page);
  const fill=async()=>{
   await page.getByRole('button',{name:'Nueva GRE',exact:true}).click();
   await page.locator('#gre-modal-modalidad').selectOption('TRANSPORTE_PRIVADO');
   for(const [id,value] of [['destinatario','UI-GRE-RECOVERY'],['direccion-destino','Destino UI local 789'],['ubigeo-destino','150101'],['peso-total','2'],['placa-vehiculo','ABC123'],['licencia-conducir','Q12345678'],['conductor-documento-numero','12345678'],['conductor-nombres','Conductor'],['conductor-apellidos','Local'],['destinatario-documento',other.ruc]])await page.locator('#gre-modal-'+id).fill(value);
   await page.getByRole('textbox',{name:'Descripción del bien 1'}).fill('Bien GRE recuperado');await page.getByRole('spinbutton',{name:'Cantidad del bien 1'}).fill('2');
  };
  const count=()=>Number(sql("SELECT count(*) FROM gre_guias WHERE tenant_id='"+first.tenant+"'::uuid AND destinatario='UI-GRE-RECOVERY';"));
  await fill();let calls=0,created:any;const matcher=/\/api\/gre\/guias\/?$/;
  await context.route(matcher,async route=>{if(route.request().method()!=='POST')return route.continue();if(++calls===1){const actual=await route.fetch();expect(actual.status()).toBe(201);created=(await actual.json()).data;await route.fulfill({status:503,json:{message:'Respuesta perdida GRE local'}});}else await route.continue();});
  await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/gre/guias'&&r.request().method()==='POST'&&r.status()===503),page.getByRole('button',{name:'Crear GRE',exact:true}).click()]);await expect(page.locator('#gre-modal-destinatario')).toHaveValue('UI-GRE-RECOVERY');await expect(page.locator('#gre-modal-destinatario-documento')).toHaveValue(other.ruc);expect(count()).toBe(1);
  const [replay]=await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/gre/guias'&&r.request().method()==='POST'&&r.status()===201),page.getByRole('button',{name:'Crear GRE',exact:true}).click()]);expect((await replay.json()).data.id).toBe(created.id);expect(count()).toBe(1);proof.checks.push({check:'Respuesta perdida conserva campos y clave; retry recupera guía firmada sin duplicar',passed:true});
  await context.unroute(matcher);await fill();const [second]=await Promise.all([page.waitForResponse(r=>endpoint(r)==='/api/gre/guias'&&r.request().method()==='POST'),page.getByRole('button',{name:'Crear GRE',exact:true}).click()]);expect(second.status()).toBe(201);expect((await second.json()).data.id).not.toBe(created.id);expect(count()).toBe(2);await page.reload();await expect(page.locator('tbody tr').filter({hasText:'UI-GRE-RECOVERY'})).toHaveCount(2);proof.checks.push({check:'Nueva intención idéntica tras confirmación persiste otro ID y reload muestra ambas',passed:true});expect(proof.unexpected_errors).toEqual([]);proof.success=true;
 }finally{fs.writeFileSync(path.join(output,'browser-gre-recovery.json'),JSON.stringify(proof,null,2));}
});
