import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Barrido de lecturas de pantallas de uso diario con API/PostgreSQL locales: sin
// SELECT sobre su tabla, el listado debe responder 503 legible; no 200 vacío (la
// pantalla diría «no hay datos»), 400 ni texto de PostgreSQL.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'rf-first-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
let token;const scenarios=[],requests=[];let success=false;
async function raw(endpoint){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method:'GET',headers:{connection:'close','idempotency-key':randomUUID(),authorization:'Bearer '+token}});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method:'GET',endpoint:endpoint.split('?')[0],status:response.status});
 return {status:response.status,body:value};
}
// [tabla, endpoint]: listados que abren las pantallas del menú.
const reads=[
 ['almacenes','inventario/almacenes'],['categorias_producto','inventario/categorias'],['productos','inventario/productos'],
 ['recepciones','inventario/recepciones'],['clientes','ventas/clientes'],['rma_solicitudes','ventas/rma'],
 ['proveedores','compras/proveedores'],['ordenes_compra','compras/ordenes'],['cuentas_por_pagar','finanzas/cxp'],
 ['cuentas_por_cobrar','finanzas/cxc'],['cuentas_bancarias','finanzas/bancos/cuentas'],['cajas','cajas'],
 ['empleados','rrhh/empleados'],['departamentos','rrhh/departamentos'],['planillas','rrhh/planillas'],
 ['plan_cuentas','contabilidad/plan-cuentas'],['asientos_contables','contabilidad/asientos'],['centros_costo','contabilidad/centros-costo'],
 ['gre_guias','gre/guias'],['sucursales','sucursales'],['audit_log','audit-logs'],
];
const technical=/permission denied|relation |42501|PGRST|violates|syntax error|column .* does not exist/i;
try{
 const login=await (await fetchWithLocalLoginRetry(api+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:first.email,password:'Cliente-Local-2026-Only!'})})).json();
 token=login?.data?.access_token??login?.access_token;
 assert.ok(token,'Sin sesión');
 for(const [table,endpoint] of reads){
  const scenario=`Lecturas: sin lectura de ${table} GET /api/${endpoint} responde 503 legible`;
  try{
   const healthy=await raw(endpoint);
   assert.equal(healthy.status,200,'Sin falla respondió '+healthy.status+' '+JSON.stringify(healthy.body).slice(0,200));
   assert.equal(sql(`SELECT has_table_privilege('service_role','public.${table}','SELECT');`),'t','service_role sin SELECT local en '+table);
   sql(`REVOKE SELECT ON public.${table} FROM service_role;`);
   let faulty;try{faulty=await raw(endpoint);}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}
   const message=typeof faulty.body==='object'?String(faulty.body?.message??''):String(faulty.body).slice(0,200);
   const observed={status:faulty.status,success:faulty.body?.success,message:message.slice(0,200)};
   assert.equal(faulty.status,503,JSON.stringify(observed));
   assert.doesNotMatch(message,technical,'Texto técnico: '+message);
   scenarios.push({scenario,passed:true});
  }catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,500)});}
 }
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Lecturas: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'read-faults.json'),JSON.stringify({success,remoteWrites:false,scope:'Barrido de lecturas caídas API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,total:scenarios.length}));
if(!success)process.exitCode=1;
