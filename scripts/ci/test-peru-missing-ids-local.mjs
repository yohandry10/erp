import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';

// API/SQL reales, siempre locales. No confundir una petición sin parámetros o
// una identidad incorrecta con una prueba válida de recurso inexistente.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'mi-first-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return `'${id}'::uuid`;};
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const inventory=JSON.parse(fs.readFileSync(path.resolve('artifacts/peru-api-operation-inventory-20260930.json'),'utf8'));
const modules=new Set(['ventas','inventario','compras','finanzas','contabilidad','rrhh','gre','cajas','sucursales','cpe','users','usuarios-sistema','roles']);
const targets=inventory.operations.filter(o=>['GET','DELETE'].includes(o.method)&&/\/:id(?:\/|$)/.test(o.endpoint)&&(o.method==='GET'||/\/:id$/.test(o.endpoint))&&(o.endpoint.match(/:/g)||[]).length===1&&modules.has(o.module));
const technical=/permission denied|relation |42501|PGRST|violates|syntax error|invalid input syntax|column .* does not exist/i;
const scenarios=[],requests=[],inconclusive=[],malformedObservations=[];
const idempotentDeletes=new Set(['DELETE /api/contabilidad/plantillas-asientos/:id']);
let success=false,token,actor,worker;
async function raw(method,endpoint,{access=token,body}={}) {
 const response=await fetchWithLocalLoginRetry(api+endpoint,{method,headers:{connection:'close','content-type':'application/json','idempotency-key':randomUUID(),authorization:'Bearer '+access},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').replace('/no-es-uuid',':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function check(scenario,action){try{await action();scenarios.push({scenario,passed:true});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,1000)});}}
