import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Notificaciones (campana) con API/PostgreSQL locales efímeros: visibilidad por
// destinatario, rol y empresa, marcado, borrado e indisponibilidad.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const first=JSON.parse(fs.readFileSync(path.join(output,'notif-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'notif-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const PASSWORD='Cliente-Local-2026-Only!';
let admin,otherAdmin,seller;const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access=admin,method=body===undefined?'GET':'POST'){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':randomUUID(),...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function call(endpoint,body,status=body===undefined?200:201,access=admin,method){
 const result=await raw(endpoint,body,access,method);assert.equal(result.status,status,(method||(body===undefined?'GET':'POST'))+' '+endpoint.split('?')[0]+': '+JSON.stringify(result.body).slice(0,400));
 if(result.body&&typeof result.body==='object'&&'success' in result.body)assert.equal(result.body.success,true,'Respuesta 2xx con success:false: '+JSON.stringify(result.body).slice(0,300));
 return result.data;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const login=async(email,password=PASSWORD)=>{const result=await raw('auth/login',{email,password},undefined);assert.equal(result.status,201,'Login '+result.status);return result.body.access_token;};
const ids=list=>new Set((list||[]).map(item=>item.id));
const create=async(body,access=admin)=>{const created=await call('notifications',{severity:'info',type:'stock_bajo',message:'Mensaje local',...body},201,access);assert.match(String(created.id),/^[0-9a-f-]{36}$/);return created.id;};
const outage=async(grant,revoke,action)=>{sql(revoke);try{return await action();}finally{sql(grant);}};
try{
 admin=await login(first.email);otherAdmin=await login(other.email);
 const role=name=>sql(`SELECT coalesce((SELECT id::text FROM roles WHERE tenant_id=${q(first.tenant)} AND upper(nombre)='${name}' AND activo ORDER BY created_at LIMIT 1),'');`);
 const vendedor=role('VENDEDOR');assert.match(vendedor,/^[0-9a-f-]{36}$/,'Rol VENDEDOR ausente');
 const sellerEmail=`vendedor.notif.${randomUUID().slice(0,8)}@local.test`;
 const createdSeller=await raw('usuarios-sistema/crear',{idempotency_key:randomUUID(),nombre:'Vendedor',apellido:'Avisos',email:sellerEmail,password:'Vendedor-Local-2026',rol_id:vendedor,estado:'ACTIVO'});
 assert.equal(createdSeller.status,201,JSON.stringify(createdSeller.body).slice(0,300));
 const sellerId=createdSeller.data.usuario_id??createdSeller.data.id??createdSeller.data.usuario?.id;assert.match(String(sellerId),/^[0-9a-f-]{36}$/);
 seller=await login(sellerEmail,'Vendedor-Local-2026');
 const adminId=sql(`SELECT id FROM usuarios_sistema WHERE email='${first.email}';`);
 const n={};
 await check('Notificaciones: alta y visibilidad por destinatario, rol y empresa',async()=>{
  n.adminOwn=await create({title:'Para el administrador',usuario_id:adminId});
  n.global=await create({title:'Global de la empresa',type:'integration_error',severity:'error'});
  n.role=await create({title:'Para vendedores',roles_destinatarios:[vendedor]});
  n.sellerOwn=await create({title:'Para el vendedor',usuario_id:sellerId});
  n.foreign=await create({title:'Global de otra empresa'},otherAdmin);
  const adminList=ids(await call('notifications'));
  assert.ok(adminList.has(n.adminOwn)&&adminList.has(n.global),'El administrador no ve lo suyo o lo global');
  assert.ok(!adminList.has(n.sellerOwn)&&!adminList.has(n.role)&&!adminList.has(n.foreign),'El administrador ve notificaciones ajenas');
  const sellerUnread=ids(await call('notifications/unread',undefined,200,seller));
  for(const id of [n.sellerOwn,n.global,n.role])assert.ok(sellerUnread.has(id),'El vendedor no ve '+id);
  assert.ok(!sellerUnread.has(n.adminOwn)&&!sellerUnread.has(n.foreign),'El vendedor ve notificaciones ajenas');
 });
 await check('Notificaciones: un usuario sin permisos administrativos abre la lista de su campana',async()=>{
  const list=await raw('notifications',undefined,seller);
  assert.equal(list.status,200,'La campana muestra avisos pero la lista responde '+list.status);
  assert.deepEqual([...ids(list.data)].sort(),[...ids(await call('notifications/unread',undefined,200,seller))].sort());
 });
 await check('Notificaciones: el contador de no leídas coincide con la lista',async()=>{
  for(const [label,token] of [['administrador',admin],['vendedor',seller]]){
   const count=await call('notifications/unread-count',undefined,200,token),list=await call('notifications/unread',undefined,200,token);
   assert.equal(Number(count.unread_count),list.length,`Contador del ${label} ${count.unread_count} y lista ${list.length}`);
  }
 });
 await check('Notificaciones: marcar leída propia, de otro usuario, de otra empresa, inexistente y mal formada',async()=>{
  const read=await call('notifications/'+n.adminOwn+'/read',{},200,admin,'PUT');assert.equal(read.leida,true);
  assert.equal(sql(`SELECT leida FROM notificaciones WHERE id=${q(n.adminOwn)};`),'t');
  const statuses={};
  statuses.otherUser=(await raw('notifications/'+n.sellerOwn+'/read',{},admin,'PUT')).status;
  statuses.otherTenant=(await raw('notifications/'+n.foreign+'/read',{},admin,'PUT')).status;
  statuses.missing=(await raw('notifications/'+randomUUID()+'/read',{},admin,'PUT')).status;
  statuses.malformed=(await raw('notifications/no-es-uuid/read',{},admin,'PUT')).status;
  assert.deepEqual(statuses,{otherUser:404,otherTenant:404,missing:404,malformed:400},JSON.stringify(statuses));
  assert.equal(sql(`SELECT count(*) FROM notificaciones WHERE id IN (${q(n.sellerOwn)},${q(n.foreign)}) AND leida;`),'0','Se marcó una ajena');
 });
 await check('Notificaciones: marcar todas deja sin pendientes lo que el usuario ve, incluidas globales y de su rol',async()=>{
  await call('notifications/mark-all-read',{},200,seller,'PUT');
  const left=await call('notifications/unread',undefined,200,seller);
  assert.deepEqual(left.map(item=>item.title),[],'Siguen pendientes tras marcar todas');
  assert.equal(sql(`SELECT leida FROM notificaciones WHERE id=${q(n.foreign)};`),'f','Marcó una de otra empresa');
 });
 await check('Notificaciones: eliminar propia; ajena 404; sin permiso 403 y la notificación queda',async()=>{
  const keep=await create({title:'Personal del vendedor para borrar',usuario_id:sellerId});
  assert.equal((await raw('notifications/'+keep,undefined,seller,'DELETE')).status,403,'Vendedor sin notifications.delete');
  assert.equal(sql(`SELECT count(*) FROM notificaciones WHERE id=${q(keep)};`),'1');
  assert.equal((await raw('notifications/'+n.foreign,undefined,admin,'DELETE')).status,404,'Borrado de otra empresa');
  assert.equal((await raw('notifications/'+n.sellerOwn,undefined,admin,'DELETE')).status,404,'Borrado de otro usuario');
  assert.equal(sql(`SELECT count(*) FROM notificaciones WHERE id IN (${q(n.foreign)},${q(n.sellerOwn)});`),'2');
  await call('notifications/'+n.adminOwn,undefined,200,admin,'DELETE');
  assert.equal(sql(`SELECT count(*) FROM notificaciones WHERE id=${q(n.adminOwn)};`),'0');
 });
 await check('Notificaciones: sin lectura de notificaciones la campana responde 503',async()=>{
  const statuses={};
  await outage('GRANT SELECT ON public.notificaciones TO service_role;','REVOKE SELECT ON public.notificaciones FROM service_role;',async()=>{
   for(const route of ['notifications','notifications/unread','notifications/unread-count'])statuses[route]=(await raw(route)).status;
  });
  assert.ok(Object.values(statuses).every(status=>status===503),JSON.stringify(statuses));
 });
 await check('Notificaciones: sin el writer, marcar y borrar responden 503 sin cambiar estado',async()=>{
  const target=await create({title:'Para la caída del writer',usuario_id:adminId});
  const statuses={};
  await outage('GRANT EXECUTE ON FUNCTION public.gestionar_notificacion_tx(uuid,uuid,text,jsonb) TO service_role;','REVOKE EXECUTE ON FUNCTION public.gestionar_notificacion_tx(uuid,uuid,text,jsonb) FROM service_role;',async()=>{
   statuses.read=(await raw('notifications/'+target+'/read',{},admin,'PUT')).status;
   statuses.all=(await raw('notifications/mark-all-read',{},admin,'PUT')).status;
   statuses.remove=(await raw('notifications/'+target,undefined,admin,'DELETE')).status;
  });
  assert.deepEqual(statuses,{read:503,all:503,remove:503},JSON.stringify(statuses));
  assert.equal(sql(`SELECT leida FROM notificaciones WHERE id=${q(target)};`),'f');
  await call('notifications/'+target+'/read',{},200,admin,'PUT');
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Notificaciones: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'notifications-operations.json'),JSON.stringify({success,remoteWrites:false,scope:'Notificaciones API/DB local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
