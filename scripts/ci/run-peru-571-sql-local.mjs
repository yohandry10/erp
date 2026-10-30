import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildPeru571Bundle } from './peru-571-bundle.mjs';
import { peru571PreservedStateSql, assertPeru571Preserved, peru571PrivateBoundarySql, assertPeru571PrivateBoundary } from './peru-571-state.mjs';

if (process.argv.length !== 2) throw new Error('Este ensayo crea únicamente contenedores propios sin red; no admite destinos ni resume');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const id = new Date().toISOString().replace(/\D/g, '') + '-' + process.pid;
const output = path.join(root, 'artifacts/peru-go-prod-remediation-20261016', 'sql571-' + id);
fs.mkdirSync(output, { recursive:true });
const log = path.join(output, 'rehearsal.log');
const hash = value => createHash('sha256').update(value).digest('hex');
const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => /^\d+__.*\.sql$/.test(f))
  .sort((a,b) => Number(a.split('__')[0])-Number(b.split('__')[0]));
assert.equal(new Set(files.map(f => Number(f.split('__')[0]))).size, files.length, 'Prefijos duplicados');
assert.equal(Number(files.at(-1).split('__')[0]), 571);
const filename = '571__customer_update_durable_intents.sql';
const body = fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8');
const verifier = fs.readFileSync(path.join(root, 'supabase/verify', filename), 'utf8');
const sourceFiles = Object.fromEntries([...files.map(f => 'supabase/migrations/' + f),
  'supabase/verify/' + filename, 'scripts/ci/peru-571-state.mjs', 'scripts/ci/peru-571-bundle.mjs',
  'scripts/ci/run-peru-571-sql-local.mjs', 'apps/erp-api/tests/e2e/fixtures/peru-integrated-local.sql']
  .map(f => [f,hash(fs.readFileSync(path.join(root,f)))]));