function budgetSnapshot(id) {
 const stamp=new Date().toISOString();
 return {expected_snapshot:{id,tenant_id:first.tenant,centro_costo_id:randomUUID(),cuenta_id:randomUUID(),periodo_contable_id:randomUUID(),codigo:'MISSING-ID-UAT',nombre:'Fotografía de recurso ausente',metadata:{},monto_presupuestado:1,monto_ejecutado:0,monto_comprometido:0,monto_disponible:1,porcentaje_ejecutado:0,estado:'ACTIVO',notas:null,created_by:actor,updated_by:actor,created_at:stamp,updated_at:stamp}};
}
try {
 const login=await raw('POST','/api/auth/login',{body:{email:first.email,password:'Cliente-Local-2026-Only!'}});
 assert.equal(login.status,201);token=login.data.access_token;assert.ok(token);
 actor=sql(`SELECT id FROM usuarios_sistema WHERE tenant_id=${q(first.tenant)} AND email='${first.email.replaceAll("'","''")}';`);q(actor);
 const require=createRequire(path.resolve('apps/erp-api/package.json'));
 assert.ok(process.env.POS_WORKER_JWT_SECRET);
 worker=require('jsonwebtoken').sign({iss:'pos.worker',scope:'pos.worker',tenant_id:first.tenant,actor_id:actor},process.env.POS_WORKER_JWT_SECRET,{algorithm:'HS256',expiresIn:'10m'});
 for(const target of targets) {
  const label=target.method+' '+target.endpoint,scenario='Ids: '+label+' distingue id inexistente de id mal formado';
  const missingId=randomUUID(),malformedId='no-es-uuid';
  const endpoint=id=>target.endpoint.replace(':id',id)+(target.endpoint==='/api/cajas/:id/corte-z'?'?sesionId='+randomUUID():'');
  const isWorker=target.endpoint.startsWith('/api/cpe/worker/');
  if(isWorker)await check('Worker: rechaza sesión humana en '+label,async()=>{const r=await raw(target.method,endpoint(missingId));assert.ok([401,403].includes(r.status));});
  const options=id=>({access:isWorker?worker:token,...(label==='DELETE /api/contabilidad/presupuestos/:id'?{body:budgetSnapshot(id)}:{})});
  const missing=await raw(target.method,endpoint(missingId),options(missingId));
  const malformed=await raw(target.method,endpoint(malformedId),options(malformedId));
  const observed={missing:missing.status,malformed:malformed.status,missingMessage:String(missing.body?.message??'').slice(0,180),malformedMessage:String(malformed.body?.message??'').slice(0,180)};
  if([401,403].includes(missing.status))inconclusive.push({endpoint:label,reason:'sin permiso '+missing.status});
  try {
   assert.ok(missing.status===404||(idempotentDeletes.has(label)&&[200,204].includes(missing.status)),JSON.stringify(observed));
   assert.doesNotMatch(observed.missingMessage,technical);assert.doesNotMatch(observed.missingMessage,/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/);
   if(![400,404].includes(malformed.status)||technical.test(observed.malformedMessage))malformedObservations.push({endpoint:label,...observed});
   assert.ok([400,404].includes(malformed.status),JSON.stringify(observed));assert.doesNotMatch(observed.malformedMessage,technical);
   assert.doesNotMatch(observed.malformedMessage,/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/);
   scenarios.push({scenario,passed:true,...observed});
  } catch(error) {scenarios.push({scenario,passed:false,...observed,message:String(error.message).slice(0,700)});}
 }
 await check('RRHH: empleado propio sin hijos es vacío confirmado; catálogos y fuente caída se distinguen',async()=>{
  const today=sql(`SELECT app.hoy_tenant(${q(first.tenant)});`);
  const created=await raw('POST','/api/rrhh/empleados',{body:{nombres:'Lecturas',apellidos:'UAT propias',tipo_documento:'DNI',numero_documento:String(40000000+Math.floor(Math.random()*9999999)),fecha_ingreso:today,puesto:'Operadora',tiene_hijos:false,cantidad_hijos:0,estado:'activo'}});
  assert.equal(created.status,201,JSON.stringify(created.body));const employee=created.data.id;q(employee);
  const other=JSON.parse(fs.readFileSync(path.join(output,'hr-ops-other-fixture.json')));
  const otherLogin=await raw('POST','/api/auth/login',{body:{email:other.email,password:'Cliente-Local-2026-Only!'}});assert.equal(otherLogin.status,201);const otherToken=otherLogin.data.access_token;
  for(const [suffix,table] of [['beneficios','empleado_beneficios'],['capacitaciones','empleado_capacitaciones'],['expediente','expediente_documentos']]) {
   const endpoint='/api/rrhh/empleados/'+employee+'/'+suffix;
   const own=await raw('GET',endpoint);assert.equal(own.status,200,JSON.stringify(own.body));assert.deepEqual(own.data,[]);
   const foreign=await raw('GET',endpoint,{access:otherToken});assert.equal(foreign.status,404,JSON.stringify(foreign.body));
   assert.equal(sql(`SELECT has_table_privilege('service_role','public.${table}','SELECT');`),'t');
   sql(`REVOKE SELECT ON public.${table} FROM service_role;`);
   try {const failed=await raw('GET',endpoint);assert.equal(failed.status,503,JSON.stringify(failed.body));assert.doesNotMatch(String(failed.body.message),technical);}
   finally {sql(`GRANT SELECT ON public.${table} TO service_role;`);}
   const recovered=await raw('GET',endpoint);assert.equal(recovered.status,200);assert.deepEqual(recovered.data,[]);
  }
  for(const suffix of ['beneficios','capacitaciones']){const catalog=await raw('GET','/api/rrhh/'+suffix);assert.equal(catalog.status,200,JSON.stringify(catalog.body));assert.ok(Array.isArray(catalog.data));}
  assert.equal(sql(`SELECT count(*) FROM empleados WHERE tenant_id=${q(first.tenant)} AND id=${q(employee)};`),'1');
 });
 success=targets.length>0&&inconclusive.length===0&&malformedObservations.length===0&&scenarios.every(s=>s.passed);
} catch(error) {scenarios.push({scenario:'Ids: preparación o dependencia',passed:false,message:String(error.message).slice(0,1000)});}
finally {fs.writeFileSync(path.join(output,'missing-ids.json'),JSON.stringify({success,remoteWrites:false,scope:'Current API inventory: nested and root IDs with valid mandatory inputs, separate worker identity, real owned RRHH parent/tenant/outage/recovery',targetCount:targets.length,scenarios,inconclusive,malformedObservations,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,total:scenarios.length,inconclusive:inconclusive.length}));
if(!success)process.exitCode=1;
