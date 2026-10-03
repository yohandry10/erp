import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(output,'hr-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN||'psql',['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql('SELECT current_database();'),'erp_e2e');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return `'${id}'::uuid`;};
const tenant=fixture.tenant;
const scenarios=[];const requests=[];const defects=[];
let token;
async function raw(endpoint,body,headers={},method=body===undefined?'GET':'POST') {
 const response=await fetch(`${api}/api/${endpoint}`,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`} : {}),'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id'),status:response.status});
 return response;
}
async function call(endpoint,body,expected=body===undefined?200:201,headers={},method) {
 const response=await raw(endpoint,body,headers,method);const value=await response.json();
 assert.equal(response.status,expected,`${endpoint}: ${value.message||JSON.stringify(value)}`);
 return value.data??value;
}
const pass=scenario=>scenarios.push({scenario,passed:true});
const proof={success:false,local_only:true,remoteWrites:false,scope:'RRHH primer ADMIN no demo: empleados, contrato, asistencia y recuperación; no acepta planilla completa',scenarios,requests,defects};
const hashEmployees=()=>sql(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')::text) FROM empleados t WHERE tenant_id=${q(tenant)};`);
try {
 const login=await call('auth/login',{email:fixture.email,password:'Cliente-Local-2026-Only!'});token=login.access_token;
 assert.equal(login.user.tenant_id,tenant);assert.equal(login.user.is_super_admin,false);
 const other=await call('auth/login',{email:'peru-integrated-2@example.test',password:'Local-Peru-2026-Only!'});
 const today=sql(`SELECT app.hoy_tenant(${q(tenant)});`);
 const department=await call('rrhh/departamentos',{nombre:'Departamento local RRHH',codigo:'DEP-LOCAL'});
 const body={nombres:'Empleado',apellidos:'Local de aceptación',tipo_documento:'DNI',numero_documento:'98765432',email:'empleado-hr@example.test',fecha_ingreso:today,id_departamento:department.id,puesto:'Operador local',tiene_hijos:true,cantidad_hijos:1,estado:'activo'};
 const before=hashEmployees();
 await call('rrhh/empleados',{...body,numero_documento:'123'},400);
 await call('rrhh/empleados',{...body,cantidad_hijos:'texto-invalido'},400);
 assert.equal(hashEmployees(),before);
 const intent={'idempotency-key':randomUUID()};
 const employee=await call('rrhh/empleados',body,201,intent);
 assert.ok(employee.id);
 const after=hashEmployees();
 const replay=await raw('rrhh/empleados',body,intent);const replayValue=await replay.json();
 if(replay.status!==201) {
  assert.equal(replay.status,409);assert.equal(hashEmployees(),after);
  defects.push({id:'employee-create-replay-prevalidation',endpoint:'/api/rrhh/empleados',observed_status:409,
   message:replayValue.message,cause:'Validación de documento único precede al recibo transaccional de idempotencia',
   employee_count:Number(sql(`SELECT count(*) FROM empleados WHERE tenant_id=${q(tenant)};`)),recovery_blocked:true});
 } else {assert.equal((replayValue.data??replayValue).id,employee.id);pass('Empleado: replay retorna el mismo empleado sin duplicación');}
 await call('rrhh/empleados',{...body,email:'otro@example.test'},409);
 await call(`rrhh/empleados/${employee.id}`,{puesto:'Puesto editado local',tiene_hijos:false,cantidad_hijos:0},200,{},'PUT');
 const current=(await call('rrhh/empleados')).find(row=>row.id===employee.id);
 assert.equal(current.puesto,'Puesto editado local');
 if(current.asignacion_familiar!==false) {
  assert.equal(current.tiene_hijos,false);assert.equal(current.cantidad_hijos,0);
  defects.push({id:'employee-family-allowance-not-cleared',endpoint:'/api/rrhh/empleados/:id',observed_status:200,
   persisted:{tiene_hijos:current.tiene_hijos,cantidad_hijos:current.cantidad_hijos,asignacion_familiar:current.asignacion_familiar},
   cause:'La derivación sólo activa asignacion_familiar; no la desactiva al guardar tiene_hijos=false/cantidad_hijos=0'});
 }
 pass('Empleado: alta validada, documento duplicado rechazado y edición de puesto persistida');
 scenarios.push({scenario:'Empleado: edición explícita sin hijos retira asignación familiar',passed:current.asignacion_familiar===false});
 const companion=await call('rrhh/empleados',{...body,numero_documento:'98765429',email:'companero-hr@example.test'});
 const beforeEdit=hashEmployees();
 await call(`rrhh/empleados/${companion.id}`,{numero_documento:body.numero_documento},409,{},'PUT');
 assert.equal(hashEmployees(),beforeEdit);
 const editIntent={'idempotency-key':randomUUID()};
 const edited=await call(`rrhh/empleados/${employee.id}`,{puesto:'Puesto editado local'},200,editIntent,'PUT');
 assert.equal((await call(`rrhh/empleados/${employee.id}`,{puesto:'Puesto editado local'},200,editIntent,'PUT')).id,edited.id);
 assert.equal(sql(`SELECT asignacion_familiar FROM empleados WHERE id=${q(employee.id)};`),'f');
 await call(`rrhh/empleados/${employee.id}`,{puesto:'Intento cambiado'},409,editIntent,'PUT');
 pass('Empleado: documento duplicado en edición rechazado, replay y huella incompatible conservan datos y asignación');
 const emptyRole=await call('roles',{nombre:'RRHH_SIN_ACCESO_LOCAL',permission_ids:[],idempotency_key:randomUUID()});
 await call('users',{nombre:'Sin acceso RRHH',email:'sin-rrhh-local@example.test',password:'Sin-Acceso-RRHH-2026!',roles:[emptyRole.id],idempotency_key:randomUUID()});
 const deniedUser=await call('auth/login',{email:'sin-rrhh-local@example.test',password:'Sin-Acceso-RRHH-2026!'});
 const deniedHeaders={authorization:`Bearer ${deniedUser.access_token}`};
 const deniedSnapshot=hashEmployees();
 await call('rrhh/empleados',undefined,403,deniedHeaders);
 await call('rrhh/empleados',{...body,numero_documento:'98765431'},403,deniedHeaders);
 await call(`rrhh/empleados/${employee.id}`,{puesto:'Sin autorización'},403,deniedHeaders,'PUT');
 await call(`rrhh/empleados/${employee.id}`,undefined,403,deniedHeaders,'DELETE');
 assert.equal(hashEmployees(),deniedSnapshot);
 pass('RRHH: rol sin acceso no consulta ni crea/edita/desactiva empleados');
 const contractBody={empleado_id:employee.id,tipo_contrato:'temporal',fecha_inicio:'2026-02-01',fecha_fin:'2026-12-31',sueldo_bruto:1500,moneda:'PEN',regimen_pensionario:'ONP',jornada_laboral:'tiempo_completo',periodo_prueba_meses:3,estado:'vigente'};
 await call('rrhh/contratos',{...contractBody,regimen_pensionario:undefined},400);
 await call('rrhh/contratos',{...contractBody,sueldo_bruto:1},400);
 const contractIntent={'idempotency-key':randomUUID()};
 const contract=await call('rrhh/contratos',contractBody,201,contractIntent);
 assert.equal((await call('rrhh/contratos',contractBody,201,contractIntent)).id,contract.id);
 assert.ok((await call(`rrhh/contratos?empleado_id=${employee.id}`)).some(row=>row.id===contract.id));
 const pdf=await raw(`rrhh/contratos/${contract.id}/generar`);
 assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/pdf/);
 const bytes=Buffer.from(await pdf.arrayBuffer());assert.ok(bytes.length>1000);assert.equal(bytes.subarray(0,4).toString(),'%PDF');
 fs.writeFileSync(path.join(output,'hr-contract-local.pdf'),bytes);
 pass('Contrato: remuneración/régimen inválidos rechazados, alta/replay, consulta y PDF reales');
 const attendance={empleado_id:employee.id,fecha:today,tipo:'entrada',hora:'08:00'};
 const attendanceIntent={'idempotency-key':randomUUID()};
 const entry=await call('rrhh/asistencias/marcar',attendance,201,attendanceIntent);
 assert.equal((await call('rrhh/asistencias/marcar',attendance,201,attendanceIntent)).id,entry.id);
 await call('rrhh/asistencias/marcar',{...attendance,tipo:'salida',hora:'07:00'},400);
 await call('rrhh/asistencias/marcar',{...attendance,tipo:'salida',hora:'17:00'});
 const rows=await call(`rrhh/asistencias?fecha=${today}`);
 assert.equal(rows.filter(row=>row.empleado_id===employee.id).length,1);
 assert.equal(rows.find(row=>row.empleado_id===employee.id).hora_entrada,'08:00:00');
 assert.equal(rows.find(row=>row.empleado_id===employee.id).hora_salida,'17:00:00');
 pass('Asistencia: entrada/salida en fecha fiscal, replay, orden horario y consulta persistida');
 const isolated=hashEmployees();
 await call(`rrhh/empleados/${employee.id}`,{puesto:'Cambio ajeno'},404,{authorization:`Bearer ${other.access_token}`},'PUT');
 const foreignPdf=await raw(`rrhh/contratos/${contract.id}/generar`,undefined,{authorization:`Bearer ${other.access_token}`});assert.equal(foreignPdf.status,404);
 assert.equal(hashEmployees(),isolated);
 pass('RRHH: edición de empleado y PDF de contrato ajenos ocultos sin mutación');
 const renewIntent={'idempotency-key':randomUUID()};
 const renewed=await call(`rrhh/contratos/${contract.id}/renovar`,{meses:6},201,renewIntent);
 assert.equal((await call(`rrhh/contratos/${contract.id}/renovar`,{meses:6},201,renewIntent)).id,renewed.id);
 const finishIntent={'idempotency-key':randomUUID()};
 const finish={motivo_finalizacion:'Fin de ensayo local',fecha_finalizacion:today};
 await call(`rrhh/contratos/${renewed.id}/finalizar`,finish,200,finishIntent,'PUT');
 await call(`rrhh/contratos/${renewed.id}/finalizar`,finish,200,finishIntent,'PUT');
 pass('Contrato: renovación y finalización con replay conservan el historial');
 await call(`rrhh/empleados/${employee.id}`,undefined,200,{},'DELETE');
 assert.equal(sql(`SELECT activo FROM empleados WHERE id=${q(employee.id)};`),'f');
 pass('Empleado: baja lógica conserva empleado e historial');
 proof.success=defects.length===0;
} finally {
 proof.checkedAt=new Date().toISOString();
 fs.writeFileSync(path.join(output,'hr-lifecycle.json'),JSON.stringify(proof,null,2));

}
console.log(JSON.stringify({success:proof.success,scenarios:scenarios.length,defects: defects.map(row=>row.id),remoteWrites:false}));
if(!proof.success) process.exitCode=1;