const report = { success:false, remoteWrites:false, network:'none', hostPorts:[], sourceFiles, steps:[], output };
const owned=[];
function docker(args, input, expectedError) {
  const r=spawnSync('docker', args, { input, encoding:'utf8', windowsHide:true, timeout:180000, maxBuffer:40*1024*1024 });
  if(expectedError) {
    assert.notEqual(r.status,0,'El control negativo debió fallar');
    assert.ok(r.stderr.includes(expectedError),r.stderr);
    return '';
  }
  if(r.status!==0) { fs.appendFileSync(log,r.stderr||r.error?.message||'Docker falló');throw new Error('Docker falló; revisar '+log); }
  return r.stdout.trim();
}
const sql=(container,text,expectedError) => docker(['exec','-i',container,'psql','-h','127.0.0.1','-XqAt','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],text,expectedError);
const snapshot=container => JSON.parse(sql(container,peru571PreservedStateSql()));
async function createContainer(suffix) {
  const name='erp-peru-571-rehearsal-'+id+'-'+suffix;
  const container=docker(['run','--rm','--detach','--network','none','--name',name,'--label','erp.peru.571.rehearsal='+id,
    '--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB=erp_e2e','postgres:16']);
  assert.match(container,/^[a-f0-9]{64}$/);owned.push(container);
  let ready=false;
  for(let i=0;i<60;i++) {
    if(spawnSync('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','erp_e2e'],{windowsHide:true,stdio:'ignore'}).status===0){ready=true;break;}
    await delay(250);
  }
  assert.ok(ready,'PostgreSQL no inició');
  sql(container,'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;');
  return container;
}
try {
  const pg=await createContainer('upgrade');
  sql(pg,fs.readFileSync(path.join(root,'scripts/ci/bootstrap-supabase-storage.sql'),'utf8'));
  for(const file of files.filter(f=>Number(f.split('__')[0])<571)) {
    sql(pg,fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8').replace(/^\uFEFF/,''));
    fs.appendFileSync(log,'Applied '+file+'\n');
  }
  const literal=v=>`'${v.replaceAll("'","''")}'`;
  const history=files.filter(f=>Number(f.split('__')[0])<571).map(f=>`(${literal(f.split('__')[0])},'{}',${literal(f.replace(/^\d+__/,'').replace(/\.sql$/,''))})`).join(',');
  sql(pg,`CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[] NOT NULL DEFAULT '{}',name text); INSERT INTO supabase_migrations.schema_migrations VALUES ${history} ON CONFLICT(version) DO NOTHING;`);
  sql(pg,fs.readFileSync(path.join(root,'apps/erp-api/tests/e2e/fixtures/peru-integrated-local.sql'),'utf8'));
  // La identidad SQL contractual sólo se simula dentro del contenedor sin red.
  sql(pg,"UPDATE app.deployment_environment SET environment='PROD',project_ref='wypnbcptofqdmoynlonq',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;");
  const before=snapshot(pg);
  assert.ok(Object.keys(before.data).length>200,'Se requieren tablas empresariales reales en la copia efímera');
  fs.writeFileSync(path.join(output,'before.json'),JSON.stringify(before));
  const statements=body.replace(/^BEGIN;\s*\r?\n/m,'').replace(/COMMIT;\s*$/,'');
  sql(pg,`BEGIN;${statements} DO $fail$ BEGIN RAISE EXCEPTION 'PERU_571_FORCED_SECOND_OPERATION_FAILURE'; END $fail$; COMMIT;`,'PERU_571_FORCED_SECOND_OPERATION_FAILURE');
  assertPeru571Preserved(before,snapshot(pg));
  assert.equal(sql(pg,"SELECT to_regclass('public.customer_update_intents') IS NULL AND to_regprocedure('public.actualizar_cliente_idempotente_tx_571(uuid,uuid,uuid,jsonb,text)') IS NULL;"),'t');
  report.steps.push({name:'ddl_second_operation_failure_atomic_rollback',result:'PASS'});
  fs.appendFileSync(log,'PASS ddl_second_operation_failure_atomic_rollback\n');
  const changed=JSON.parse(sql(pg,`BEGIN;UPDATE public.clientes SET telefono='987571900' WHERE id=(SELECT id FROM public.clientes ORDER BY id LIMIT 1);${peru571PreservedStateSql()} ROLLBACK;`));
  let rejected=false;try{assertPeru571Preserved(before,changed);}catch{rejected=true;}assert.ok(rejected,'El control de preservación debe detectar otra fila');
  assertPeru571Preserved(before,snapshot(pg));
  report.steps.push({name:'preservation_negative_control_rejects_row_mutation',result:'PASS'});
  fs.appendFileSync(log,'PASS preservation_negative_control_rejects_row_mutation\n');
  sql(pg,buildPeru571Bundle(filename,body));
  assertPeru571Preserved(before,snapshot(pg));
  assertPeru571PrivateBoundary(JSON.parse(sql(pg,peru571PrivateBoundarySql)));
  report.steps.push({name:'upgrade_570_to_571_preserves_all_existing_data_and_boundaries',result:'PASS'});
  fs.appendFileSync(log,'PASS upgrade_570_to_571_preserves_all_existing_data_and_boundaries\n');
  sql(pg,verifier);
  assertPeru571Preserved(before,snapshot(pg));
  assertPeru571PrivateBoundary(JSON.parse(sql(pg,peru571PrivateBoundarySql)));
  report.steps.push({name:'customer_replay_actor_tenant_and_storage_rollback_regression',result:'PASS'});
  fs.appendFileSync(log,'PASS customer_replay_actor_tenant_and_storage_rollback_regression\n');
  docker(['exec',pg,'pg_dump','-U','postgres','-d','erp_e2e','-Fc','--file','/tmp/candidate571.dump']);
  const backup=path.join(output,'candidate571.dump');docker(['cp',pg+':/tmp/candidate571.dump',backup]);
  report.backup={path:backup,sha256:hash(fs.readFileSync(backup)),bytes:fs.statSync(backup).size};
  const restored=await createContainer('restore');
  // pg_dump no incluye roles globales. Reponer el contrato Storage del
  // bootstrap antes de restaurar, conservando propietarios y ACL del dump.
  sql(restored,fs.readFileSync(path.join(root,'scripts/ci/bootstrap-supabase-storage.sql'),'utf8'));
  docker(['cp',backup,restored+':/tmp/candidate571.dump']);
  docker(['exec',restored,'pg_restore','-U','postgres','-d','erp_e2e','--clean','--if-exists','--exit-on-error','/tmp/candidate571.dump']);
  assertPeru571Preserved(before,snapshot(restored));
  assertPeru571PrivateBoundary(JSON.parse(sql(restored,peru571PrivateBoundarySql)));
  report.steps.push({name:'candidate_571_backup_restores_into_second_isolated_container',result:'PASS'});
  fs.appendFileSync(log,'PASS candidate_571_backup_restores_into_second_isolated_container\n');
  report.preservedTables=Object.keys(before.data).length;
  for(const [file,digest]of Object.entries(sourceFiles))assert.equal(hash(fs.readFileSync(path.join(root,file))),digest,'Fuente cambió durante el ensayo: '+file);
  report.success=true;
} catch(error) {
  report.error=String(error.message).slice(0,3000);
  fs.appendFileSync(log,'FAIL '+report.error+'\n');
  process.exitCode=1;
} finally {
  report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'rehearsal.json'),JSON.stringify(report,null,2));
  for(const container of owned.reverse()) {
    const inspect=JSON.parse(docker(['inspect',container]))[0];
    assert.equal(inspect.Config.Labels['erp.peru.571.rehearsal'],id);assert.equal(inspect.HostConfig.NetworkMode,'none');
    docker(['stop','--time','2',container]);
  }
  console.log(JSON.stringify({success:report.success,remoteWrites:false,report:path.join(output,'rehearsal.json')}));
}
