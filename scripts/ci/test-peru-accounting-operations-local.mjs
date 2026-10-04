import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Diagnóstico de contabilidad: reportes, mantenimientos e indisponibilidad con API/PostgreSQL locales efímeros.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixtureName='accounting';
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
const fnOutage=async(name,action)=>{
 const sig=sql(`SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${name}';`);assert.ok(sig&&!sig.includes('\n'),'Firma '+name);
 const pub=sql(`SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='${sig}'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE');`)==='t';
 const svc=sql(`SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='${sig}'::regprocedure AND a.grantee='service_role'::regrole AND a.privilege_type='EXECUTE');`)==='t';
 sql(`REVOKE EXECUTE ON FUNCTION ${sig} FROM PUBLIC, service_role;`);
 try{assert.equal(sql(`SELECT has_function_privilege('service_role','${sig}','EXECUTE');`),'f');return await action();}
 finally{if(pub)sql(`GRANT EXECUTE ON FUNCTION ${sig} TO PUBLIC;`);if(svc)sql(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role;`);}
};
const outage=async(table,action)=>{sql(`REVOKE SELECT ON public.${table} FROM service_role;`);try{return await action();}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}};
try{
 token=(await call('auth/login',{email:first.email,password:'Cliente-Local-2026-Only!'})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:'Cliente-Local-2026-Only!'})).access_token;
 const forge=(await import('node:module')).createRequire(path.resolve('apps/erp-api/package.json'))('node-forge');
 const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='0b';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+365*86400000);
 const attrs=[{name:'commonName',value:'CERTIFICADO LOCAL '+first.ruc},{name:'countryName',value:'PE'},{name:'organizationName',value:'Ensayo contable ERP'},{type:'2.5.4.5',value:first.ruc}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create());
 const p12=forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'Clave-Contable-local',{algorithm:'3des'});
 await call('configuration/complete',{configuration:{ruc:first.ruc,pais:'PE',pais_id:1,razonSocial:'Empresa contable local configurada',direccion:'Origen local 123',ubigeo:'150101',tipo_empresa:'MICRO',regimen_tributario:'GENERAL',serie_factura:'F001',serie_boleta:'B001',serie_guia_remision:'T001',certificateBase64:Buffer.from(forge.asn1.toDer(p12).getBytes(),'binary').toString('base64'),certificatePassword:'Clave-Contable-local',sunat_environment:'homologacion'}});
 const today=sql(`SELECT app.hoy_tenant(${q(first.tenant)});`);const [anio,mes]=today.split('-').map(Number);
 const periods=await call('contabilidad/periodos');const periodRows=Array.isArray(periods)?periods:periods.items??[];
 if(!periodRows.some(p=>Number(p.anio)===anio&&Number(p.mes)===mes))await call('contabilidad/periodos',{anio,mes});
 const account=code=>{const id=sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${q(first.tenant)} AND codigo='${code}' AND activo ORDER BY created_at,id LIMIT 1;`);assert.match(id,/^[0-9a-f-]{36}$/,'Cuenta '+code);return id;};
 const entry=await call('contabilidad/asiento-contable',{fecha:today,concepto:'Asiento reporte contable local',referencia:'REPORTE-LOCAL',estado:'BORRADOR',detalles:[{cuenta_id:account('63'),debe:12.34,haber:0,concepto:'Gasto local'},{cuenta_id:account('1041'),debe:0,haber:12.34,concepto:'Banco local'}]});
 const entryId=entry.id??entry.asiento?.id;assert.ok(entryId,JSON.stringify(entry).slice(0,200));await call('contabilidad/asientos/'+entryId+'/confirmar',{});
 const conciliable=sql(`SELECT id FROM plan_cuentas WHERE tenant_id=${q(first.tenant)} AND conciliable AND activo ORDER BY codigo,id LIMIT 1;`);const conciliableReal=conciliable||'00000000-0000-4000-8000-000000000000';
 const period=`anio=${anio}&mes=${mes}`;
 const reports=['libro-diario?'+period,'libro-mayor-completo?'+period,'libro-mayor/63?'+period,'balance-comprobacion?'+period,'estados/balance-comprobacion?'+period,'estados/estado-resultados?'+period,'estados/balance-general?'+period,
  'estados/balance-comprobacion/formatted?'+period,'estados/estado-resultados/formatted?'+period,'estados/balance-general/formatted?'+period,'balance-general?'+period,'flujo-efectivo?'+period,'ratios-financieros?'+period,
  'kardex-valorizado?'+period,'libro-caja-bancos?'+period,'registro-activos-fijos?'+period,'libro-planillas?'+period,'libro-inventarios-balances?'+period,'registro-costos?'+period,'libros-electronicos-sunat?'+period,
  'registro-ventas?'+period,'registro-compras?'+period,'asientos','asientos-contables','asientos/estadisticas/por-tipo','asientos-contables/'+entryId,'eventos/estadisticas','eventos/fallidos','eventos/dead-letter','eventos/estadisticas-fallidos',
  'tipos-cambio','moneda-local','partidas-abiertas?cuenta_id='+conciliableReal,'conciliaciones-partidas','plantillas-asientos','presupuestos','presupuestos/alertas','presupuestos/alertas/resumen','impuestos/anuales','centros-costo'];
 await check('Contabilidad: el plan PE de un cliente nuevo trae cuentas de terceros conciliables',async()=>{
  const codes=sql(`SELECT coalesce(string_agg(codigo,',' ORDER BY codigo),'') FROM plan_cuentas WHERE tenant_id=${q(first.tenant)} AND activo AND conciliable;`);
  assert.ok(/(^|,)12/.test(codes)&&/(^|,)42/.test(codes),'Conciliables: '+codes);return {codes};
 });
 const sweep={};
 await check('Contabilidad: cada reporte y consulta responde 200 con el período del tenant',async()=>{
  for(const r of reports){const res=await raw('contabilidad/'+r);sweep[r.split('?')[0]]=res.status;}
  const failed=Object.entries(sweep).filter(([,s])=>s!==200);assert.deepEqual(failed,[],JSON.stringify(failed));return {sweep};
 });
 await check('Contabilidad: libro diario, mayor y balance reflejan el asiento confirmado y cuadran',async()=>{
  const diario=JSON.stringify((await raw('contabilidad/libro-diario?'+period)).body);assert.ok(diario.includes('Asiento reporte contable local')&&diario.includes('12.34'),'Libro diario sin el asiento');
  const mayor=JSON.stringify((await raw('contabilidad/libro-mayor/63?'+period)).body);assert.ok(mayor.includes('12.34'),'Mayor 63 sin el importe');
  const balance=JSON.stringify((await raw('contabilidad/estados/balance-comprobacion?'+period)).body);assert.ok(balance.includes('12.34'),'Balance sin el importe');
 });
 await check('Contabilidad: otra empresa no ve el asiento en libros ni por id',async()=>{
  const diario=JSON.stringify((await raw('contabilidad/libro-diario?'+period,undefined,otherToken)).body);assert.ok(!diario.includes('Asiento reporte contable local'),'Asiento ajeno visible');
  const byId=await raw('contabilidad/asientos-contables/'+entryId,undefined,otherToken);assert.equal(byId.status,404,'Asiento ajeno por id '+byId.status);
 });
 await check('Contabilidad: período inválido se rechaza con 400',async()=>{
  const statuses={};for(const r of ['estados/estado-resultados','estados/balance-comprobacion','balance-general','balance-comprobacion','flujo-efectivo','libro-diario','libro-mayor-completo','registro-ventas']){statuses[r]=(await raw('contabilidad/'+r+'?anio='+anio+'&mes=13')).status;}
  assert.ok(Object.values(statuses).every(s=>s===400),JSON.stringify(statuses));
 });
 for(const [table,list] of [['asientos_contables',['libro-diario?'+period,'asientos']],['detalle_asientos',['libro-mayor/63?'+period,'libro-mayor-completo?'+period,'partidas-abiertas?cuenta_id='+conciliableReal]],['plan_cuentas',['plan-cuentas']],['conciliaciones_partidas',['conciliaciones-partidas']]])
  await check('Contabilidad: sin lectura de '+table+' los reportes responden 503',async()=>{
   const statuses={};await outage(table,async()=>{for(const r of list)statuses[r.split('?')[0]]=(await raw('contabilidad/'+r)).status;});
   assert.ok(Object.values(statuses).every(s=>s===503),JSON.stringify(statuses));
  });
 await check('Contabilidad: sin ejecutar balance_comprobacion_live los balances responden 503',async()=>{
  const statuses={};await fnOutage('balance_comprobacion_live',async()=>{for(const r of ['estados/balance-comprobacion?'+period,'balance-comprobacion?'+period])statuses[r.split('?')[0]]=(await raw('contabilidad/'+r)).status;});
  assert.ok(Object.values(statuses).every(s=>s===503),JSON.stringify(statuses));
 });
 await check('Contabilidad: conciliación de partidas con intención, listado, concurrencia y reversión',async()=>{
  assert.ok(conciliable,'Sin cuenta conciliable');
  const post=async(debe,haber,concepto)=>{const e=await call('contabilidad/asiento-contable',{fecha:today,concepto,referencia:'CONCILIA-LOCAL',estado:'BORRADOR',detalles:[{cuenta_id:conciliable,debe,haber,concepto},{cuenta_id:account('1041'),debe:haber,haber:debe,concepto:'Banco local'}]});
   const id=e.id??e.asiento?.id;await call('contabilidad/asientos/'+id+'/confirmar',{});return sql(`SELECT id FROM detalle_asientos WHERE asiento_id=${q(id)} AND cuenta_id=${q(conciliable)};`);};
  const d1=await post(50,0,'Cargo conciliable local'),d2=await post(0,50,'Abono conciliable local');
  const abiertas=JSON.stringify(await call('contabilidad/partidas-abiertas?cuenta_id='+conciliable));assert.ok(abiertas.includes(d1)&&abiertas.includes(d2),'Partidas no abiertas');
  const ajena=await raw('contabilidad/conciliaciones-partidas',{detalle_ids:[d1,d2]},otherToken);assert.equal(ajena.status,404,'Conciliación ajena '+ajena.status);
  const key=randomUUID(),body={detalle_ids:[d1,d2],observaciones:'Conciliación local'};
  const [a,b]=await Promise.all([raw('contabilidad/conciliaciones-partidas',body,token,'POST',key),raw('contabilidad/conciliaciones-partidas',body,token,'POST',randomUUID())]);
  const statuses=[a.status,b.status].sort();assert.ok(statuses[0]===201&&[201,400,409].includes(statuses[1]),'Concurrencia '+JSON.stringify([a.body,b.body]).slice(0,500));
  const winner=[a,b].find(r=>r.status===201).data;assert.equal(winner.estado,'TOTAL');
  assert.equal(sql(`SELECT count(*) FROM conciliaciones_partidas_lineas WHERE detalle_asiento_id IN (${q(d1)},${q(d2)});`),'2','Doble aplicación');
  if(a.status===201){const again=await raw('contabilidad/conciliaciones-partidas',body,token,'POST',key);assert.equal(again.status,201,'Reintento '+JSON.stringify(again.body).slice(0,300));assert.equal(again.data.id,a.data.id,'Reintento cre? otra conciliación');}
  const listado=JSON.stringify(await call('contabilidad/conciliaciones-partidas?cuenta_id='+conciliable));assert.ok(listado.includes(winner.id),'Conciliación no listada');
  assert.ok(!JSON.stringify(await call('contabilidad/conciliaciones-partidas',undefined,200,otherToken)).includes(winner.id),'Conciliación ajena listada');
  const cerradas=JSON.stringify(await call('contabilidad/partidas-abiertas?cuenta_id='+conciliable));assert.ok(!cerradas.includes(d1)&&!cerradas.includes(d2),'Partidas siguen abiertas');
  assert.equal((await raw('contabilidad/conciliaciones-partidas/'+winner.id,undefined,otherToken,'DELETE')).status,404,'Reversión ajena');
  await call('contabilidad/conciliaciones-partidas/'+winner.id,undefined,200,token,'DELETE');
  const reabiertas=JSON.stringify(await call('contabilidad/partidas-abiertas?cuenta_id='+conciliable));assert.ok(reabiertas.includes(d1)&&reabiertas.includes(d2),'Partidas no reabiertas');
  assert.equal((await raw('contabilidad/conciliaciones-partidas/'+winner.id,undefined,token,'DELETE')).status,404,'Reversión repetida');
 });
 await check('Contabilidad: centro de costo con intención, edición, asientos y reporte de gastos',async()=>{
  const key=randomUUID(),body={codigo:'CC-LOCAL',nombre:'Centro local',descripcion:'Centro de costo local'};
  const cc=await call('contabilidad/centros-costo',body,201,token,'POST',key);const id=cc.id??cc.centro?.id;assert.ok(id);
  assert.equal((await call('contabilidad/centros-costo',body,201,token,'POST',key)).id??id,id);
  await call('contabilidad/centros-costo/'+id,{nombre:'Centro local editado'},200,token,'PUT');
  assert.equal((await call('contabilidad/centros-costo/'+id)).nombre,'Centro local editado');
  await call('contabilidad/centros-costo/'+id+'/asientos?fecha_desde='+today+'&fecha_hasta='+today);await call('contabilidad/centros-costo/'+id+'/reporte-gastos?fecha_desde='+today+'&fecha_hasta='+today);
  await call('contabilidad/centros-costo/'+id,undefined,404,otherToken);
 });
 await check('Contabilidad: tipo de cambio manual con intención, vigente, listado y baja',async()=>{
  const key=randomUUID(),body={moneda_origen:'USD',moneda_destino:'PEN',fecha:today,compra:3.701,venta:3.712,fuente:'MANUAL'};
  const rate=await call('contabilidad/tipos-cambio',body,201,token,'POST',key);const id=rate.id??rate.tipo_cambio?.id;assert.ok(id,JSON.stringify(rate).slice(0,200));
  assert.equal((await call('contabilidad/tipos-cambio',body,201,token,'POST',key)).id??id,id);
  const vigente=await call('contabilidad/tipos-cambio/vigente?moneda_origen=USD&fecha='+today);assert.ok(JSON.stringify(vigente).includes('3.71'),JSON.stringify(vigente).slice(0,200));
  await call('contabilidad/tipos-cambio/'+id,undefined,200,token,'DELETE');
 });
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'Contabilidad: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'accounting-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'Contabilidad API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,failed:scenarios.filter(s=>!s.passed).map(s=>s.scenario)}));
