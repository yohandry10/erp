import {test,expect,type Locator} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {loginPeruLocal} from './helpers/peru-login-local'
import {readLocalSql} from './helpers/peru-local-accounting'

test('Inventario Perú: categorías, almacenes y ubicaciones conservan CRUD y estados reales',async({page,context})=>{
 test.setTimeout(240000);page.setDefaultTimeout(25000)
 expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456')
 const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,owner=JSON.parse(fs.readFileSync(path.join(output,'accounting-first-fixture.json'),'utf8'))
 expect(owner.non_demo).toBe(true);expect(owner.email).toBeTruthy()
 const checks:any[]=[],errors:string[]=[],suffix=randomUUID().slice(0,8),name=('UAT maestros '+suffix).toUpperCase(),code=('UM-'+suffix).toUpperCase()
 let complete=false;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort('blockedbyclient'))
 const query=(sql:string)=>JSON.parse(readLocalSql(sql+';')),record=(step:string,extra:any={})=>checks.push({name:step,result:'PASS',...extra})
 const response=(pattern:RegExp,method:string)=>page.waitForResponse(r=>pattern.test(new URL(r.url()).pathname.replace(/\/$/,''))&&r.request().method()===method)
 async function clickWrite(button:Locator,pattern:RegExp,method:string){const [r]=await Promise.all([response(pattern,method),button.click()]);expect(r.status()).toBeGreaterThanOrEqual(200);expect(r.status()).toBeLessThan(300);return r.json()}
 try{
  await loginPeruLocal(page,owner.email,'Cliente-Local-2026-Only!')
  await page.goto('/dashboard/inventario/categorias/');await page.getByRole('button',{name:'Nueva categoría',exact:true}).click()
  await page.getByLabel('Nombre',{exact:true}).fill(name);await page.getByLabel('Código',{exact:true}).fill(code)
  const category=await clickWrite(page.getByRole('button',{name:'Guardar',exact:true}),/\/api\/inventario\/categorias$/,'POST')
  const categoryId=category.data.id;expect(categoryId).toMatch(/^[0-9a-f-]{36}$/i)
  let catRow=page.getByText(name,{exact:true}).locator('xpath=../../..');await expect(catRow).toContainText(code)
  await catRow.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill(name+' EDITADO')
  await clickWrite(page.getByRole('button',{name:'Guardar',exact:true}),new RegExp('/api/inventario/categorias/'+categoryId+'$'),'PUT')
  await page.reload({waitUntil:'domcontentloaded'});catRow=page.getByText(name+' EDITADO',{exact:true}).locator('xpath=../../..');await expect(catRow).toContainText(code)
  expect(query(`SELECT to_jsonb(c) FROM categorias_producto c WHERE id='${categoryId}'`)).toMatchObject({nombre:name+' EDITADO',activo:true})
  await clickWrite(catRow.getByRole('button',{name:'Eliminar',exact:true}),new RegExp('/api/inventario/categorias/'+categoryId+'$'),'DELETE')
  await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText(name+' EDITADO',{exact:true})).toHaveCount(0)
  const removed=query(`SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM categorias_producto c WHERE id='${categoryId}'`)
  expect(removed.length===0||removed.every((r:any)=>r.activo===false)).toBe(true)
  record('category_real_create_update_reload_and_deactivate',{id:categoryId})
  await page.goto('/dashboard/inventario/almacenes/');await page.getByRole('button',{name:'Nuevo almacén',exact:true}).click()
  await page.getByLabel('Código de almacén',{exact:true}).fill(code);await page.getByLabel('Nombre de almacén',{exact:true}).fill(name)
  const warehouse=await clickWrite(page.getByRole('button',{name:'Guardar',exact:true}),/\/api\/inventario\/almacenes$/,'POST')
  const warehouseId=warehouse.data.id;expect(warehouseId).toMatch(/^[0-9a-f-]{36}$/i)
  const row=()=>page.getByRole('listitem').filter({hasText:code})
  await expect(row()).toContainText(name);await row().getByRole('button',{name:'Editar',exact:true}).click()
  await page.getByLabel('Nombre de almacén',{exact:true}).fill(name+' editado')
  await clickWrite(page.getByRole('button',{name:'Guardar',exact:true}),new RegExp('/api/inventario/almacenes/'+warehouseId+'$'),'PUT')
  await page.reload({waitUntil:'domcontentloaded'});await expect(row()).toContainText(name+' editado')
  expect(query(`SELECT to_jsonb(a) FROM almacenes a WHERE id='${warehouseId}'`)).toMatchObject({nombre:name+' editado',activo:true})
  await row().getByRole('button',{name:'Ver ubicaciones',exact:true}).click();await page.getByRole('button',{name:'Nueva ubicación',exact:true}).click()
  await page.getByLabel('Código de ubicación',{exact:true}).fill('R-'+suffix);await page.getByLabel('Nombre de ubicación',{exact:true}).fill('Rack '+suffix)
  const location=await clickWrite(page.getByRole('button',{name:'Guardar ubicación',exact:true}),/\/api\/inventario\/almacenes\/[^/]+\/ubicaciones$/,'POST')
  const locationId=location.data.id;expect(locationId).toMatch(/^[0-9a-f-]{36}$/i)
  await page.getByRole('button',{name:'Editar ubicación Rack '+suffix,exact:true}).click();await page.getByLabel('Nombre de ubicación',{exact:true}).fill('Rack editado '+suffix)
  await clickWrite(page.getByRole('button',{name:'Guardar ubicación',exact:true}),new RegExp('/api/inventario/(?:ubicaciones/'+locationId+'|almacenes/'+warehouseId+'/ubicaciones/'+locationId+')$'),'PUT')
  for(const active of [false,true]){
   await clickWrite(page.getByRole('button',{name:(active?'Reactivar':'Desactivar')+' ubicación Rack editado '+suffix,exact:true}),new RegExp('/api/inventario/(?:ubicaciones/'+locationId+'|almacenes/'+warehouseId+'/ubicaciones/'+locationId+')(?:/[^/]+)?$'),active?'PUT':'DELETE')
   expect(query(`SELECT to_jsonb(u) FROM almacen_ubicaciones u WHERE id='${locationId}'`)).toMatchObject({nombre:'Rack editado '+suffix,estado:active?'ACTIVO':'INACTIVO'})
  }
  record('location_real_create_update_deactivate_reactivate',{id:locationId})
  const [blocked]=await Promise.all([response(new RegExp('/api/inventario/almacenes/'+warehouseId+'$'),'DELETE'),row().getByRole('button',{name:'Desactivar',exact:true}).click()])
  expect(blocked.status()).toBe(400)
  expect(query(`SELECT to_jsonb(a) FROM almacenes a WHERE id='${warehouseId}'`)).toMatchObject({activo:true})
  await clickWrite(page.getByRole('button',{name:'Desactivar ubicación Rack editado '+suffix,exact:true}),new RegExp('/api/inventario/almacenes/'+warehouseId+'/ubicaciones/'+locationId+'$'),'DELETE')
  record('active_location_blocks_warehouse_deactivation_before_valid_sequence')
  for(const active of [false,true]){
   await clickWrite(row().getByRole('button',{name:active?'Reactivar':'Desactivar',exact:true}),new RegExp('/api/inventario/almacenes/'+warehouseId+'(?:/[^/]+)?$'),active?'PUT':'DELETE')
   await page.reload({waitUntil:'domcontentloaded'});await expect(row()).toBeVisible()
   expect(query(`SELECT to_jsonb(a) FROM almacenes a WHERE id='${warehouseId}'`)).toMatchObject({activo:active})
  }
  record('warehouse_real_create_update_deactivate_reactivate_reload',{id:warehouseId})
  await page.screenshot({path:path.join(output,'inventory-masters-real-ui.png'),fullPage:true});expect(errors).toEqual([]);complete=true
 }finally{fs.writeFileSync(path.join(output,'inventory-masters-real-ui.json'),JSON.stringify({scope:'FRESH_REAL_UI_INVENTORY_MASTERS_CRUD_SQL',complete,steps:checks,page_errors:errors,remoteWrites:false},null,2))}
})
