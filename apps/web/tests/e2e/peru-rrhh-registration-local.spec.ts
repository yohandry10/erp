import {test,expect} from '@playwright/test'
import {readFileSync,writeFileSync} from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import path from 'node:path'
import {loginPeruLocal} from './helpers/peru-login-local'
import {readLocalSql} from './helpers/peru-local-accounting'

test('RRHH registral: ficha SUNAT se guarda y recupera un ACK perdido sin duplicar la ficha',async({page,context})=>{
 test.setTimeout(240000);expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456')
 const out=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,f=JSON.parse(readFileSync(path.join(out,'hr-ops-first-fixture.json'),'utf8'))
 const employee=readLocalSql(`SELECT id FROM empleados WHERE tenant_id='${f.tenant}' AND estado='activo' ORDER BY id LIMIT 1;`);expect(employee).toMatch(/^[a-f0-9-]{36}$/i)
 const errors:string[]=[],keys:string[]=[];let success=false,lose=true
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>['localhost','127.0.0.1','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort())
 const match=new RegExp('/api/rrhh/peru/planilla-electronica/empleados/'+employee+'/ficha/?$')
 const sql=()=>readLocalSql(`SELECT jsonb_build_object('count',count(*),'paterno',min(apellido_paterno),'salud',min(regimen_salud_codigo),'establecimiento',min(establecimiento_codigo)) FROM rrhh_peru_fichas_laborales WHERE tenant_id='${f.tenant}' AND empleado_id='${employee}';`)
 try{
  await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!');await page.goto('/dashboard/rrhh/fichas-sunat/');await page.getByLabel('Empleado',{exact:true}).selectOption(employee)
  for(const [field,value] of [['apellido_paterno','LOCAL'],['apellido_materno','PERU'],['situacion_educativa_codigo','13'],['ocupacion_codigo','251101'],['tipo_contrato_codigo','01'],['categoria_ocupacional_codigo','02'],['tipo_trabajador_codigo','21'],['regimen_salud_codigo','00'],['regimen_pensionario_codigo','02'],['establecimiento_codigo','0000']])await page.locator('#sunat-profile-'+field).fill(value)
  await page.route(match,async route=>{if(route.request().method()!=='PUT')return route.fallback();keys.push(route.request().headers()['idempotency-key']);const actual=await route.fetch();expect(actual.status(),await actual.text()).toBe(200);return lose?route.fulfill({status:503,json:{message:'ACK perdido local de ficha ya persistida'}}):route.fulfill({response:actual})})
  const save=page.getByRole('button',{name:'Guardar ficha SUNAT',exact:true});await save.click();await expect.poll(()=>keys.length).toBe(1);await expect(save).toBeEnabled();expect(JSON.parse(sql())).toEqual({count:1,paterno:'LOCAL',salud:'00',establecimiento:'0000'})
  lose=false;const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'&&match.test(new URL(r.url()).pathname)),save.click()]);expect(response.status()).toBe(200);expect(keys).toHaveLength(2);expect(keys[1]).toBe(keys[0]);await page.unroute(match)
  await page.reload();await page.getByLabel('Empleado',{exact:true}).selectOption(employee);await expect(page.locator('#sunat-profile-apellido_paterno')).toHaveValue('LOCAL');expect(JSON.parse(sql()).count).toBe(1);expect(errors).toEqual([]);success=true
 }finally{writeFileSync(path.join(out,'browser-rrhh-ficha-registration.json'),JSON.stringify({success,remoteWrites:false,scope:'Owned fresh employee, actual local profile writer, ACK loss, same key replay and reload; no PVS/SUNAT submission',sameRetryIntent:keys.length===2&&keys[0]===keys[1],scriptErrors:errors},null,2))}
})

test('RRHH registral: solicitud y decisión originales sobreviven ACK perdido y recarga',async({page,context})=>{
 test.setTimeout(240000);expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456')
 const out=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,f=JSON.parse(readFileSync(path.join(out,'hr-ops-first-fixture.json'),'utf8'))
 const employee=readLocalSql(`SELECT id FROM empleados WHERE tenant_id='${f.tenant}' AND estado='activo' ORDER BY id LIMIT 1;`);expect(employee).toMatch(/^[a-f0-9-]{36}$/i)
 const reason='Registro UI '+randomUUID(),errors:string[]=[],sent:{body:string|null,key:string}[]=[];let success=false,lose=true
 const today=readLocalSql(`SELECT app.hoy_tenant('${f.tenant}');`),count=()=>readLocalSql(`SELECT count(*) FROM solicitudes WHERE tenant_id='${f.tenant}' AND motivo='${reason}';`)
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>['localhost','127.0.0.1','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort())
 const match=/\/api\/rrhh\/solicitudes(?:\/[a-f0-9-]{36}\/(?:aprobar|rechazar))?\/?$/
 try{
  await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!');await page.goto('/dashboard/rrhh/solicitudes/');await page.getByLabel('Empleado',{exact:true}).selectOption(employee);await page.getByLabel('Tipo de solicitud',{exact:true}).selectOption('permiso');await page.getByLabel('Fecha inicial',{exact:true}).fill(today);await page.getByLabel('Fecha final',{exact:true}).fill(today);await page.getByLabel('Motivo',{exact:true}).fill(reason)
  await page.route(match,async route=>{if(!['POST','PUT'].includes(route.request().method()))return route.fallback();sent.push({body:route.request().postData(),key:route.request().headers()['idempotency-key']});const actual=await route.fetch();expect([200,201],await actual.text()).toContain(actual.status());return lose?route.fulfill({status:503,json:{message:'ACK perdido local después de persistir solicitud o decisión'}}):route.fulfill({response:actual})})
  const retry=page.getByRole('button',{name:'Reintentar operación pendiente',exact:true});await page.getByRole('button',{name:'Registrar solicitud',exact:true}).click();await expect(retry).toBeEnabled();expect(count()).toBe('1');const original=sent[0]
  await page.reload();await expect(retry).toBeEnabled();lose=false;await retry.click();await expect(retry).toHaveCount(0);expect(sent[1]).toEqual(original);expect(count()).toBe('1')
  const row=page.getByRole('row').filter({hasText:reason});await row.getByRole('button',{name:'Aprobar',exact:true}).click();await page.getByLabel('Observaciones',{exact:true}).fill('Decisión original de UAT');lose=true;await page.getByRole('button',{name:'Confirmar aprobación',exact:true}).click();await expect(retry).toBeEnabled();const decision=sent[2]
  expect(readLocalSql(`SELECT estado FROM solicitudes WHERE tenant_id='${f.tenant}' AND motivo='${reason}';`)).toBe('aprobada');await page.reload();await expect(retry).toBeEnabled();lose=false;await retry.click();await expect(retry).toHaveCount(0);expect(sent[3]).toEqual(decision);expect(count()).toBe('1');await expect(row).toContainText('aprobada');expect(errors).toEqual([]);success=true
 }finally{writeFileSync(path.join(out,'browser-rrhh-request-registration.json'),JSON.stringify({success,remoteWrites:false,scope:'Fresh owned real request and approval, two actual commits, lost ACKs, reloads and exact manual original replay. No closed historical operation repeated.',requests:sent.map(x=>({key:x.key,bodySha256:createHash('sha256').update(x.body||'').digest('hex')})),scriptErrors:errors},null,2))}
})
