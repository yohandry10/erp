import {test,expect,type Page,type BrowserContext} from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {loginPeruLocal} from './helpers/peru-login-local'
import {readLocalSql} from './helpers/peru-local-accounting'

const sql=(q:string)=>readLocalSql(q.trim().replace(/;$/,'')+';')
const proof={scope:'FRESH_REAL_UI_QUOTE_CONTRACT_CASH_PAYROLL_SQL',complete:false,steps:[]as any[],page_errors:[]as string[],remoteWrites:false}
test.afterAll(()=>{proof.complete=proof.steps.length===5&&!proof.page_errors.length;fs.writeFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,'supplemental-offered-writers-ui.json'),JSON.stringify(proof,null,2))})
async function start(page:Page,context:BrowserContext){
 expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456')
 page.setDefaultTimeout(30000);page.on('pageerror',e=>proof.page_errors.push(e.message))
 await context.route('**/*',r=>['127.0.0.1','localhost','[::1]'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort('blockedbyclient'))
 const f=JSON.parse(fs.readFileSync(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,'accounting-first-fixture.json'),'utf8'))
 const auth=await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!'),token=auth.access_token??auth.data?.access_token
 const post=async(endpoint:string,data:any)=>{const key=randomUUID();if(endpoint.startsWith('inventario/'))data={...data,idempotency_key:key};const r=await page.request.post(process.env.LOCAL_API_URL+'/api/'+endpoint,{headers:{Authorization:'Bearer '+token,'Idempotency-Key':key},data});expect(r.status(),endpoint).toBe(201);const body=await r.json();return body.data??body}
 return {f,post}
}
test('Ventas Perú: eliminar borrador exige confirmación y retira sólo su cotización al recargar',async({page,context})=>{
 test.setTimeout(180000);const {f,post}=await start(page,context),suffix=randomUUID().slice(0,8)
 const client=await post('ventas/clientes',{tipo:'PERSONA',documento_tipo:'DNI',documento_numero:String(60000000+Math.floor(Math.random()*9999999)),razon_social:'Cliente borrar '+suffix})
 await post('inventario/categorias',{codigo:'BUI-'+suffix,nombre:'Servicios borrar '+suffix})
 const product=await post('inventario/productos',{codigo:'BUI-'+suffix,nombre:'Servicio borrar '+suffix,categoria:'Servicios borrar '+suffix,unidad_medida:'ZZ',precio_compra:0,precio_venta:10,controla_stock:false,afectacion_igv:'10'})
 const quote=await post('ventas/cotizaciones',{cliente_id:client.id,notas:'Borrador borrar UI '+suffix,detalle:[{producto_id:product.id,descripcion:'Servicio UI',cantidad:1,precio_unitario:10}]})
 expect(sql(`SELECT estado FROM cotizaciones WHERE id='${quote.id}' AND tenant_id='${f.tenant}'`)).toBe('BORRADOR')
 await page.goto('/dashboard/ventas/cotizaciones/');const row=page.getByRole('row').filter({hasText:quote.numero});await expect(row).toBeVisible();await row.getByTitle('Eliminar',{exact:true}).click()
 const dialog=page.getByRole('alertdialog',{name:'Eliminar cotización',exact:true});await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(sql(`SELECT count(*) FROM cotizaciones WHERE id='${quote.id}'`)).toBe('1')
 await row.getByTitle('Eliminar',{exact:true}).click();const [removed]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.includes('/ventas/cotizaciones/'+quote.id)&&r.request().method()==='DELETE'),dialog.getByRole('button',{name:'Eliminar cotización',exact:true}).click()]);expect(removed.status()).toBe(200)
 await page.reload();await expect(page.getByRole('row').filter({hasText:quote.numero})).toHaveCount(0);expect(sql(`SELECT count(*) FROM cotizaciones WHERE id='${quote.id}'`)).toBe('0')
 proof.steps.push({name:'real_UI_quote_draft_delete_confirm_cancel_reload_SQL',result:'PASS',quoteId:quote.id,fixtureCreatedViaAPI:true})
})
test('RRHH Perú: renovar y finalizar un contrato nuevo conserva fechas, motivo e historia tras recarga',async({page,context})=>{
 test.setTimeout(180000);const {f,post}=await start(page,context),suffix=randomUUID().slice(0,8),today=sql(`SELECT app.hoy_tenant('${f.tenant}')`)
 const end=sql(`SELECT (app.hoy_tenant('${f.tenant}')+interval '1 month')::date`)
 const employee=await post('rrhh/empleados',{nombres:'Contrato UI',apellidos:suffix,tipo_documento:'DNI',numero_documento:String(70000000+Math.floor(Math.random()*9999999)),fecha_ingreso:today,puesto:'Operador UI',tiene_hijos:false,cantidad_hijos:0,estado:'activo'})
 const contract=await post('rrhh/contratos',{empleado_id:employee.id,tipo_contrato:'temporal',fecha_inicio:today,fecha_fin:end,sueldo_bruto:1800,moneda:'PEN',regimen_pensionario:'ONP',jornada_laboral:'tiempo_completo',periodo_prueba_meses:0,estado:'vigente'})
 await page.goto('/dashboard/rrhh/contratos/');const row=page.getByRole('row').filter({hasText:suffix});await expect(row).toBeVisible();await row.getByTitle('Renovar',{exact:true}).click()
 const renew=page.getByRole('dialog',{name:'Renovar Contrato',exact:true});await renew.getByRole('textbox').fill('2');const [renewed]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.includes('/contratos/'+contract.id+'/renovar')&&r.request().method()==='POST'),renew.getByRole('button',{name:'Confirmar',exact:true}).click()]);expect(renewed.status()).toBe(201)
 const expected=sql(`SELECT ('${end}'::date+interval '2 months')::date`);expect(sql(`SELECT fecha_fin::text FROM contratos WHERE id='${contract.id}' AND tenant_id='${f.tenant}'`)).toBe(expected)
 await page.reload();await expect(row).toContainText(/RENOVADO|VIGENTE/);proof.steps.push({name:'real_UI_contract_renew_two_months_reload_SQL',result:'PASS',contractId:contract.id,fixtureCreatedViaAPI:true})
 await row.getByTitle('Finalizar',{exact:true}).click();const final=page.getByRole('dialog',{name:'Finalizar Contrato',exact:true});await final.getByRole('textbox').fill('Fin del servicio UI '+suffix)
 const [finished]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.includes('/contratos/'+contract.id+'/finalizar')&&r.request().method()==='PUT'),final.getByRole('button',{name:'Confirmar',exact:true}).click()]);expect(finished.status()).toBe(200)
 await page.reload();await expect(row).toContainText('FINALIZADO');await expect(row.getByTitle('Renovar',{exact:true})).toHaveCount(0);expect(sql(`SELECT motivo_finalizacion FROM contratos WHERE id='${contract.id}'`)).toBe('Fin del servicio UI '+suffix)
 expect(sql(`SELECT count(*) FROM empleados WHERE id='${employee.id}'`)).toBe('1');proof.steps.push({name:'real_UI_contract_finalize_reason_reload_preserves_employee_SQL',result:'PASS',contractId:contract.id})
})

