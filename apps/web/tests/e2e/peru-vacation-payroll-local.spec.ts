import {test,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import {loginPeruLocal} from './helpers/peru-login-local'
import {readLocalSql,consumeLocalAccounting} from './helpers/peru-local-accounting'

test('RRHH Perú: doce solicitudes alimentan cálculo, aprobación segregada y pago único',async({page,context,browser})=>{
 test.setTimeout(300000);page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(120000)
 expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1');expect(process.env.PGPORT).toBe('55456')
 const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR!,f=JSON.parse(await fs.readFile(path.join(output,'vacation-payroll-fixture.json'),'utf8'))
 expect(f.tenant).toMatch(/^[0-9a-f-]{36}$/i);expect(f.requestIds).toHaveLength(12)
 const proof:any={success:false,scope:'FRESH_REAL_UI_PAYROLL_CALCULATION_APPROVAL_PAYMENT_WITH_TWELVE_API_REQUESTS',remoteWrites:false,preservedUATBusinessWrites:0,checks:[],scriptErrors:[]}
 const record=(check:string,details:any={})=>proof.checks.push({check,passed:true,...details})
 const onlyLocal=async(c:any)=>c.route('**/*',(r:any)=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort())
 await onlyLocal(context);page.on('pageerror',error=>proof.scriptErrors.push(error.message))
 const requestsDigest=()=>readLocalSql(`SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY id)::text) FROM solicitudes s WHERE tenant_id='${f.tenant}';`)
 const sourceDigest=requestsDigest()
 let approverContext:any
 try{
  const expectedDays=JSON.parse(readLocalSql(`SELECT jsonb_object_agg(e.id,coalesce(v.days,0)) FROM empleados e LEFT JOIN LATERAL (SELECT count(DISTINCT d)::int days FROM solicitudes s CROSS JOIN LATERAL generate_series(greatest(s.fecha_inicio,'${f.period}-01'::date),least(s.fecha_fin,('${f.period}-01'::date+interval '1 month - 1 day')::date),'1 day') d WHERE s.tenant_id=e.tenant_id AND s.id_empleado=e.id AND s.tipo='vacaciones' AND s.estado='aprobada') v ON true WHERE e.tenant_id='${f.tenant}';`))
  for(const employee of f.employees)expect(expectedDays[employee.id]).toBe(employee.vacationDays)
  expect(readLocalSql(`SELECT count(*) FROM solicitudes WHERE tenant_id='${f.tenant}' AND estado='aprobada' AND tipo='vacaciones';`)).toBe('7')
  record('independent_SQL_day_union_5_10_0_and_seven_of_twelve')
  await loginPeruLocal(page,f.email,'Cliente-Local-2026-Only!');await page.goto('/dashboard/rrhh/planillas/')
  await page.getByRole('button',{name:'Crear Nueva Planilla',exact:true}).click();await page.locator('#planilla-modal-periodo').fill(f.period)
  await expect(page.getByLabel('Incluir',{exact:true})).toHaveCount(3)
  const submit=page.locator('button[form="planilla-form"]');await expect(submit).toBeEnabled()
  const created=page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/rrhh/planillas/crear-con-calculo')&&r.request().method()==='POST').then(r=>r.status())
  const calculated=page.waitForResponse(r=>/\/rrhh\/planillas\/[0-9a-f-]{36}\/calcular-personalizada\/?$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST').then(r=>r.status())
  await submit.click();expect(await created).toBe(201);expect(await calculated).toBe(201)
  const id=readLocalSql(`SELECT id FROM planillas WHERE tenant_id='${f.tenant}' AND periodo='${f.period}' AND estado='calculada';`);expect(id).toMatch(/^[0-9a-f-]{36}$/i);proof.payrollId=id
  const row=()=>page.getByRole('row').filter({hasText:f.period});await expect(row()).toContainText('Calculada')
  const economics=()=>JSON.parse(readLocalSql(`SELECT jsonb_agg(jsonb_build_object('employee',coalesce(ep.empleado_id::text,ep.id_empleado::text),'gross',ep.total_ingresos,'discount',ep.total_descuentos,'net',ep.neto_pagar,'vacational',(SELECT coalesce(sum(pc.monto),0) FROM empleado_planilla_conceptos pc JOIN conceptos_planilla c ON c.id::text=coalesce(pc.concepto_id::text,pc.id_concepto::text) AND c.tenant_id=pc.tenant_id WHERE coalesce(pc.empleado_planilla_id::text,pc.id_empleado_planilla::text)=ep.id::text AND pc.tenant_id=ep.tenant_id AND c.codigo='008'),'working',(SELECT coalesce(sum(pc.monto),0) FROM empleado_planilla_conceptos pc JOIN conceptos_planilla c ON c.id::text=coalesce(pc.concepto_id::text,pc.id_concepto::text) AND c.tenant_id=pc.tenant_id WHERE coalesce(pc.empleado_planilla_id::text,pc.id_empleado_planilla::text)=ep.id::text AND pc.tenant_id=ep.tenant_id AND c.codigo='001')) ORDER BY ep.id) FROM empleado_planilla ep WHERE ep.tenant_id='${f.tenant}' AND coalesce(ep.planilla_id::text,ep.id_planilla::text)='${id}';`))
  const amounts=economics();expect(amounts).toHaveLength(3)
  for(const employee of f.employees){const actual=amounts.find((r:any)=>r.employee===employee.id);expect(actual).toEqual({employee:employee.id,gross:1800,discount:234,net:1566,vacational:employee.vacationDays*60,working:1800-employee.vacationDays*60})}
  record('actual_UI_create_calculate_separates_008_without_duplicate_salary',{employees:3,gross:5400,net:4698,amounts})
  approverContext=await browser.newContext({baseURL:process.env.LOCAL_WEB_URL});await onlyLocal(approverContext);const approver=await approverContext.newPage();approver.on('pageerror',(error:any)=>proof.scriptErrors.push(error.message))
  await loginPeruLocal(approver,f.approverEmail,'Rrhh-Local-2026-Only!');await approver.goto('/dashboard/rrhh/planillas/')
  await approver.getByRole('row').filter({hasText:f.period}).getByTitle('Aprobar planilla',{exact:true}).click()
  const [approved]=await Promise.all([approver.waitForResponse((r: import('@playwright/test').Response)=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/rrhh/planillas/'+id+'/aprobar')&&r.request().method()==='POST'),approver.getByRole('button',{name:'Confirmar aprobación',exact:true}).click()])
  expect(approved.status()).toBe(201);await expect(approver.getByRole('heading',{name:'Aprobar planilla '+f.period,exact:true})).toHaveCount(0)
  expect(readLocalSql(`SELECT estado FROM planillas WHERE id='${id}' AND tenant_id='${f.tenant}';`)).toBe('aprobada');await consumeLocalAccounting('vacation-payroll-accrual')
  record('different_actor_approves_current_calculation_and_accrual')
  await page.reload({waitUntil:'domcontentloaded'});await expect(row()).toContainText('Aprobada');await row().getByTitle('Pagar planilla',{exact:true}).click()
  await page.getByLabel('Método de pago',{exact:true}).selectOption('transferencia');await page.getByLabel('Cuenta bancaria',{exact:true}).selectOption(f.bankId);await page.getByLabel('Referencia / operación',{exact:true}).fill('UAT-VAC-12-ORIGINAL')
  const pay=page.getByRole('button',{name:/^Pagar planilla completa/});await expect(pay).toBeEnabled()
  const [paid]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname.replace(/\/$/,'').endsWith('/rrhh/planillas/'+id+'/pagar')&&r.request().method()==='POST'),pay.click()]);expect(paid.status()).toBe(201)
  const paymentResponse=await paid.json();proof.paymentReceiptDate=paymentResponse.data?.fechaPago;proof.paymentResponseSuccess=paymentResponse.success;proof.paymentReceiptSuccess=paymentResponse.data?.success
  await expect(row()).toContainText('Pagada');await page.reload({waitUntil:'domcontentloaded'});await expect(row()).toContainText('Pagada')
  expect(readLocalSql(`SELECT count(*) FROM historial_pagos_planilla WHERE planilla_id='${id}' AND tenant_id='${f.tenant}';`)).toBe('1');expect(economics()).toEqual(amounts);expect(requestsDigest()).toBe(sourceDigest)
  await consumeLocalAccounting('vacation-payroll-payment')
  const journals=JSON.parse(readLocalSql(`SELECT coalesce(jsonb_agg(jsonb_build_object('event',e.event_id,'journal',a.id,'state',a.estado,'debit',a.total_debe,'credit',a.total_haber)),'[]') FROM outbox_events e JOIN asientos_contables a ON a.source_event_id=e.event_id AND a.tenant_id=e.tenant_id WHERE e.tenant_id='${f.tenant}' AND e.event_type='planilla.pagada';`));expect(journals).toHaveLength(1);expect(journals[0]).toMatchObject({state:'CONFIRMADO',debit:4698,credit:4698})
  record('one_payment_after_reload_unchanged_sources_and_balanced_GL',{net:4698,journals})
  expect(proof.scriptErrors).toEqual([]);proof.success=true
 }finally{await approverContext?.close();await fs.writeFile(path.join(output,'vacation-payroll-current-real-ui.json'),JSON.stringify(proof,null,2))}
})
