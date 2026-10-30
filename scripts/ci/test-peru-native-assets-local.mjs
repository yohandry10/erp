import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';

// Variante Windows del mismo ensayo real de activos. Su binario, perfil y
// namespace SQLite son exclusivos del run efímero; nunca descubre apps ajenas.
assert.equal(process.platform,'win32');
const parallelOnly=process.argv.includes('--two-windows-only');
assert(process.argv.slice(2).every(arg=>arg==='--two-windows-only'));
assert(process.env.LOCAL_NATIVE_PYTHON_BIN&&fs.existsSync(process.env.LOCAL_NATIVE_PYTHON_BIN),'Dos ventanas requieren LOCAL_NATIVE_PYTHON_BIN explícito');
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB,'1');
assert.equal(process.env.E2E_TAURI_STATIC,'1');
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGPORT,'55456');
assert.equal(process.env.PGDATABASE,'erp_e2e');
assert.equal(process.env.LOCAL_API_URL,'http://127.0.0.1:3126');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.env.LOCAL_INTEGRATED_OUTPUT_DIR);
assert.equal(path.dirname(output),path.join(root,'artifacts'));
assert.match(path.basename(output),/^peru-integrated-[0-9]+-[0-9]+$/);
const runId=path.basename(output).slice('peru-integrated-'.length);
const pgId=process.env.LOCAL_NATIVE_PG_CONTAINER_ID;
assert.match(pgId,/^[0-9a-f]{64}$/);
const inspect=JSON.parse(execFileSync('docker',['inspect',pgId],{encoding:'utf8',windowsHide:true}))[0];
assert.equal(inspect.Config.Labels['com.erp.local-test'],runId);
assert.equal(inspect.State.Status,'running');assert.equal(inspect.Mounts.length,1);
// postgres:16 tiene un VOLUME anónimo propio, nunca un volumen de otra ejecución.
assert.equal(inspect.Mounts[0].Type,'volume');
assert.equal(inspect.Mounts[0].Destination,'/var/lib/postgresql/data');
assert.equal(inspect.NetworkSettings.Ports['5432/tcp'][0].HostPort,'55456');
assert.equal(inspect.NetworkSettings.Ports['5432/tcp'][0].HostIp,'127.0.0.1');
const sql=query=>execFileSync(process.env.PSQL_BIN,['-XqAt','-h','127.0.0.1','-p','55456','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',windowsHide:true}).trim();
assert.equal(sql("BEGIN READ ONLY; SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton; ROLLBACK;"),'erp_e2e|DEV|localerpephemeralqax');
const web=path.join(root,'apps/web'),require=createRequire(path.join(web,'package.json'));
const target=path.resolve(process.env.LOCAL_NATIVE_CARGO_TARGET_DIR);
assert.notEqual(target,path.parse(target).root);
const namespace='com.erpsuite.peru.uat.integrated.run'+runId.replaceAll('-','');
assert(!fs.existsSync(path.join(process.env.APPDATA,namespace)),'El namespace SQLite debe ser nuevo');
const profile=path.join(output,'native-webview2-private');assert(!fs.existsSync(profile));
const dist='.next-peru-integrated-native-'+runId;
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const apps=()=>JSON.parse(execFileSync('powershell',['-NoProfile','-Command',"ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter \"Name = 'erp-suite-desktop.exe'\" | Select-Object ProcessId,ExecutablePath,@{n='Created';e={$_.CreationDate.ToUniversalTime().Ticks.ToString()}}) -Compress"],{encoding:'utf8',windowsHide:true}));
const preservedApps=apps().map(p=>({...p,binarySha256:sha(p.ExecutablePath)}));
assert(preservedApps.every(p=>path.resolve(p.ExecutablePath).toLowerCase()!==path.join(target,'debug/erp-suite-desktop.exe').toLowerCase()),'El build no puede sobrescribir un ejecutable en uso');
const sourcePaths=execFileSync('rg',['--files','apps/web/app','apps/web/components','apps/web/contexts','apps/web/hooks','apps/web/lib','apps/web/tests','apps/web/src-tauri/src','apps/web/src-tauri/capabilities'],{cwd:root,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).concat(['apps/web/package.json','apps/web/next.config.js','apps/web/src-tauri/Cargo.toml','apps/web/src-tauri/Cargo.lock','apps/web/src-tauri/build.rs','apps/web/src-tauri/tauri.conf.json','scripts/ci/run-peru-integrated-local.mjs','scripts/ci/test-peru-native-assets-local.mjs','scripts/ci/test-peru-native-origin-local.cjs'],['artifacts/peru-uat-570/native-real-two-window-original-concurrency-ui.py','artifacts/peru-uat-570/run-local-ui-redacted.py','artifacts/peru-uat-570/local_ui_log_redaction.py']);
const sources=()=>Object.fromEntries([...new Set(sourcePaths.map(p=>p.replaceAll('\\','/')))].sort().map(p=>[p,sha(path.join(root,p))]));
const before=sources();
const env={...process.env,NODE_ENV:'production',TAURI_BUILD:'1',NEXT_DIST_DIR:dist,NEXT_PUBLIC_API_URL:'http://127.0.0.1:3126',NEXT_PUBLIC_API_PROXY:'false',NEXT_PUBLIC_COOKIE_AUTH:'0',CARGO_TARGET_DIR:target,CARGO_NET_OFFLINE:'true',CARGO_INCREMENTAL:'0',CARGO_BUILD_JOBS:'1'};
let native,secondNative,success=false,launch;
function start(label,executable,args,cwd=web,childEnv=env){
  const fd=fs.openSync(path.join(output,label+'.log'),'wx');
  const child=spawn(executable,args,{cwd,env:childEnv,windowsHide:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);return child;
}
async function run(label,executable,args,cwd=web){
  const child=start(label,executable,args,cwd);
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(label+' terminó con '+code)));});
}
try{
  assert(!fs.existsSync(path.join(web,'out')),'Conserve la exportación previa antes de generar otra');
  // Rechaza un puerto ocupado; no se conecta a una aplicación preexistente.
  const occupied=execFileSync('powershell',['-NoProfile','-Command',"@(Get-NetTCPConnection -LocalPort 9333 -State Listen -ErrorAction SilentlyContinue).Count"],{encoding:'utf8',windowsHide:true}).trim();
  assert.equal(occupied,'0');
  await run('native-static-export',process.execPath,[require.resolve('next/dist/bin/next'),'build']);
  const exportDir=path.join(web,dist);assert(fs.existsSync(path.join(exportDir,'index.html')));
  assert.deepEqual(sources(),before,'Fuentes cambiadas durante la exportación');
  const configPath=path.join(output,'native-tauri-config.json');
  // Tauri deserializa primero URL: C:\\... se interpreta como file:// y no
  // incorpora los assets. La ruta relativa conserva el protocolo de la app.
  // The official CLI normalizes Cargo.toml line endings. Build a byte-verified
  // owned copy so no frozen candidate source or generated schema is rewritten.
  const nativeSource=path.join(web,'src-tauri'),stage=path.join(output,'native-source','src-tauri');
  fs.mkdirSync(stage,{recursive:true});
  const stageInputs=execFileSync('rg',['--files','src','capabilities','icons'],{cwd:nativeSource,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).concat(['Cargo.toml','Cargo.lock','build.rs','tauri.conf.json']);
  const stagedHashes={};
  for(const name of stageInputs){const targetFile=path.join(stage,name);fs.mkdirSync(path.dirname(targetFile),{recursive:true});fs.copyFileSync(path.join(nativeSource,name),targetFile,fs.constants.COPYFILE_EXCL);stagedHashes[name.replaceAll('\\','/')]=sha(targetFile);assert.equal(sha(targetFile),sha(path.join(nativeSource,name)));}
  const embeddedDist=path.relative(stage,exportDir).replaceAll('\\','/');assert.equal(path.resolve(stage,embeddedDist),exportDir);
  fs.writeFileSync(configPath,JSON.stringify({productName:'ERP UAT efímero Windows',identifier:namespace,build:{beforeBuildCommand:null,frontendDist:embeddedDist},app:{windows:[{label:'main',title:'ERP UAT efímero',width:1400,height:1000,visible:false,skipTaskbar:true,create:false}],security:{csp:"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://127.0.0.1:3126; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost http://127.0.0.1:3126;"}},plugins:{updater:{active:false}}},null,2),{flag:'wx'});
  await run('native-build',process.execPath,[path.join(path.dirname(require.resolve('@tauri-apps/cli/package.json')),'tauri.js'),'build','--debug','--no-bundle','--config',configPath],stage);
  const stagedChanges=Object.keys(stagedHashes).filter(name=>sha(path.join(stage,name))!==stagedHashes[name]);
  assert(stagedChanges.every(name=>name==='Cargo.toml'),'Unexpected mutation of staged build inputs');
  if(stagedChanges.length)assert.equal(fs.readFileSync(path.join(stage,'Cargo.toml'),'utf8'),fs.readFileSync(path.join(nativeSource,'Cargo.toml'),'utf8').replaceAll('\r\n','\n'),'Only official CLI newline normalization allowed');
  fs.writeFileSync(path.join(output,'native-build-inputs.json'),JSON.stringify({sourceHashes:stagedHashes,sourceRoot:nativeSource,buildCopy:stage,generatedChanges:stagedChanges,normalization:'Cargo.toml CRLF to LF only',compiledCargoTomlSha256:sha(path.join(stage,'Cargo.toml')),frozenOriginalSourcesUnchanged:true,frontendDist:exportDir},null,2),{flag:'wx'});
  assert.deepEqual(sources(),before,'Fuentes cambiadas durante el build nativo');
  const binaryDir=path.join(output,'native-binary');fs.mkdirSync(binaryDir);
  const binary=path.join(binaryDir,'erp-suite-desktop.exe');fs.copyFileSync(path.join(target,'debug','erp-suite-desktop.exe'),binary,fs.constants.COPYFILE_EXCL);
  const binarySha256=sha(binary);
  native=start('native-process',binary,[],root,{...env,WEBVIEW2_USER_DATA_FOLDER:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9333 --remote-debugging-address=127.0.0.1'});
  const deadline=Date.now()+60000;let ready=false;
  while(Date.now()<deadline){
    if(native.exitCode!==null)throw Error('La instancia efímera Windows terminó antes del CDP');
    try{const result=await fetch('http://127.0.0.1:9333/json/list',{signal:AbortSignal.timeout(1500)});const pages=await result.json();if(pages.some(p=>p.type==='page'&&p.url.startsWith('http://tauri.localhost'))){ready=true;break}}catch{}
    await delay(500);
  }
  assert(ready,'CDP de la instancia propia no disponible');
  launch={pid:native.pid,binaryPath:binary,binarySha256,cdpPort:9333,webView2Profile:profile,sqliteNamespace:namespace,pgId,originalAndPreservedUATInstancesUntouched:true};
  fs.writeFileSync(path.join(output,'native-launch.json'),JSON.stringify(launch,null,2),{flag:'wx'});
  const runTwoWindows=async()=>{
    // Two host processes intentionally share only this run's new profile and
    // namespace. This exercises cross-window localStorage and Web Locks.
    secondNative=start('native-second-process',binary,[],root,{...env,WEBVIEW2_USER_DATA_FOLDER:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9333 --remote-debugging-address=127.0.0.1'});
    const secondDeadline=Date.now()+60000;let twoPages=false;
    while(Date.now()<secondDeadline){
      if(secondNative.exitCode!==null)throw Error('La segunda ventana propia terminó antes del CDP');
      try{const response=await fetch('http://127.0.0.1:9333/json/list',{signal:AbortSignal.timeout(1500)});const pages=await response.json();if(pages.filter(p=>p.type==='page'&&p.url.startsWith('http://tauri.localhost')).length===2){twoPages=true;break}}catch{}
      await delay(500);
    }
    assert(twoPages,'No se observaron dos ventanas Windows propias');
    for(const pid of [native.pid,secondNative.pid]){const current=apps().find(p=>p.ProcessId===pid);assert.equal(current?.ExecutablePath.toLowerCase(),binary.toLowerCase());assert.equal(sha(current.ExecutablePath),binarySha256);}
    fs.writeFileSync(path.join(output,'native-two-window-launch.json'),JSON.stringify({firstPID:native.pid,secondPID:secondNative.pid,binaryPath:binary,binarySha256,cdpPort:9333,webView2Profile:profile,sqliteNamespace:namespace,pgId,twoRealHostProcesses:true,preservedUATWrites:0},null,2),{flag:'wx'});
    await run('native-two-window-concurrency',process.env.LOCAL_NATIVE_PYTHON_BIN,[path.join(root,'artifacts/peru-uat-570/run-local-ui-redacted.py'),path.join(root,'artifacts/peru-uat-570/native-real-two-window-original-concurrency-ui.py')],root);
    const proof=JSON.parse(fs.readFileSync(path.join(output,'native-two-real-windows-concurrency-ui.json')));assert(proof.complete);assert.equal(proof.steps.length,5);assert.equal(proof.finalUpdateCount,2);assert.deepEqual(proof.scriptErrors,[]);
  };
  if(parallelOnly)await runTwoWindows();
  else{
  const playwrightEnv={...process.env,LOCAL_NATIVE_CDP_URL:'http://127.0.0.1:9333',UAT_ASSERTION_PHASE:'native-assets-ui'};
  const child=start('native-assets-ui',process.execPath,[path.join(path.dirname(require.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-assets-original-local.spec.ts','--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],web,playwrightEnv);
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('UI Windows terminó con '+code)));});
  const proof=JSON.parse(fs.readFileSync(path.join(output,'native-original-assets.json')));
  assert.equal(proof.success,true);assert.equal(proof.surface,'WINDOWS_TAURI_WEBVIEW2');assert.equal(proof.checks.length,5);
  
  await runTwoWindows();
  const criticalEnv={...process.env,LOCAL_NATIVE_CDP_URL:'http://127.0.0.1:9333',UAT_ASSERTION_PHASE:'native-critical-recovery'};
  const criticalChild=start('native-critical-recovery',process.execPath,[path.join(path.dirname(require.resolve('@playwright/test/package.json')),'cli.js'),'test','tests/e2e/peru-recovery-critical-local.spec.ts','--output',path.join(output,'native-critical-browser-results'),'--reporter=list,./tests/e2e/reporters/uat-assertions.ts'],web,criticalEnv);
  await new Promise((resolve,reject)=>{criticalChild.once('error',reject);criticalChild.once('exit',code=>code===0?resolve():reject(Error('Recuperación crítica Windows terminó con '+code)));});
  const criticalProof=JSON.parse(fs.readFileSync(path.join(output,'native-critical-recovery.json')));assert(criticalProof.complete);assert.equal(criticalProof.surface,'WINDOWS_TAURI_WEBVIEW2');assert.equal(criticalProof.steps.length,13);assert.deepEqual(criticalProof.scriptErrors,[]);

  const {checkOrigin}=require(path.join(root,'scripts/ci/test-peru-native-origin-local.cjs'));
  const originProof=await checkOrigin({root,output,launch});assert(originProof.success);assert.equal(originProof.observations.length,3);assert.deepEqual(originProof.unexpectedRequests,[]);

  }
  assert.deepEqual(sources(),before,'Fuentes cambiadas durante UAT Windows');
  success=true;
}finally{
  for(const owned of [secondNative,native].filter(Boolean))if(owned.exitCode===null){
    const processPath=execFileSync('powershell',['-NoProfile','-Command',`(Get-CimInstance Win32_Process -Filter 'ProcessId = ${owned.pid}').ExecutablePath`],{encoding:'utf8',windowsHide:true}).trim();
    assert.equal(processPath.toLowerCase(),launch?.binaryPath.toLowerCase()??path.join(output,'native-binary/erp-suite-desktop.exe').toLowerCase());
    execFileSync('taskkill',['/PID',String(owned.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  }
  const after=apps();
  for(const original of preservedApps){
    const current=after.find(p=>p.ProcessId===original.ProcessId);assert(current,'Una instancia previa cambió durante el ensayo');
    assert.deepEqual(current,{ProcessId:original.ProcessId,ExecutablePath:original.ExecutablePath,Created:original.Created});
    assert.equal(sha(current.ExecutablePath),original.binarySha256);
  }
  fs.writeFileSync(path.join(output,'native-run.json'),JSON.stringify({scope:parallelOnly?'EPHEMERAL_REAL_TWO_WINDOWS_ORIGINAL_CONCURRENCY_API_SQL':'EPHEMERAL_REAL_WINDOWS_ASSET_RECOVERY_TWO_WINDOWS_API_SQL_GL',success,launch,secondPID:secondNative?.pid,preservedApps,previousProcessesAndBinariesPreserved:true,sourceHashes:before,remoteWrites:false,preservedUATWrites:0,completedAt:new Date().toISOString()},null,2),{flag:'wx'});
}
console.log(JSON.stringify({success,nativeRealAssetOperations:parallelOnly?null:5,twoRealWindows:true,criticalRecovery:!parallelOnly,preservedUATWrites:0,remoteWrites:false}));
