import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Finanzas no cubiertas por finance-lifecycle: CxP, tesorería, consultas bancarias, conciliación y tableros.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixtureName='finance-ops';
const first=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
let token,otherToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST',key=randomUUID()){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':key,...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method=body===undefined?'GET':'POST',key){
 const result=await raw(endpoint,body,access,method,key);assert.equal(result.status,status,method+' '+endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const outage=async(table,action)=>{sql(`REVOKE SELECT ON public.${table} FROM service_role;`);try{return await action();}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}};
const cents=v=>Math.round(Number(v)*100);
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const today=sql(`SELECT app.hoy_tenant(${q(first.tenant)});`);
 const plusDays=n=>sql(`SELECT (app.hoy_tenant(${q(first.tenant)})+${Number(n)})::text;`);
 const account=code=>{const id=sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${q(first.tenant)} AND codigo='${code}' AND activo ORDER BY created_at,id LIMIT 1;`);assert.match(id,/^[0-9a-f-]{36}$/,'Cuenta '+code);return id;};
 const bank=await call('finanzas/bancos/cuentas',{nombre:'Banco finanzas local',banco:'BANCO LOCAL',numero_cuenta:'LOCAL-FIN-'+randomUUID().slice(0,6),moneda:'PEN',tipo_cuenta:'CORRIENTE',cuenta_contable_id:account('1041'),saldo:0});
 await call('finanzas/bancos/movimientos',{cuenta_bancaria_id:bank.id,cuenta_contrapartida_id:account('70'),tipo:'ABONO',monto:500,moneda:'PEN',fecha:today,descripcion:'Fondos locales',referencia:'FUND-FIN',categoria:'OTRO_INGRESO',metodo_pago:'TRANSFERENCIA',idempotency_key:randomUUID()});
 const ruc='20'+String(Date.now()).slice(-8);const weights=[5,4,3,2,7,6,5,4,3,2];const d=11-weights.reduce((s,w,i)=>s+Number(ruc[i])*w,0)%11;
 const provider=await call('compras/proveedores',{ruc:ruc+String(d===10?0:d===11?1:d),razon_social:'Proveedor finanzas local',direccion:'Av. Local 456',email:'prov-fin-'+randomUUID().slice(0,6)+'@example.test'});
 const invoice=async(numero,total,vence)=>call('finanzas/cxp',{proveedor_id:provider.id,numero_documento:numero,serie:'F001',tipo_documento:'FACTURA',fecha_emision:today,fecha_vencimiento:vence,condiciones_pago:'CREDITO_30',subtotal:Math.round(total/1.18*100)/100,igv:Math.round((total-Math.round(total/1.18*100)/100)*100)/100,total,moneda:'PEN',tipo_cambio:1,destino_credito_fiscal:'GRAVADAS'});
 const a=await invoice('F001-FIN-'+randomUUID().slice(0,4),118,plusDays(10));
 const b=await invoice('F001-FIN-'+randomUUID().slice(0,4),59,plusDays(20));
 const c=await invoice('F001-FIN-'+randomUUID().slice(0,4),23.6,plusDays(40));

 await check('CxP: edición de una factura sin pagos se refleja y conserva saldo coherente',async()=>{
  await call('finanzas/cxp/'+c.id,{fecha_vencimiento:plusDays(45),observaciones:'Editada local'},200,token,'PUT');
  const det=await call('finanzas/cxp/'+c.id);assert.equal(String(det.fecha_vencimiento).slice(0,10),plusDays(45));assert.equal(cents(det.saldo),2360);
  assert.equal((await raw('finanzas/cxp/'+c.id,{observaciones:'Ajena'},otherToken,'PUT')).status,404,'Edición ajena');
 });
 await check('CxP: aging, vencimientos y mayor deuda reflejan las facturas del tenant',async()=>{
  const aging=await call('finanzas/cxp/aging');assert.ok(JSON.stringify(aging).includes('200.6')||JSON.stringify(aging).includes('200,6')||cents(aging.total??aging.totales?.total??0)===20060,'Aging sin el total 200.60: '+JSON.stringify(aging).slice(0,300));
  const venc=await call('finanzas/cxp/vencimientos?dias=30');const ids=JSON.stringify(venc);assert.ok(ids.includes(a.id)&&ids.includes(b.id)&&!ids.includes(c.id),'Vencimientos a 30 días: '+ids.slice(0,300));
  const top=await call('finanzas/cxp/proveedores-mayor-deuda?limite=5');assert.ok(JSON.stringify(top).includes(provider.id),'Proveedor ausente en mayor deuda');
  assert.ok(!JSON.stringify(await call('finanzas/cxp/aging',undefined,200,otherToken)).includes(provider.id),'Aging ajeno');
  assert.equal((await raw('finanzas/cxp/vencimientos?dias=0')).status,400,'dias=0 aceptado');
 });
 await check('Tesorería: pago en lote con intención aplica una vez, deja historial y descuenta el banco',async()=>{
  const body={pagos:[{cxp_id:a.id,monto:18},{cxp_id:b.id}],fecha_pago:today,metodo_pago:'TRANSFERENCIA',cuenta_bancaria_id:bank.id,referencia_lote:'LOTE-LOCAL-1',idempotency_key:'lote-'+randomUUID()};
  const first=await call('finanzas/tesoreria/lote',body);const again=await call('finanzas/tesoreria/lote',body);
  assert.equal(JSON.stringify(again.lote_id??again.id??again.pagos?.map(p=>p.id)),JSON.stringify(first.lote_id??first.id??first.pagos?.map(p=>p.id)),'Reintento distinto');
  assert.equal(cents((await call('finanzas/cxp/'+a.id)).saldo),10000);assert.equal((await call('finanzas/cxp/'+b.id)).estado,'PAGADA');
  assert.equal(cents((await call('finanzas/bancos/cuentas/'+bank.id)).saldo),42300);
  const pagosA=await call('finanzas/cxp/'+a.id+'/pagos');assert.equal((Array.isArray(pagosA)?pagosA:pagosA.items??[]).length,1,'Historial de pagos de A');
  const listado=await call('finanzas/tesoreria/pagos');assert.ok(JSON.stringify(listado).includes('LOTE-LOCAL-1')||JSON.stringify(listado).includes(a.id),'Listado de pagos sin el lote');
  const exceso=await raw('finanzas/tesoreria/lote',{...body,idempotency_key:'lote-'+randomUUID(),pagos:[{cxp_id:a.id,monto:1000}]});assert.equal(exceso.status,400,'Exceso '+exceso.status);
  assert.equal(cents((await call('finanzas/cxp/'+a.id)).saldo),10000,'Exceso modificó la deuda');
  const ajeno=await raw('finanzas/tesoreria/lote',{...body,idempotency_key:'lote-'+randomUUID(),pagos:[{cxp_id:c.id,monto:1}]},otherToken);assert.ok([400,403,404].includes(ajeno.status),'Lote ajeno '+ajeno.status);
 });
 await check('Tesorería: programación y flujo de caja proyectan sólo pendientes del tenant',async()=>{
  const prog=await call('finanzas/tesoreria/programacion');const s=JSON.stringify(prog);assert.ok(s.includes(a.id)&&s.includes(c.id)&&!s.includes(b.id),'Programación: '+s.slice(0,300));
  const flujo=await call('finanzas/tesoreria/flujo-caja?dias_proyeccion=60');assert.ok(flujo,'Flujo de caja');
  assert.ok(!JSON.stringify(await call('finanzas/tesoreria/programacion',undefined,200,otherToken)).includes(a.id),'Programación ajena');
 });
 await check('CxP: anulación con pagos se rechaza; sin pagos anula y sale de pendientes',async()=>{
  const conPagos=await raw('finanzas/cxp/'+a.id+'/anular',{motivo:'Prueba local'});assert.ok([400,409].includes(conPagos.status),'Anuló con pagos '+conPagos.status);
  const key=randomUUID();await call('finanzas/cxp/'+c.id+'/anular',{motivo:'Duplicada local'},201,token,'POST',key);
  const again=await raw('finanzas/cxp/'+c.id+'/anular',{motivo:'Duplicada local'},token,'POST',key);assert.ok([200,201].includes(again.status),'Reintento de anulación '+again.status);
  assert.equal((await call('finanzas/cxp/'+c.id)).estado,'ANULADA');
  assert.ok(!JSON.stringify(await call('finanzas/tesoreria/programacion')).includes(c.id),'Anulada sigue programada');
  assert.equal((await raw('finanzas/cxp/'+b.id+'/anular',{motivo:'Ajena'},otherToken)).status,404,'Anulación ajena');
 });
 await check('Bancos: movimientos por cuenta y período, saldos y aislamiento',async()=>{
  const movs=await call('finanzas/bancos/cuentas/'+bank.id+'/movimientos?fecha_desde='+today+'&fecha_hasta='+today);assert.ok(JSON.stringify(movs).includes('FUND-FIN'),'Movimientos de la cuenta');
  const saldos=await call('finanzas/bancos/saldos');assert.ok(JSON.stringify(saldos).includes(bank.id),'Saldos sin la cuenta');
  const periodo=await call('finanzas/bancos/movimientos/periodo?fecha_desde='+today+'&fecha_hasta='+today);assert.ok(JSON.stringify(periodo).includes('FUND-FIN'),'Movimientos del período');
  assert.equal((await raw('finanzas/bancos/cuentas/'+bank.id+'/movimientos',undefined,otherToken)).status,404,'Movimientos ajenos');
  assert.ok(!JSON.stringify(await call('finanzas/bancos/saldos',undefined,200,otherToken)).includes(bank.id),'Saldos ajenos');
  assert.equal((await raw('finanzas/bancos/movimientos/periodo?fecha_desde=2026-13-01')).status,400,'Fecha inválida aceptada');
 });
 await check('Conciliación bancaria: listado, pendientes y plantillas CSV del tenant',async()=>{
  await call('finanzas/conciliacion');await call('finanzas/conciliacion/pendientes');
  const plantillas=await call('finanzas/conciliacion/plantillas-csv');assert.ok(plantillas,'Plantillas');
 });
 for(const [table,list] of [['cuentas_por_pagar',['finanzas/cxp','finanzas/cxp/aging','finanzas/cxp/vencimientos','finanzas/tesoreria/programacion','finanzas/cxp/'+a.id]],['cuentas_bancarias',['finanzas/bancos/cuentas','finanzas/bancos/saldos']],['movimientos_bancarios',['finanzas/bancos/cuentas/'+bank.id+'/movimientos','finanzas/bancos/movimientos/periodo']]])
  await check('Finanzas: sin lectura de '+table+' las consultas responden 503',async()=>{
   const statuses={};await outage(table,async()=>{for(const r of list)statuses[r.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id')]=(await raw(r)).status;});
   assert.ok(Object.values(statuses).every(s=>s===503),JSON.stringify(statuses));
  });
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'Finanzas: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'finance-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'Finanzas API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,failed:scenarios.filter(s=>!s.passed).map(s=>s.scenario)}));
