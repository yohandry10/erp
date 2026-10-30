import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
const equal=(a,b,message)=>assert.ok(isDeepStrictEqual(a,b),message);
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {buildPeru570Bundle} from './peru-570-bundle.mjs';
import {peru570StateSql,assertPeru570Preserved,summarizePeru570State} from './peru-570-state.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const filename='570__peru_establishment_structure_from_ui.sql';
const body=fs.readFileSync(path.join(root,'supabase/migrations',filename),'utf8');
const verifier=fs.readFileSync(path.join(root,'supabase/verify',filename),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=new Date().toISOString().replace(/\D/g,'')+'-'+process.pid;
const resume=process.argv.find(a=>a.startsWith('--resume='))?.slice(9);
const name=resume||`erp-peru-570-fresh-${id}`;
assert.match(name,/^erp-peru-570-fresh-[0-9]+-[0-9]+$/);
const reportPath=path.join(root,'artifacts',`${name}-${id}.json`);
const logPath=path.join(root,'artifacts',`${name}.log`);
const keep=process.argv.includes('--keep');
const isolated=process.argv.includes('--isolated');
const report={success:false,remoteWrites:false,postgres:16,container:name,hostPort:isolated?null:55603,network:isolated?'none':'bridge',kept:keep,
 migrationSha256:hash(body),verifierSha256:hash(verifier)};
let created=false;
function docker(args,input,expected){
 const result=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:30*1024*1024});
 if(expected){assert.notEqual(result.status,0,'Control negativo debió fallar');assert.ok(result.stderr.includes(expected),result.stderr);return '';}
 if(result.status!==0){fs.appendFileSync(logPath,result.stderr||result.error?.message||'Fallo sin stderr');throw new Error(`Falló Docker; ${path.basename(logPath)}`);}
 return result.stdout.trim();
}
const sql=(body,expected)=>docker(['exec','-i',name,'psql','-XqAt','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],body,expected);
const snapshot=n=>JSON.parse(sql(peru570StateSql(n)));
try {
 if(!resume){
 docker(['run',...(keep?[]:['--rm']),'--detach','--name',name,'--label',`erp.peru.570.fresh=${id}`,
  ...(isolated?['--network','none']:['--publish','127.0.0.1:55603:5432']),
  '--env','POSTGRES_DB=erp_e2e','--env','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16']);
 created=true;
 let ready=false;
 for(let i=0;i<40;i++){
  const probe=spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','erp_e2e'],{windowsHide:true,stdio:'ignore'});
  if(probe.status===0){ready=true;break;}await delay(250);
 }
 assert.ok(ready,'PostgreSQL local no inició');
 assert.equal(sql('SELECT current_database();'),'erp_e2e');
 sql("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;");
 sql(fs.readFileSync(path.join(root,'scripts/ci/bootstrap-supabase-storage.sql'),'utf8'));
 const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>/^\d+__.*\.sql$/.test(f)).sort((a,b)=>Number(a.split('__')[0])-Number(b.split('__')[0]));
 assert.equal(new Set(files.map(f=>Number(f.split('__')[0]))).size,files.length,'Prefijos duplicados');
 assert.equal(Number(files.at(-1).split('__')[0]),570);
 for(const file of files.filter(f=>Number(f.split('__')[0])<570)){
  sql(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/^\uFEFF/,''));
  fs.appendFileSync(logPath,`Applied ${file}\n`);
 }
 const history=files.filter(f=>Number(f.split('__')[0])<570).map(f=>`('${f.split('__')[0]}','{}','${f.replace(/^\d+_/,'').replace(/\.sql$/,'')}')`).join(',');
 sql(`CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[] NOT NULL DEFAULT '{}',name text);INSERT INTO supabase_migrations.schema_migrations VALUES ${history} ON CONFLICT(version) DO NOTHING;`);
 // El contrato de promoción se ejecuta sobre copia local: identidad ficticia
 // de deployment_environment; la conexión está fijada al contenedor propio.
 sql("UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;");
 } else {
 const owned=JSON.parse(docker(['inspect',name]))[0];
 assert.ok(owned.Config.Labels['erp.peru.570.fresh']);
 if(isolated)assert.equal(owned.HostConfig.NetworkMode,'none','Resume aislado requiere contenedor sin red');
 report.network=owned.HostConfig.NetworkMode;
 report.hostPort=owned.NetworkSettings.Ports?.['5432/tcp']?.[0]?.HostPort?Number(owned.NetworkSettings.Ports['5432/tcp'][0].HostPort):null;
 if(process.argv.includes('--reset')){
 assert.equal(sql('SELECT current_database();'),'erp_e2e');
 // Una base entregada a UAT deja de ser reconstruible por este runner.
 // Incluso una identidad técnica persistida se conserva: los fixtures del
 // verificador usan ROLLBACK y la baseline fresca no contiene usuarios.
 assert.equal(sql('SELECT EXISTS(SELECT 1 FROM public.tenants) OR EXISTS(SELECT 1 FROM public.users);'),'f',
  'No reset: el contenedor conserva empresas o usuarios de UAT');
 docker(['exec',name,'pg_restore','-U','postgres','-d','postgres','--clean','--create','--exit-on-error','/tmp/baseline569.dump']);
 }
 assert.equal(sql('SELECT max(version::integer) FROM supabase_migrations.schema_migrations;'),'569','Resume sólo acepta baseline569 propia');
 }
 if(!resume)docker(['exec',name,'pg_dump','-U','postgres','-d','erp_e2e','--format=custom','--create','--file=/tmp/baseline569.dump']);
 const before=snapshot(569);report.before=summarizePeru570State(before);
 const bundle=buildPeru570Bundle(filename,body);
 sql(bundle.replace(/COMMIT;\s*$/,'SELECT 1/0; COMMIT;'),'division by zero');
 equal(snapshot(569),before,'Rollback dejó cambios');report.atomicRollbackPassed=true;
 sql(bundle);const after=snapshot(570);assertPeru570Preserved(before,after);
 report.after=summarizePeru570State(after);report.preservationPassed=true;
 for(const key of ['existingData','tableSecurity','policies','existingColumns','existingViews','existingFunctions','existingTriggers','historyHash']){
  const changed=structuredClone(after);changed[key]='negative-control';assert.throws(()=>assertPeru570Preserved(before,changed));
 }
 report.preservationNegativeControlsPassed=true;
 sql(verifier);
 equal(snapshot(570),after,'Verificador no revirtió sus cambios');report.sql570Passed=true;
 if(process.argv.includes('--all-verifiers')){
  const verifiers=fs.readdirSync(path.join(root,'supabase/verify')).filter(f=>/^\d+__.*\.sql$/.test(f)&&Number(f.split('__')[0])>=491&&Number(f.split('__')[0])<570).sort((a,b)=>Number(a.split('__')[0])-Number(b.split('__')[0]));
  report.sqlVerifiers=[filename]; // 570 ya pasó arriba: no ejecutar dos veces el mismo contrato.
  for(const file of verifiers){sql(fs.readFileSync(path.join(root,'supabase/verify',file),'utf8').replace(/^\uFEFF/,''));report.sqlVerifiers.push(file);fs.appendFileSync(logPath,`Verified ${file}\n`);}
  report.sqlVerifiers.sort((a,b)=>Number(a.split('__')[0])-Number(b.split('__')[0]));
 }
 assert.equal(hash(fs.readFileSync(path.join(root,'supabase/migrations',filename))),report.migrationSha256,'La fuente570 cambió durante el gate');
 assert.equal(hash(fs.readFileSync(path.join(root,'supabase/verify',filename))),report.verifierSha256,'El verificador570 cambió durante el gate');
 report.success=true;
} finally {
 report.completedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
 if(created&&!keep){
  const inspection=JSON.parse(docker(['inspect',name]))[0];
  assert.equal(inspection.Config.Labels['erp.peru.570.fresh'],id);docker(['stop',name]);
 }
 console.log(JSON.stringify({reportPath,success:report.success,remoteWrites:false,container:name,
  hostPort:report.hostPort,network:report.network,kept:keep,migrationSha256:report.migrationSha256,verifierSha256:report.verifierSha256,
  atomicRollbackPassed:report.atomicRollbackPassed,preservationPassed:report.preservationPassed,
  preservationNegativeControlsPassed:report.preservationNegativeControlsPassed,sql570Passed:report.sql570Passed,
  sqlVerifiersPassed:report.sqlVerifiers?.length,completedAt:report.completedAt},null,2));
}