test('Caja Perú: editar una caja sin sesión conserva nombre y descripción tras recarga',async({page,context})=>{
 test.setTimeout(180000);const {f,post}=await start(page,context),suffix=randomUUID().slice(0,8)
 const branch=sql(`SELECT id FROM sucursales WHERE tenant_id='${f.tenant}' ORDER BY codigo_establecimiento LIMIT 1`)
 const warehouse=await post('inventario/almacenes',{codigo:'CE-'+suffix,nombre:'Almacén editar '+suffix,sucursal_id:branch})
 const cash=await post('cajas',{nombre:'Caja editar '+suffix,almacen_id:warehouse.id,sucursal_id:branch})
 await page.goto('/dashboard/cajas/');await page.getByRole('button',{name:'Editar caja Caja editar '+suffix,exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Editar caja',exact:true});await dialog.getByRole('textbox',{name:'Nombre *',exact:true}).fill('Caja editada '+suffix);await dialog.getByRole('textbox',{name:'Descripción',exact:true}).fill('Descripción guardada desde UI')
 const [saved]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/cajas/'+cash.id)&&r.request().method()==='PUT'),dialog.getByRole('button',{name:'Guardar caja',exact:true}).click()]);expect(saved.status()).toBe(200)
 await page.reload();await expect(page.getByRole('button',{name:'Editar caja Caja editada '+suffix,exact:true})).toBeVisible()
 expect(JSON.parse(sql(`SELECT jsonb_build_object('nombre',nombre,'descripcion',descripcion,'estado',estado) FROM cajas WHERE id='${cash.id}' AND tenant_id='${f.tenant}'`))).toMatchObject({nombre:'Caja editada '+suffix,descripcion:'Descripción guardada desde UI',estado:'ACTIVO'})
 expect(sql(`SELECT count(*) FROM sesiones_caja WHERE caja_id='${cash.id}'`)).toBe('0');proof.steps.push({name:'real_UI_cash_register_edit_reload_SQL_no_session_or_money',result:'PASS',cashId:cash.id,fixtureCreatedViaAPI:true})
})

test('RRHH Perú: editar observaciones de planilla borrador conserva período y no calcula importes',async({page,context})=>{
 test.setTimeout(180000);const {f,post}=await start(page,context),suffix=randomUUID().slice(0,8)
 const payroll=await post('rrhh/planillas',{periodo:'2027-01',observaciones:'Borrador UI '+suffix,idempotency_key:randomUUID()})
 await page.goto('/dashboard/rrhh/planillas/');await page.getByRole('row').filter({hasText:'2027-01'}).getByTitle('Editar período y observaciones',{exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Editar planilla 2027-01',exact:true});await dialog.getByRole('textbox',{name:'Observaciones',exact:true}).fill('Observación editada UI '+suffix)
 const [saved]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/planillas/'+payroll.id)&&r.request().method()==='PUT'),dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click()]);expect(saved.status()).toBe(200)
 await page.reload();await page.getByRole('row').filter({hasText:'2027-01'}).getByTitle('Editar período y observaciones',{exact:true}).click();await expect(dialog.getByRole('textbox',{name:'Observaciones',exact:true})).toHaveValue('Observación editada UI '+suffix)
 expect(JSON.parse(sql(`SELECT jsonb_build_object('periodo',periodo,'estado',estado,'observaciones',metadata->>'observaciones') FROM planillas WHERE id='${payroll.id}' AND tenant_id='${f.tenant}'`))).toMatchObject({periodo:'2027-01',estado:'borrador',observaciones:'Observación editada UI '+suffix})
 proof.steps.push({name:'real_UI_draft_payroll_note_edit_reload_SQL_without_calculation',result:'PASS',payrollId:payroll.id,fixtureCreatedViaAPI:true})
})

