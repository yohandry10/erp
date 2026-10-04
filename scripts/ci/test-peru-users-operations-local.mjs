import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Administración de usuarios y roles con API/PostgreSQL locales efímeros.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixtureName='users';
const first=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,fixtureName+'-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const PASSWORD='Cliente-Local-2026-Only!';
let token,otherToken;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=token,method=body===undefined?'GET':'POST',headers={}){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':randomUUID(),...headers,...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=token,method=body===undefined?'GET':'POST'){
 const result=await raw(endpoint,body,access,method);assert.equal(result.status,status,method+' '+endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const outage=async(table,action)=>{sql(`REVOKE SELECT ON public.${table} FROM service_role;`);try{return await action();}finally{sql(`GRANT SELECT ON public.${table} TO service_role;`);}};
const login=async(email,password=PASSWORD)=>raw('auth/login',{email,password},undefined);
try{
 token=(await call('auth/login',{email:first.email,password:PASSWORD})).access_token;
 otherToken=(await call('auth/login',{email:other.email,password:PASSWORD})).access_token;
 const roleId=name=>sql(`SELECT coalesce((SELECT id::text FROM roles WHERE tenant_id=${q(first.tenant)} AND upper(nombre)='${name}' AND activo ORDER BY created_at LIMIT 1),'');`);
 const vendedor=roleId('VENDEDOR'),cajero=roleId('CAJERO');
 const otherRole=sql(`SELECT id FROM roles WHERE tenant_id=${q(other.tenant)} AND activo ORDER BY created_at LIMIT 1;`);
 const email=`vendedor.${randomUUID().slice(0,8)}@local.test`;let userId,userToken;

 await check('Usuarios: listado, métricas y roles del tenant responden 200 sin datos ajenos',async()=>{
  const list=await call('usuarios-sistema');const stats=await call('usuarios-sistema/stats');const roles=await call('usuarios-sistema/roles');
  assert.ok(Array.isArray(list)&&list.some(u=>u.email===first.email),'Admin ausente del listado');
  assert.ok(!JSON.stringify(list).includes(other.email),'Usuario ajeno listado');
  assert.ok(!JSON.stringify(list).includes('password'),'Listado expone campos de contraseña');
  assert.ok(stats.totalUsuarios>=1,'Métricas');assert.ok(roles.some(r=>r.id===vendedor),'Rol VENDEDOR ausente');
  return {roles:roles.map(r=>r.nombre)};
 });
 await check('Usuarios: alta con rol, sin exponer la contraseña y con reintento idempotente',async()=>{
  assert.match(vendedor,/^[0-9a-f-]{36}$/,'El tenant no tiene rol VENDEDOR');
  const body={idempotency_key:randomUUID(),nombre:'Vendedora',apellido:'Local',email,password:'Vendedora-Local-2026',rol_id:vendedor,estado:'ACTIVO'};
  const created=await raw('usuarios-sistema/crear',body);assert.equal(created.status,201,JSON.stringify(created.body).slice(0,300));
  userId=created.data.usuario_id??created.data.id??created.data.usuario?.id;assert.match(String(userId),/^[0-9a-f-]{36}$/,JSON.stringify(created.data).slice(0,300));
  const logged=await login(email,body.password);assert.equal(logged.status,201,'Login del nuevo usuario '+logged.status);userToken=logged.data.access_token;
  const again=await raw('usuarios-sistema/crear',body);assert.equal(again.status,201,'Reintento '+again.status);
  assert.equal(again.data.usuario_id??again.data.id??again.data.usuario?.id,userId,'El reintento creó otro usuario');
  assert.equal(sql(`SELECT count(*) FROM usuarios_sistema WHERE lower(email)=lower('${email}');`),'1');
  const problems=[];
  if(JSON.stringify(created.body).includes(body.password))problems.push('La respuesta del alta devuelve la contraseña elegida en claro');
  if(again.data?.temporaryPassword!==undefined)problems.push('El reintento devuelve temporaryPassword '+(again.data.temporaryPassword===body.password?'(la elegida)':'(otra que no es la del usuario)'));
  assert.deepEqual(problems,[],problems.join('; '));
 });
 await check('Usuarios: validaciones de alta (correo repetido, contraseña corta, rol ajeno)',async()=>{
  const base={nombre:'Otro',email,password:'Vendedora-Local-2026',rol_id:vendedor};
  const dup=await raw('usuarios-sistema/crear',{...base,idempotency_key:randomUUID()});assert.equal(dup.status,409,'Correo repetido '+dup.status+' '+JSON.stringify(dup.body).slice(0,200));
  const shortPass=await raw('usuarios-sistema/crear',{...base,email:'corta.'+randomUUID().slice(0,6)+'@local.test',password:'corta',idempotency_key:randomUUID()});assert.equal(shortPass.status,400,'Contraseña corta '+shortPass.status);
  const foreign=await raw('usuarios-sistema/crear',{...base,email:'ajeno.'+randomUUID().slice(0,6)+'@local.test',rol_id:otherRole,idempotency_key:randomUUID()});
  assert.ok([400,403,404].includes(foreign.status),'Rol ajeno '+foreign.status);
  assert.equal(sql(`SELECT count(*) FROM usuarios_sistema WHERE email LIKE 'ajeno.%@local.test';`),'0','Alta con rol ajeno persistida');
 });
 await check('Usuarios: el rol asignado limita permisos (vendedor no administra usuarios)',async()=>{
  assert.ok(userToken,'Sin sesión del nuevo usuario');
  const perms=await call('usuarios-sistema/me/permissions',undefined,200,userToken);assert.ok(Array.isArray(perms)?perms.length>0:Object.keys(perms||{}).length>0,'Sin permisos efectivos');
  assert.equal((await raw('usuarios-sistema',undefined,userToken)).status,403,'Vendedor lista usuarios');
  assert.equal((await raw('usuarios-sistema/crear',{idempotency_key:randomUUID(),nombre:'X',email:'x.'+randomUUID().slice(0,6)+'@local.test',password:'Vendedora-Local-2026'},userToken)).status,403,'Vendedor crea usuarios');
  assert.equal((await raw('usuarios-sistema/'+userId+'/estado',{estado:'ACTIVO'},userToken,'PUT')).status,403,'Vendedor cambia estados');
 });
 await check('Usuarios: edición de datos y rol se refleja en detalle y permisos',async()=>{
  assert.match(cajero,/^[0-9a-f-]{36}$/,'El tenant no tiene rol CAJERO');
  await call('usuarios-sistema/'+userId,{nombre:'Vendedora editada',rol_id:cajero},200,token,'PUT');
  const detail=await call('usuarios-sistema/'+userId);assert.equal(detail.nombre,'Vendedora editada');
  assert.ok(JSON.stringify(detail).includes(cajero)&&!JSON.stringify(detail.roles||[]).includes(vendedor),'Rol no reemplazado: '+JSON.stringify(detail.roles).slice(0,300));
  const perms=await call('usuarios-sistema/'+userId+'/permissions');assert.ok(perms,'Permisos del usuario');
 });
 await check('Usuarios: inactivar revoca la sesión y el acceso; reactivar lo devuelve',async()=>{
  assert.ok(userToken,'Sin sesión del nuevo usuario');
  await call('usuarios-sistema/'+userId+'/estado',{estado:'INACTIVO'},200,token,'PUT');
  const stale=await raw('usuarios-sistema/me/permissions',undefined,userToken);assert.equal(stale.status,401,'Token del inactivo sigue válido '+stale.status);
  assert.equal((await login(email,'Vendedora-Local-2026')).status,401,'Inactivo inicia sesión');
  await call('usuarios-sistema/'+userId+'/estado',{estado:'ACTIVO'},200,token,'PUT');
  const back=await login(email,'Vendedora-Local-2026');assert.equal(back.status,201,'Reactivado no inicia sesión '+back.status);userToken=back.data.access_token;
 });
 await check('Usuarios: otra empresa no ve, edita ni inactiva al usuario',async()=>{
  assert.equal((await raw('usuarios-sistema/'+userId,undefined,otherToken)).status,404,'Detalle ajeno');
  const put=await raw('usuarios-sistema/'+userId,{nombre:'Intruso'},otherToken,'PUT');assert.ok([403,404].includes(put.status),'Edición ajena '+put.status);
  const del=await raw('usuarios-sistema/'+userId,undefined,otherToken,'DELETE');assert.ok([403,404].includes(del.status),'Baja ajena '+del.status);
  const spoof=await raw('usuarios-sistema',undefined,otherToken,'GET',{'x-tenant-id':first.tenant});assert.ok(!JSON.stringify(spoof.body).includes(email),'Cabecera x-tenant-id cruza tenants');
  assert.equal(sql(`SELECT nombre||'|'||estado FROM usuarios_sistema WHERE id=${q(userId)};`),'Vendedora editada|ACTIVO','Cambio ajeno persistido');
 });
 await check('Usuarios: el administrador no puede inactivarse a sí mismo',async()=>{
  const adminId=sql(`SELECT id FROM usuarios_sistema WHERE tenant_id=${q(first.tenant)} AND lower(email)=lower('${first.email}');`);
  const self=await raw('usuarios-sistema/'+adminId+'/estado',{estado:'INACTIVO'},token,'PUT');
  assert.ok([400,403,409].includes(self.status),'Autoinactivación '+self.status);
  assert.equal(sql(`SELECT estado FROM usuarios_sistema WHERE id=${q(adminId)};`),'ACTIVO');
 });
 await check('Usuarios: baja inactiva de forma trazable sin borrar',async()=>{
  await call('usuarios-sistema/'+userId,undefined,200,token,'DELETE');
  assert.equal(sql(`SELECT estado||'|'||activo FROM usuarios_sistema WHERE id=${q(userId)};`),'INACTIVO|false');
  assert.equal((await login(email,'Vendedora-Local-2026')).status,401,'Dado de baja inicia sesión');
 });
 await check('Usuarios: sin lectura de usuarios_sistema el acceso falla cerrado (sin 200 vacío)',async()=>{
  const statuses={};await outage('usuarios_sistema',async()=>{for(const r of ['usuarios-sistema','usuarios-sistema/stats'])statuses[r]=(await raw(r)).status;});
  assert.ok(Object.values(statuses).every(s=>s>=400),JSON.stringify(statuses));return {statuses};
 });
 await check('Roles: rol propio con permisos, asignación y aislamiento',async()=>{
  const perms=await call('permissions');const list=Array.isArray(perms)?perms:perms.items??perms.permissions??[];assert.ok(list.length>0,'Catálogo de permisos vacío');
  const pick=list.find(p=>String(p.modulo??p.module??'').toLowerCase().includes('ventas'))??list[0];
  const role=await call('roles',{idempotency_key:randomUUID(),nombre:'VENTAS-LOCAL-'+randomUUID().slice(0,4),descripcion:'Rol local',permission_ids:[pick.id]});
  const rid=role.id??role.role?.id;assert.match(String(rid),/^[0-9a-f-]{36}$/,JSON.stringify(role).slice(0,300));
  const rp=await raw('roles/'+rid+'/permissions');assert.equal(rp.status,200,'Permisos del rol '+rp.status);assert.ok(JSON.stringify(rp.body).includes(pick.id),'Permiso no asignado');
  assert.equal((await raw('roles/'+rid,undefined,otherToken)).status,404,'Rol ajeno visible');
  const ru=await raw('roles/'+rid+'/users');assert.equal(ru.status,200,'Usuarios del rol '+ru.status);
  await call('roles/'+rid,undefined,200,token,'DELETE');
 });
 success=scenarios.every(s=>s.passed);
}catch(error){scenarios.push({scenario:'Usuarios: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'users-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'Usuarios y roles API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(s=>s.passed).length,failed:scenarios.filter(s=>!s.passed).map(s=>s.scenario)}));
