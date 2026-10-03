import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,createHmac} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const [source,restoredDatabase,network,outputArg]=process.argv.slice(2);
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.argv.length,6);
for(const id of [source,restoredDatabase])assert.match(id,/^[0-9a-f]{64}$/);
assert.match(network,/^erp-peru-integrated-\d+-\d+$/);
const output=path.resolve(outputArg);
assert.ok(output.startsWith(path.resolve('artifacts')+path.sep));
const image='supabase/storage-api@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85';
const docker=(args,options={})=>execFileSync('docker',args,{windowsHide:true,timeout:60000,maxBuffer:100*1024*1024,...options});
const inspect=id=>JSON.parse(docker(['inspect',id],{encoding:'utf8'}))[0];
const origin=inspect(source),database=inspect(restoredDatabase);
assert.equal(origin.Config.Image,image);assert.equal(database.Config.Image,'postgres:16');
assert.ok(origin.NetworkSettings.Networks[network]);assert.ok(database.NetworkSettings.Networks[network]);
const networkInfo=JSON.parse(docker(['network','inspect',network],{encoding:'utf8'}))[0];
assert.equal(networkInfo.Labels['com.erp.local-test'],network.replace('erp-peru-integrated-',''));
assert.ok(origin.Config.Env.includes('STORAGE_BACKEND=file'));
assert.ok(origin.Config.Env.includes('FILE_STORAGE_BACKEND_PATH=/var/lib/storage'));
assert.match(database.Name,/^\/erp-peru-restore-\d+-\d+$/);
const sql=query=>docker(['exec','-i',restoredDatabase,'psql','-XqAt','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8'}).trim();
assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"),'erp_e2e|DEV|localerpephemeralqax');
const objects=JSON.parse(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)),'[]') FROM storage.objects WHERE bucket_id='company-assets';"));
assert.ok(objects.length>0,'El ensayo necesita un objeto activo para recuperar');
const sourceUrl=new URL(process.env.LOCAL_STORAGE_URL);assert.equal(sourceUrl.hostname,'127.0.0.1');
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt=role=>{const payload=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,exp:Math.floor(Date.now()/1000)+7200});return payload+'.'+createHmac('sha256','local-integration-key-only-never-production-20260905').update(payload).digest('base64url');};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const proof={success:false,remoteWrites:false,scope:'Restore DB verificado más archivos Storage file en servidor nuevo; lectura HTTP y SHA iguales. No acredita respaldo Storage remoto ni RTO productivo',objects:[]};
let target;
try{
 const archive=docker(['exec',source,'tar','-C','/var/lib/storage','-cf','-','.']);
 mkdirSync(path.join(output,'backup'),{recursive:true});
 writeFileSync(path.join(output,'backup/storage-files.tar'),archive);
 proof.archive_bytes=archive.length;proof.archive_sha256=sha(archive);
 target=docker(['run','--rm','--detach','--name',network+'-restored-storage','--network',network,'--publish','127.0.0.1:55520:5000',
  '--env','ANON_KEY='+jwt('anon'),'--env','SERVICE_KEY='+jwt('service_role'),'--env','AUTH_JWT_SECRET=local-integration-key-only-never-production-20260905',
  '--env',`DATABASE_URL=postgres://postgres@${database.Name.slice(1)}:5432/erp_e2e`,'--env',`POSTGREST_URL=http://${network}-rest:3000`,
  '--env','STORAGE_BACKEND=file','--env','FILE_STORAGE_BACKEND_PATH=/var/lib/storage','--env','TENANT_ID=local-storage-peru-only','--env','REGION=local','--env','GLOBAL_S3_BUCKET=local-ephemeral','--env','FILE_SIZE_LIMIT=2097152','--env','ENABLE_IMAGE_TRANSFORMATION=false',image],{encoding:'utf8'}).trim();
 assert.match(target,/^[0-9a-f]{64}$/);
 let ready=false;
 for(let attempt=0;attempt<60;attempt++){
  try{const r=await fetch('http://127.0.0.1:55520/status',{signal:AbortSignal.timeout(1000)});await r.body?.cancel();if(r.status===200){ready=true;break;}}catch{}
  await delay(500);
 }
 assert.ok(ready,'Storage restaurado debe estar disponible');
 docker(['exec','-i',target,'tar','-C','/var/lib/storage','-xf','-'],{input:archive});
 for(const object of objects){
  assert.equal(object.bucket,'company-assets');assert.ok(!object.name.includes('..'));
  const suffix='/object/public/'+encodeURIComponent(object.bucket)+'/'+object.name.split('/').map(encodeURIComponent).join('/');
  const read=async url=>{const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());};
  const before=await read(sourceUrl.origin+suffix),after=await read('http://127.0.0.1:55520'+suffix);
  assert.deepEqual(after,before);assert.ok(after.length>0);
  proof.objects.push({path_sha256:sha(object.name),bytes:after.length,content_sha256:sha(after)});
 }
 proof.success=true;
}catch(error){proof.error=error.message;throw error;}
finally{
 if(target)docker(['stop','--time','2',target],{stdio:'ignore'});
 proof.checkedAt=new Date().toISOString();writeFileSync(path.join(output,'storage-restore.json'),JSON.stringify(proof,null,2));
}
