import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID,randomBytes} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Recuperación de contraseña por correo, cierre de sesión y cierre global con
// API/PostgreSQL locales efímeros y un buzón SMTP local. Nunca envía correo real.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const web=new URL(process.env.LOCAL_WEB_URL);assert.equal(web.hostname,'127.0.0.1');
assert.ok(process.env.LOCAL_SMTP_PORT,'El ensayo exige el buzón SMTP local');
const first=JSON.parse(fs.readFileSync(path.join(output,'auth-first-fixture.json'))),other=JSON.parse(fs.readFileSync(path.join(output,'auth-other-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const literal=value=>{assert.match(value,/^[a-z0-9.@+-]+$/i);return "'"+value+"'";};
const PASSWORD='Cliente-Local-2026-Only!',NEW_PASSWORD='NuevaClave2026$';
const scenarios=[],requests=[];let success=false;
async function raw(endpoint,body,access,method=body===undefined?'GET':'POST'){
 // Respeta el limitador real de las rutas públicas de recuperación: sólo repite tras Retry-After.
 for(let attempt=0;;attempt++){
  const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':randomUUID(),...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
  requests.push({method,endpoint:endpoint.split('?')[0],status:response.status});
  if(response.status===429&&attempt===0&&endpoint.startsWith('auth/password-reset/')){
   const seconds=Number(response.headers.get('retry-after'))||60;assert.ok(seconds>0&&seconds<=60,'Retry-After acotado');
   await delay(seconds*1000+250);continue;
  }
  return {status:response.status,body:value,headers:response.headers};
 }
}
async function call(endpoint,body,status=body===undefined?200:201,access,method){
 const result=await raw(endpoint,body,access,method);assert.equal(result.status,status,(method||(body===undefined?'GET':'POST'))+' '+endpoint+': '+JSON.stringify(result.body).slice(0,400));return result.body;
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const login=async(email,password=PASSWORD)=>raw('auth/login',{email,password});
const session=async(email,password=PASSWORD)=>{const result=await login(email,password);assert.equal(result.status,201,'Login '+result.status);return result.body.access_token;};
const profileStatus=async access=>(await raw('auth/profile',undefined,access)).status;
const smtpDirectory=path.join(output,'smtp');
const mailsTo=email=>fs.existsSync(smtpDirectory)?fs.readdirSync(smtpDirectory).filter(name=>name.endsWith('.json')).sort()
 .map(name=>JSON.parse(fs.readFileSync(path.join(smtpDirectory,name),'utf8'))).filter(mail=>mail.to.some(to=>to.toLowerCase().includes(email.toLowerCase()))):[];
function decodedBody(raw){
 const quoted=raw.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
 const base64=[...raw.matchAll(/Content-Transfer-Encoding:\s*base64\r?\n(?:[^\r\n]+\r?\n)*?\r?\n([A-Za-z0-9+/=\r\n]+)/gi)].map(match=>Buffer.from(match[1].replace(/\s+/g,''),'base64').toString('utf8'));
 return [quoted,...base64].join('\n').replace(/&amp;/g,'&');
}
async function nextResetMail(email,seen){
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  const mail=mailsTo(email).slice(seen).find(item=>/reset-password/.test(decodedBody(item.raw)));
  if(mail){const link=decodedBody(mail.raw).match(/https?:\/\/[^\s"'<>]+reset-password[^\s"'<>]*/)?.[0];assert.ok(link,'Correo de recuperación sin enlace');return new URL(link);}
  await delay(250);
 }
 throw new Error('No llegó el correo de recuperación a '+email);
}
const tokenOf=link=>{const token=link.searchParams.get('token');assert.match(String(token),/^[0-9a-f]{64}$/,'Token ausente en el enlace');return token;};
const outage=async(signature,action)=>{
 sql(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM service_role;`);
 try{assert.equal(sql(`SELECT has_function_privilege('service_role','public.${signature}','EXECUTE');`),'f');return await action();}
 finally{sql(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);}
};
try{
 await check('Recuperación: las rutas que usa la web existen en el API',async()=>{
  const sources=['apps/web/app/reset-password'].flatMap(directory=>fs.readdirSync(directory,{recursive:true}).filter(name=>/\.tsx?$/.test(name)).map(name=>path.join(directory,name)));
  // Rutas literales (`${API_URL}/api/auth/x`) y segmentos pasados a un helper ('password-reset/x').
  const routes=[...new Set(sources.flatMap(file=>{const source=fs.readFileSync(file,'utf8');
   return [...[...source.matchAll(/\/api\/auth\/([a-z][a-z-]*(?:\/[a-z][a-z-]*)*)/g)].map(match=>match[1]),
    ...[...source.matchAll(/['"`](password-reset\/[a-z-]+)\/?['"`]/g)].map(match=>match[1])];}))];
  assert.ok(routes.length>0,'La página de recuperación no llama al API');
  const statuses={};for(const route of routes)statuses[route]=(await raw('auth/'+route,{})).status;
  assert.ok(Object.values(statuses).every(status=>status!==404),'Rutas inexistentes: '+JSON.stringify(statuses));
  return {routes:statuses};
 });
 let firstLink;
 await check('Recuperación: correo existente recibe un enlace a la web con token de un solo uso',async()=>{
  const seen=mailsTo(first.email).length;
  const response=await call('auth/password-reset/request',{email:first.email},200);
  assert.match(String(response.message),/Si el email existe/);
  firstLink=await nextResetMail(first.email,seen);
  assert.equal(firstLink.origin,web.origin,'El enlace no apunta a la web configurada: '+firstLink.origin);
  assert.match(firstLink.pathname,/^\/reset-password\/?$/);
  tokenOf(firstLink);assert.equal(firstLink.searchParams.get('email'),first.email);
  assert.equal(sql(`SELECT password_reset_token IS NOT NULL AND password_reset_expires > now() FROM usuarios_sistema WHERE email=${literal(first.email)};`),'t');
  return {link_origin:firstLink.origin,link_path:firstLink.pathname};
 });
 await check('Recuperación: correo inexistente recibe la misma respuesta y ningún correo',async()=>{
  const unknown=`nadie.${randomUUID().slice(0,8)}@example.test`;
  const response=await call('auth/password-reset/request',{email:unknown},200);
  assert.match(String(response.message),/Si el email existe/);
  await delay(2500);assert.equal(mailsTo(unknown).length,0,'Se envió correo a una cuenta inexistente');
 });
 await check('Recuperación: validar, rechazar token ajeno o débil, confirmar revoca sesiones y no se reutiliza',async()=>{
  assert.ok(firstLink,'Requiere el correo del escenario anterior');
  const token=tokenOf(firstLink);
  const activeA=await session(first.email),activeB=await session(first.email);
  assert.deepEqual(await call('auth/password-reset/validate',{email:first.email,token},200),{valid:true});
  assert.equal((await raw('auth/password-reset/validate',{email:first.email,token:randomBytes(32).toString('hex')})).status,401,'Token erróneo aceptado');
  assert.equal((await raw('auth/password-reset/validate',{email:other.email,token})).status,401,'Token de otro usuario aceptado');
  assert.equal((await raw('auth/password-reset/confirm',{email:first.email,token,newPassword:'debil'})).status,400,'Contraseña débil aceptada');
  assert.equal((await raw('auth/password-reset/confirm',{email:other.email,token,newPassword:NEW_PASSWORD})).status,401,'Confirmó sobre otra cuenta');
  await call('auth/password-reset/confirm',{email:first.email,token,newPassword:NEW_PASSWORD},200);
  assert.equal(await profileStatus(activeA),401,'Sesión previa sigue activa');assert.equal(await profileStatus(activeB),401,'Sesión previa sigue activa');
  assert.equal((await login(first.email)).status,401,'La contraseña anterior sigue sirviendo');
  assert.equal(await profileStatus(await session(first.email,NEW_PASSWORD)),200);
  assert.equal((await raw('auth/password-reset/confirm',{email:first.email,token,newPassword:'OtraClave2026$'})).status,401,'Token reutilizado');
  assert.equal(sql(`SELECT count(*) FROM audit_log a JOIN usuarios_sistema u ON u.id=a.user_id WHERE u.email=${literal(first.email)} AND a.metadata->>'accion'='CONSUMIR_RESET_PASSWORD';`),'1');
  assert.equal((await raw('auth/password-reset/validate',{email:other.email,token})).status,401);
 });
 await check('Recuperación: un token vencido no valida ni cambia la contraseña',async()=>{
  const seen=mailsTo(other.email).length;
  await call('auth/password-reset/request',{email:other.email},200);
  const token=tokenOf(await nextResetMail(other.email,seen));
  sql(`UPDATE usuarios_sistema SET password_reset_expires=now()-interval '1 minute' WHERE email=${literal(other.email)};`);
  assert.equal((await raw('auth/password-reset/validate',{email:other.email,token})).status,401,'Token vencido válido');
  assert.equal((await raw('auth/password-reset/confirm',{email:other.email,token,newPassword:NEW_PASSWORD})).status,401,'Token vencido consumido');
  assert.equal(await profileStatus(await session(other.email)),200,'La contraseña cambió con un token vencido');
 });
 await check('Recuperación: un usuario inactivo no recibe enlace',async()=>{
  sql(`UPDATE usuarios_sistema SET activo=false, estado='INACTIVO' WHERE email=${literal(other.email)};`);
  try{
   const seen=mailsTo(other.email).length;
   await call('auth/password-reset/request',{email:other.email},200);
   await delay(2500);assert.equal(mailsTo(other.email).length,seen,'Usuario inactivo recibió enlace');
  }finally{sql(`UPDATE usuarios_sistema SET activo=true, estado='ACTIVO' WHERE email=${literal(other.email)};`);}
 });
 await check('Sesión: logout revoca sólo la sesión usada',async()=>{
  const closing=await session(first.email,NEW_PASSWORD),kept=await session(first.email,NEW_PASSWORD);
  await call('auth/logout',{},201,closing);
  assert.equal(await profileStatus(closing),401,'La sesión cerrada sigue activa');
  assert.equal(await profileStatus(kept),200,'Logout cerró otra sesión');
 });
 await check('Sesión: logout-all revoca todas las sesiones del usuario y ninguna ajena',async()=>{
  const a=await session(first.email,NEW_PASSWORD),b=await session(first.email,NEW_PASSWORD),foreign=await session(other.email);
  await call('auth/logout-all',{},201,a);
  assert.equal(await profileStatus(a),401);assert.equal(await profileStatus(b),401,'Quedó una sesión del usuario');
  assert.equal(await profileStatus(foreign),200,'Revocó sesiones de otra empresa');
  assert.equal(sql(`SELECT count(*) FROM user_sessions s JOIN usuarios_sistema u ON u.id=s.usuario_sistema_id WHERE u.email=${literal(first.email)} AND s.revoked_at IS NULL;`),'0');
 });
 await check('Sesión: si la revocación global no está disponible, logout-all responde 503 y no informa éxito',async()=>{
  const a=await session(first.email,NEW_PASSWORD),b=await session(first.email,NEW_PASSWORD);
  const status=await outage('revocar_sesiones_usuario_auth_tx(uuid, text)',async()=>(await raw('auth/logout-all',{},a)).status);
  assert.equal(status,503,'Cierre global sin revocar respondió '+status);
  assert.equal(await profileStatus(b),200,'Estado inconsistente tras la falla');
  await call('auth/logout-all',{},201,a);assert.equal(await profileStatus(b),401,'El reintento no revocó');
 });
 await check('Sesión: si la revocación no está disponible, logout responde 503 y la sesión no se da por cerrada',async()=>{
  const a=await session(first.email,NEW_PASSWORD);
  const status=await outage('revocar_sesion_auth_tx(text, uuid, text)',async()=>(await raw('auth/logout',{},a)).status);
  assert.equal(status,503,'Logout sin revocar respondió '+status);
  await call('auth/logout',{},201,a);assert.equal(await profileStatus(a),401,'El reintento no revocó');
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Autenticación: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{fs.writeFileSync(path.join(output,'auth-recovery.json'),JSON.stringify({success,remoteWrites:false,scope:'Recuperación de contraseña y sesiones API/DB/SMTP local; sin aceptación integral',scenarios,requests},null,2));}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
