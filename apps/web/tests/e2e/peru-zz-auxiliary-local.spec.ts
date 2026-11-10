import {test,expect,type Page,type BrowserContext} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {loginPeruLocal} from './helpers/peru-login-local'
import {readLocalSql,consumeLocalAccounting} from './helpers/peru-local-accounting'

let proof:{scope:string;complete:boolean;steps:any[];page_errors:string[];remoteWrites:boolean}
const sql=(text:string)=>readLocalSql(text.trim().replace(/;$/,'')+';')
const json=(text:string)=>JSON.parse(sql(text))
test.beforeAll(()=>{proof={scope:'FRESH_REAL_UI_OPEN_ITEMS_ANALYTICS_AND_BANK_TRANSFER_SQL',complete:false,steps:[],page_errors:[],remoteWrites:false}})
test.afterAll(()=>{proof.complete=proof.steps.length===4&&!proof.page_errors.length;fs.writeFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,'auxiliary-functional-ui.json'),JSON.stringify(proof,null,2))})
async function start(page:Page,context:BrowserContext){
 expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456')
 page.setDefaultTimeout(25000);page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>proof.page_errors.push(e.message))
 await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort('blockedbyclient'))
 const f=JSON.parse(fs.readFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,'accounting-first-fixture.json'),'utf8'))
 expect(f.non_demo).toBe(true)
 const auth=await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!')
 const token=auth.access_token??auth.data?.access_token;expect(token).toBeTruthy()
 const post=async(endpoint:string,data:any)=>{const r=await page.request.post(process.env.LOCAL_API_URL+'/api/'+endpoint,{headers:{Authorization:'Bearer '+token,'Idempotency-Key':data.idempotency_key||randomUUID()},data});expect(r.status(),endpoint).toBe(201);const body=await r.json();return body.data??body}
 return {f,post}
}

