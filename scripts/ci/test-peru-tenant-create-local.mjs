import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';import {execFileSync,spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
// Alta de empresa por el superadministrador (POST /tenants) con API/PostgreSQL
// locales efímeros. La demora del RPC se provoca con un lock local, no con mocks.
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL;assert.equal(new URL(api).hostname,'127.0.0.1');const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const psqlArgs=['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'];
const sql=query=>execFileSync(process.env.PSQL_BIN,psqlArgs,{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const scenarios=[],requests=[];let success=false,token;
async function raw(endpoint,body,{access=token,key=randomUUID(),method=body===undefined?'GET':'POST'}={}){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',connection:'close','idempotency-key':key,...(access?{authorization:'Bearer '+access}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes.toString());}catch{value=bytes.toString();}
 requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id').split('?')[0],status:response.status});
 return {status:response.status,body:value,data:value&&typeof value==='object'&&Object.hasOwn(value,'data')?value.data:value};
}
async function check(scenario,action){try{const detail=await action();scenarios.push({scenario,passed:true,...(detail||{})});}catch(error){scenarios.push({scenario,passed:false,message:String(error.message).slice(0,900)});}}
const ruc=base=>{const weights=[5,4,3,2,7,6,5,4,3,2];const digit=11-weights.reduce((sum,weight,index)=>sum+Number(base[index])*weight,0)%11;return base+String(digit===10?0:digit===11?1:digit);};
const empresa=(base,extra={})=>{const email=`alta.${randomUUID().slice(0,8)}@example.test`;return {ruc:ruc(base),razon_social:'Empresa alta local '+base.slice(-2),direccion:'Av. Alta local 789',pais_id:1,pais:'PE',email,admin_email:email,admin_nombre:'Admin',admin_apellido:'Alta',...extra};};
const empresas=r=>Number(sql(`SELECT count(*) FROM empresa_config WHERE ruc='${r}';`));
const login=(email,password)=>raw('auth/login',{email,password},{access:null});
// Privilegio de plataforma sólo en la base local, siempre retirado al terminar.
const actor=sql("SELECT id FROM usuarios_sistema WHERE email='peru-integrated-restricted-2@example.test' AND NOT is_super_admin;");
assert.match(actor,/^[0-9a-f-]{36}$/i);
try{
 sql(`UPDATE usuarios_sistema SET is_super_admin=true WHERE id='${actor}'::uuid;`);
 token=(await login('peru-integrated-restricted-2@example.test','Local-Peru-2026-Only!')).data.access_token;assert.ok(token,'Sin sesión de superadministrador');
 let created;
 await check('Alta de empresa: crea empresa y administrador que entra con la contraseña temporal',async()=>{
  created=empresa('2098765490');const result=await raw('tenants',created);
  assert.equal(result.status,201,'Alta respondió '+result.status+' '+JSON.stringify(result.body).slice(0,300));
  const password=result.data?.adminUser?.temporaryPassword;assert.ok(password,'Sin contraseña temporal');
  assert.equal((await login(created.admin_email,password)).status,201,'El administrador no puede entrar');assert.equal(empresas(created.ruc),1);
 });
 await check('Alta de empresa: RUC ya registrado responde 409 con un motivo legible',async()=>{
  assert.ok(created,'Sin alta previa');const result=await raw('tenants',{...empresa('2098765490'),ruc:created.ruc});
  assert.equal(result.status,409,'Duplicado respondió '+result.status);
  assert.doesNotMatch(String(result.body?.message),/^TENANT_|_CONFLICT/,'Código interno al usuario: '+result.body?.message);
  assert.match(String(result.body?.message),/RUC|correo|existe/i);assert.equal(empresas(created.ruc),1);
 });
 await check('Alta de empresa: sin confirmación de la base responde 503 legible y el reintento con la misma clave no duplica',async()=>{
  const data=empresa('2098765491',{admin_password:'Alta-Local-2026-Only!'});const key=randomUUID();
  // Un lock local retiene el INSERT del RPC más allá del plazo de 60 s del alta.
  const holder=spawn(process.env.PSQL_BIN,psqlArgs,{windowsHide:true,stdio:['pipe','ignore','ignore']});
  holder.stdin.end('BEGIN; LOCK TABLE public.empresa_config IN SHARE ROW EXCLUSIVE MODE; SELECT pg_sleep(90); COMMIT;\n');
  await delay(1500);
  let first;
  try{
   // El cliente de la sonda espera más que el API: el corte debe ser del API.
   const response=await fetch(api+'/api/tenants',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key,authorization:'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(120000)});
   const body=await response.json().catch(()=>null);requests.push({method:'POST',endpoint:'tenants',status:response.status});first={status:response.status,body};
  }
  finally{sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%pg_sleep(90)%' AND pid<>pg_backend_pid();");await new Promise(resolve=>holder.once('exit',resolve));}
  assert.equal(first.status,503,'Sin confirmación respondió '+first.status+' '+JSON.stringify(first.body).slice(0,300));
  assert.doesNotMatch(String(first.body?.message),/AbortError|aborted/i,'Texto técnico al usuario: '+first.body?.message);
  // Las peticiones retenidas terminan al liberarse el lock; el reintento las encuentra.
  await delay(3000);
  const retry=await raw('tenants',data,{key});
  assert.equal(retry.status,201,'Reintento respondió '+retry.status+' '+JSON.stringify(retry.body).slice(0,300));
  assert.equal(empresas(data.ruc),1);assert.equal((await login(data.admin_email,data.admin_password)).status,201,'El administrador no puede entrar');
 });
 success=scenarios.every(scenario=>scenario.passed);
}catch(error){scenarios.push({scenario:'Alta de empresa: preparación o dependencia',passed:false,message:String(error.message).slice(0,900)});}
finally{
 sql(`UPDATE usuarios_sistema SET is_super_admin=false WHERE id='${actor}'::uuid;`);
 fs.writeFileSync(path.join(output,'tenant-create.json'),JSON.stringify({success,remoteWrites:false,scope:'Alta de empresa por superadministrador API/DB local; sin aceptación integral',scenarios,requests},null,2));
}
console.log(JSON.stringify({success,passed:scenarios.filter(scenario=>scenario.passed).length,failed:scenarios.filter(scenario=>!scenario.passed).map(scenario=>scenario.scenario)}));
if(!success)process.exitCode=1;
