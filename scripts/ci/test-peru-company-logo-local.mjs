import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fetchWithLocalLoginRetry} from './peru-local-http.mjs';
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');assert.equal(process.env.PGDATABASE,'erp_e2e');
const api=process.env.LOCAL_API_URL,gateway=process.env.LOCAL_POSTGREST_URL;
for(const address of [api,gateway])assert.equal(new URL(address).hostname,'127.0.0.1');
const output=process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture=JSON.parse(fs.readFileSync(path.join(output,'configuration-admin-fixture.json')));
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p',process.env.PGPORT,'-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
const q=id=>{assert.match(id,/^[0-9a-f-]{36}$/i);return "'"+id+"'::uuid";};
const tenant=fixture.tenant.id??fixture.tenant.tenant_id??fixture.tenant;q(tenant);
const scenarios=[],requests=[];
const proof={success:false,remoteWrites:false,local_only:true,scope:'Logo: API/SQL y Supabase Storage file real; origen contractual adaptado al transporte loopback. No valida configuración/servicio Storage remoto',scenarios,requests};
let token;
async function call(endpoint,body,method=body===undefined?'GET':'POST',expected=method==='POST'?201:200,headers={}){
 const response=await fetchWithLocalLoginRetry(api+'/api/'+endpoint,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),'idempotency-key':randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.json();requests.push({method,endpoint:endpoint.replace(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,':id'),status:response.status});assert.equal(response.status,expected,JSON.stringify(value));return value.data??value;
}
async function login(email,password){return (await call('auth/login',{email,password})).access_token;}
function crc(bytes){let result=0xffffffff;for(const byte of bytes){result^=byte;for(let n=0;n<8;n++)result=(result>>>1)^((result&1)?0xedb88320:0);}return (result^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),value=Buffer.alloc(data.length+12);value.writeUInt32BE(data.length);tag.copy(value,4);data.copy(value,8);value.writeUInt32BE(crc(Buffer.concat([tag,data])),data.length+8);return value;}
function image(color){const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,...color,255]))),chunk('IEND',Buffer.alloc(0))]);}
async function upload(bytes,key=randomUUID(),expected=201,mime='image/png',headers={}){
 const form=new FormData();if(bytes)form.set('file',new Blob([bytes],{type:mime}),'logo.png');
 const response=await fetch(api+'/api/configuration/empresa/logo',{method:'POST',headers:{authorization:'Bearer '+token,'idempotency-key':key,...headers},body:form});
 const value=await response.json();requests.push({method:'POST',endpoint:'configuration/empresa/logo',status:response.status});assert.equal(response.status,expected,JSON.stringify(value));return value.data??value;
}
const fingerprint=()=>sql("SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM empresa_logo_assets a),(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM empresa_logo_operaciones o),(SELECT jsonb_agg(to_jsonb(s)-'last_accessed_at' ORDER BY id) FROM storage.objects s),(SELECT jsonb_agg(jsonb_build_array(tenant_id,logo_url) ORDER BY tenant_id) FROM empresa_config))::text);");
const pass=scenario=>scenarios.push({scenario,passed:true});
const localUrl=address=>{const url=new URL(address);assert.equal(url.origin,'https://wypnbcptofqdmoynlonq.supabase.co');return gateway+url.pathname;};
const checkBytes=async (address,expected)=>{const r=await fetch(localUrl(address));assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),expected);};
const jwt=role=>{const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const payload=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,exp:Math.floor(Date.now()/1000)+7200});return payload+'.'+createHmac('sha256','local-integration-key-only-never-production-20260905').update(payload).digest('base64url');};
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
try{
 token=await login(fixture.email,'Cliente-Local-2026-Only!');const ownerToken=token;
 const permission=sql(`SELECT id FROM permisos WHERE tenant_id=${q(tenant)} AND codigo='configuracion.read';`);q(permission);
 const role=await call('roles',{nombre:'LECTOR_LOGO_LOCAL',permission_ids:[permission],idempotency_key:randomUUID()});
 await call('users',{nombre:'Lector logo local',email:'reader-logo-local@example.test',password:'Lector-Local-2026!',roles:[role.id],idempotency_key:randomUUID()});
 const readerToken=await login('reader-logo-local@example.test','Lector-Local-2026!');token=ownerToken;
 // Marca sólo del fixture local para ejercitar el contrato SQL de origen. El harness bloquea sockets externos.
 sql("UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=false WHERE singleton;");
 const red=image([255,0,0]),blue=image([0,0,255]),green=image([0,255,0]);
 const key=randomUUID(),first=await upload(red,key);assert.equal(first.completed,true);assert.ok(first.object_path.startsWith(tenant+'/logos/'));await checkBytes(first.logo_url,red);
 assert.equal(sql(`SELECT logo_url FROM empresa_config WHERE tenant_id=${q(tenant)};`),first.logo_url);pass('Logo: alta real, ruta por tenant, bytes SHA y empresa persistidos');
 const beforeReplay=fingerprint(),replay=await upload(red,key);assert.equal(replay.asset_id,first.asset_id);assert.equal(replay.operation_id,first.operation_id);assert.equal(fingerprint(),beforeReplay);pass('Logo: mismo intento recupera ID sin otro asset/objeto');
 const same=await upload(red);assert.equal(same.asset_id,first.asset_id);assert.equal(sql("SELECT count(*) FROM storage.objects WHERE bucket_id='company-assets';"),'1');pass('Logo: clave nueva con mismo contenido adopta el objeto activo');
 const beforeNeg=fingerprint();await upload(blue,key,409);await upload(Buffer.from('texto'),randomUUID(),400);await upload(red,randomUUID(),400,'image/svg+xml');await upload(undefined,randomUUID(),400);await upload(Buffer.alloc(2097153),randomUUID(),413);assert.equal(fingerprint(),beforeNeg);pass('Logo: conflicto, MIME, bytes corruptos, falta de archivo y límite rechazan sin residuos');
 const newer=await upload(blue);await checkBytes(newer.logo_url,blue);const old=await fetch(localUrl(first.logo_url));assert.equal(old.status,400);assert.equal(sql("SELECT count(*) FROM storage.objects WHERE bucket_id='company-assets';"),'1');assert.equal(sql(`SELECT estado FROM empresa_logo_assets WHERE id=${q(first.asset_id)};`),'BORRADA');pass('Logo: reemplazo limpia objeto anterior y conserva historia');
 token=readerToken;const guarded=fingerprint();await upload(green,randomUUID(),403);await call('configuration/empresa/logo',undefined,'DELETE',403);assert.equal(fingerprint(),guarded);token=ownerToken;pass('Logo: lector no carga ni elimina sin mutación');
 for(const roleName of ['anon','authenticated']){
  const direct=await fetch(gateway+'/storage/v1/object/company-assets/'+tenant+'/logos/unauthorized.png',{method:'POST',headers:{authorization:'Bearer '+jwt(roleName),'content-type':'image/png'},body:red});assert.ok([400,403].includes(direct.status));
  const list=await fetch(gateway+'/storage/v1/object/list/company-assets',{method:'POST',headers:{authorization:'Bearer '+jwt(roleName),'content-type':'application/json'},body:JSON.stringify({prefix:tenant+'/logos/',limit:100,offset:0})});assert.equal(list.status,200);assert.deepEqual(await list.json(),[]);
 }
 assert.equal(sql("SELECT count(*) FROM storage.objects WHERE bucket_id='company-assets';"),'1');pass('Logo: RLS impide listar/escribir directamente; URL pública permite sólo lectura del archivo');
 sql("CREATE FUNCTION public.fail_logo_finalize_local() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.estado='ACTIVA' THEN RAISE EXCEPTION 'LOCAL_LOGO_FINALIZE_FAILURE'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_logo_finalize_local BEFORE UPDATE ON empresa_logo_assets FOR EACH ROW EXECUTE FUNCTION public.fail_logo_finalize_local();");
 const lostKey=randomUUID();try{await upload(green,lostKey,400);assert.equal(sql("SELECT count(*) FROM storage.objects WHERE bucket_id='company-assets';"),'2');assert.equal(sql(`SELECT logo_url FROM empresa_config WHERE tenant_id=${q(tenant)};`),newer.logo_url);}finally{sql('DROP TRIGGER fail_logo_finalize_local ON empresa_logo_assets; DROP FUNCTION public.fail_logo_finalize_local();');}
 const recovered=await upload(green,lostKey);await checkBytes(recovered.logo_url,green);assert.equal(sql("SELECT count(*) FROM storage.objects WHERE bucket_id='company-assets';"),'1');pass('Logo: fallo real después de almacenar recupera objeto por SHA y finaliza sin duplicar');
 const secondFixture=JSON.parse(fs.readFileSync(path.join(output,'company-logo-fixture.json')));const otherToken=await login(secondFixture.email,'Cliente-Local-2026-Only!');token=otherToken;const other=await upload(red);assert.notEqual(other.asset_id,recovered.asset_id);assert.ok(!other.object_path.startsWith(tenant+'/'));assert.equal(sql(`SELECT logo_url FROM empresa_config WHERE tenant_id=${q(tenant)};`),recovered.logo_url);pass('Logo: otra empresa obtiene ruta aislada y no cambia configuración del propietario');
 token=ownerToken;const deletionKey=randomUUID(),deleted=await call('configuration/empresa/logo',undefined,'DELETE',200,{'idempotency-key':deletionKey});assert.equal(deleted.logo_url,null);assert.equal(sql(`SELECT coalesce(logo_url,'') FROM empresa_config WHERE tenant_id=${q(tenant)};`),'');const deletedHash=fingerprint();await call('configuration/empresa/logo',undefined,'DELETE',200,{'idempotency-key':deletionKey});assert.equal(fingerprint(),deletedHash);await checkBytes(other.logo_url,red);pass('Logo: eliminación y replay limpian empresa/objeto sin afectar el otro tenant');
 fs.writeFileSync(path.join(output,'logo-local-red.png'),red);fs.writeFileSync(path.join(output,'logo-local-blue.png'),blue);
 proof.success=true;
}catch(error){proof.error=error.message;throw error;}
finally{
 sql("UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true WHERE singleton;");
 proof.checkedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'company-logo.json'),JSON.stringify(proof,null,2));
}