test('Contabilidad Perú: concilia dos partidas confirmadas desde UI y conserva el resultado al recargar',async({page,context})=>{
 test.setTimeout(180000);const {f}=await start(page,context)
 const lines=json(`SELECT jsonb_agg(jsonb_build_object('id',d.id,'cuenta',d.cuenta_id,'concepto',d.concepto) ORDER BY d.id) FROM detalle_asientos d JOIN asientos_contables a ON a.id=d.asiento_id AND a.tenant_id=d.tenant_id JOIN plan_cuentas p ON p.id=d.cuenta_id AND p.tenant_id=d.tenant_id WHERE d.tenant_id='${f.tenant}' AND a.referencia='CONCILIA-LOCAL' AND a.estado='CONFIRMADO' AND p.conciliable`)
 expect(lines).toHaveLength(2);expect(lines[0].cuenta).toBe(lines[1].cuenta)
 await page.goto('/dashboard/contabilidad/partidas/');await page.getByRole('combobox').selectOption(lines[0].cuenta);await page.getByRole('button',{name:'Ver partidas',exact:true}).click()
 for(const line of lines)await page.getByRole('row').filter({hasText:line.concepto}).getByRole('checkbox').check()
 const [saved]=await Promise.all([page.waitForResponse(r=>/\/api\/contabilidad\/conciliaciones-partidas\/?$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST'),page.getByRole('button',{name:'Conciliar (2)',exact:true}).click()])
 expect(saved.status()).toBe(201);await expect(page.getByText(/Conciliación TOTAL por 50/)).toBeVisible()
 const ids=lines.map((r:any)=>"'"+r.id+"'").join(',')
 expect(sql(`SELECT count(*) FROM conciliaciones_partidas_lineas WHERE tenant_id='${f.tenant}' AND detalle_asiento_id IN (${ids})`)).toBe('2')
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('combobox').selectOption(lines[0].cuenta);await page.getByRole('button',{name:'Ver partidas',exact:true}).click()
 for(const line of lines)await expect(page.getByRole('row').filter({hasText:line.concepto})).toHaveCount(0)
 proof.steps.push({name:'real_UI_open_items_pair_total50_unique_reload',result:'PASS',lines:lines.map((r:any)=>r.id)})
})

test('Contabilidad Perú: guarda y elimina el reparto analítico de un borrador sin cambiar sus importes',async({page,context})=>{
 test.setTimeout(180000);const {f,post}=await start(page,context),suffix=randomUUID().slice(0,8)
 const account=(code:string)=>sql(`SELECT id FROM plan_cuentas WHERE tenant_id='${f.tenant}' AND codigo='${code}' AND activo ORDER BY id LIMIT 1`)
 const today=sql(`SELECT app.hoy_tenant('${f.tenant}')`),center=sql(`SELECT id FROM centros_costo WHERE tenant_id='${f.tenant}' AND activo ORDER BY id LIMIT 1`);expect(center).toMatch(/^[0-9a-f-]{36}$/i)
 const draft=await post('contabilidad/asiento-contable',{fecha:today,concepto:'Analítica UI '+suffix,referencia:'AUX-UI-'+suffix,estado:'BORRADOR',detalles:[{cuenta_id:account('63'),debe:12.34,haber:0,concepto:'Gasto analítico UI '+suffix},{cuenta_id:account('1041'),debe:0,haber:12.34,concepto:'Contrapartida UI'}]})
 const id=draft.id??draft.asiento?.id,detail=sql(`SELECT id FROM detalle_asientos WHERE asiento_id='${id}' AND debe=12.34`)
 await page.goto('/dashboard/contabilidad/asientos/'+id+'/');await page.getByRole('row').filter({hasText:'Gasto analítico UI '+suffix}).getByRole('button',{name:'Distribuir',exact:true}).click()
 await expect(page.getByRole('heading',{name:/^Distribución analítica · 63 ·/})).toBeVisible()
 const panel=page
 await panel.getByRole('combobox',{name:'Destino',exact:true}).selectOption(center)
 const [saved]=await Promise.all([page.waitForResponse(r=>/\/api\/contabilidad\/distribucion-analitica\/?$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST'),panel.getByRole('button',{name:'Guardar reparto',exact:true}).click()]);expect(saved.status()).toBe(201)
 expect(json(`SELECT jsonb_agg(jsonb_build_object('centro',centro_costo_id,'porcentaje',porcentaje,'monto',monto)) FROM distribucion_analitica WHERE detalle_asiento_id='${detail}'`)).toEqual([{centro:center,porcentaje:100,monto:12.34}])
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('row').filter({hasText:'Gasto analítico UI '+suffix}).getByRole('button',{name:'Distribuir',exact:true}).click();await expect(page.getByRole('combobox',{name:'Destino',exact:true})).toHaveValue(center)
 const [removed]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.includes('/contabilidad/distribucion-analitica/'+detail)&&r.request().method()==='DELETE'),page.getByRole('button',{name:'Eliminar eje',exact:true}).click()]);expect(removed.status()).toBe(200)
 expect(sql(`SELECT count(*) FROM distribucion_analitica WHERE detalle_asiento_id='${detail}'`)).toBe('0')
 expect(json(`SELECT jsonb_build_object('estado',estado,'debe',total_debe,'haber',total_haber) FROM asientos_contables WHERE id='${id}'`)).toEqual({estado:'BORRADOR',debe:12.34,haber:12.34})
 proof.steps.push({name:'real_UI_draft_analytic_allocation_save_reload_remove_preserves_money',result:'PASS',journalId:id,fixtureCreatedViaAPI:true})
 let deletes=0
 page.on('request',r=>{if(r.method()==='DELETE'&&new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/contabilidad/asientos/'+id))deletes++})
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Eliminar',exact:true}).click()
 expect(deletes).toBe(0);expect(sql(`SELECT count(*) FROM asientos_contables WHERE id='${id}'`)).toBe('1')
 page.once('dialog',d=>d.accept())
 const [deleted]=await Promise.all([page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/contabilidad/asientos/'+id)),page.getByRole('button',{name:'Eliminar',exact:true}).click()])
 expect(deleted.status()).toBe(200);await expect(page).toHaveURL(/\/contabilidad\/asientos\/?$/,{timeout:25000})
 await page.reload({waitUntil:'domcontentloaded'});expect(deletes).toBe(1)
 expect(sql(`SELECT count(*) FROM asientos_contables WHERE id='${id}'`)).toBe('0');expect(sql(`SELECT count(*) FROM detalle_asientos WHERE asiento_id='${id}'`)).toBe('0')
 proof.steps.push({name:'real_UI_draft_journal_delete_cancel_confirm_reload_SQL_no_lines',result:'PASS',journalId:id,cancelRequests:0,confirmedRequests:1})
})

test('Bancos Perú: transferencia real recupera ACK perdido con la misma intención, dos movimientos y GL único',async({page,context})=>{
 test.setTimeout(240000);const {f,post}=await start(page,context),suffix=randomUUID().slice(0,8),ref='AUX-BT-'+suffix
 const account=(code:string)=>sql(`SELECT id FROM plan_cuentas WHERE tenant_id='${f.tenant}' AND codigo='${code}' AND activo ORDER BY id LIMIT 1`),today=sql(`SELECT app.hoy_tenant('${f.tenant}')`)
 const banks=[];for(const [index,code]of ['1041','1042'].entries())banks.push(await post('finanzas/bancos/cuentas',{nombre:'Banco UI '+suffix+' '+index,banco:'BANCO LOCAL',numero_cuenta:'AUX-'+suffix+'-'+index,moneda:'PEN',tipo_cuenta:'CORRIENTE',cuenta_contable_id:account(code),saldo:0}))
 await post('finanzas/bancos/movimientos',{cuenta_bancaria_id:banks[0].id,cuenta_contrapartida_id:account('70'),tipo:'ABONO',monto:10,moneda:'PEN',fecha:today,descripcion:'Fondos fixture UI',referencia:ref+'-FUND',categoria:'OTRO_INGRESO',metodo_pago:'TRANSFERENCIA',idempotency_key:randomUUID()})
 const requests:any[]=[];let committed:any
 await context.route(/\/api\/finanzas\/bancos\/transferencias\/?$/,async route=>{
  const req=route.request();requests.push(req.postDataJSON());const response=await route.fetch();expect(response.status()).toBe(201);committed=await response.json()
  if(requests.length===1)return route.fulfill({status:503,json:{message:'ACK perdido local después del commit'}})
  return route.fulfill({response})
 })
 await page.goto('/dashboard/finanzas/bancos/'+banks[0].id+'/');await page.getByRole('button',{name:'Transferir',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Transferir entre cuentas',exact:true});await dialog.getByLabel('Cuenta destino',{exact:true}).selectOption(banks[1].id);await dialog.getByLabel('Monto',{exact:true}).fill('2.50');await dialog.getByLabel('Referencia',{exact:true}).fill(ref)
 await dialog.getByRole('button',{name:'Transferir',exact:true}).click();await expect(dialog.getByText('ACK perdido local después del commit',{exact:true})).toBeVisible();expect(requests).toHaveLength(1)
 await dialog.getByRole('button',{name:'Transferir',exact:true}).click();await expect(dialog).toHaveCount(0);expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0])
 const result=committed.data??committed;expect(result.event_id).toMatch(/^[0-9a-f-]{36}$/i)
 const movements=json(`SELECT jsonb_agg(jsonb_build_object('id',id,'par',movimiento_par_id,'tipo',tipo,'monto',monto,'operacion',operacion_bancaria_id) ORDER BY tipo) FROM movimientos_bancarios WHERE tenant_id='${f.tenant}' AND referencia='${ref}'`)
 expect(movements).toHaveLength(2);expect(movements.map((r:any)=>r.monto)).toEqual([2.5,2.5]);expect(movements[0].operacion).toBe(movements[1].operacion);expect(movements[0].par).toBe(movements[1].id);expect(movements[1].par).toBe(movements[0].id)
 await consumeLocalAccounting('aux-bank-transfer')
 expect(json(`SELECT jsonb_agg(jsonb_build_object('estado',estado,'debe',total_debe,'haber',total_haber)) FROM asientos_contables WHERE source_event_id='${result.event_id}'`)).toEqual([{estado:'CONFIRMADO',debe:2.5,haber:2.5}])
 await page.reload({waitUntil:'domcontentloaded'});expect(sql(`SELECT saldo FROM cuentas_bancarias WHERE id='${banks[0].id}'`)).toBe('7.50');expect(sql(`SELECT saldo FROM cuentas_bancarias WHERE id='${banks[1].id}'`)).toBe('2.50')
 proof.steps.push({name:'real_UI_bank_transfer_lost_ACK_same_key_pair_and_unique_GL',result:'PASS',amount:2.5,setupAccountsAndFundingViaAPI:true})
})
