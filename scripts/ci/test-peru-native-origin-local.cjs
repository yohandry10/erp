// Real WebView2 -> Rust IPC control; no mocked command or business writer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');

async function checkOrigin({root, output, launch, staged = false}) {
  assert.equal(process.platform, 'win32');
  assert.equal(launch.cdpPort, 9333);
  assert(Number.isSafeInteger(launch.pid) && launch.pid > 0);
  assert.match(launch.sqliteNamespace, staged
    ? /^com\.erpsuite\.peru\.uat\.originprobe\.run\d+$/
    : /^com\.erpsuite\.peru\.uat\.integrated\.run\d+$/);
  const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const binary = path.resolve(launch.binaryPath);
  assert.equal(path.dirname(binary), path.join(output, 'native-binary'));
  assert.equal(path.basename(binary), 'erp-suite-desktop.exe');
  assert.equal(sha(binary), launch.binarySha256);
  assert.equal(path.resolve(launch.webView2Profile), path.join(output, 'native-webview2-private'));
  const currentPath = execFileSync('powershell', ['-NoProfile', '-Command',
    `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${launch.pid}').ExecutablePath`],
    {encoding:'utf8',windowsHide:true}).trim();
  assert.equal(currentPath.toLowerCase(), binary.toLowerCase(), 'Only attach to this owned binary');
  const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
  const {chromium} = requireWeb('@playwright/test');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const contexts = browser.contexts();
  assert.equal(contexts.length, 1);
  const page = contexts[0].pages().find(p => new URL(p.url()).origin === 'http://tauri.localhost');
  assert(page, 'Own local Tauri document required before testing');
  const originalUrl = page.url();
  const errors = [], unexpectedRequests = [], observations = [];
  const alias = 'http://tauri.uat-origin.invalid/';
  const localControl = 'http://tauri.localhost/__owned_origin_isolation_control__.html';
  const html = '<!doctype html><title>Owned origin isolation control</title><main id="owned-origin-control">Owned origin isolation control</main>';
  const onError = error => errors.push(error.message.slice(0, 350));
  page.on('pageerror', onError);
  const routeHandler = async route => {
    const request = route.request(), url = new URL(request.url());
    if ((request.url() === alias || request.url() === localControl) && request.method() === 'GET' && request.isNavigationRequest()) {
      return route.fulfill({status:200,contentType:'text/html',body:html});
    }
    if (['http://tauri.localhost','http://ipc.localhost'].includes(url.origin)) return route.continue();
    if (url.origin === 'http://127.0.0.1:3126' && ['GET','HEAD'].includes(request.method())) return route.continue();
    // No real DNS, remote HTTP, credentials or application writer is used.
    unexpectedRequests.push({origin:url.origin,method:request.method()});
    return route.abort('blockedbyclient');
  };
  const invoke = async () => page.evaluate(async () => {
    if (typeof window.__TAURI_INTERNALS__?.invoke !== 'function') return {kind:'BRIDGE_ABSENT'};
    return Promise.race([
      window.__TAURI_INTERNALS__.invoke('get_offline_status',{tenantId:null,userId:null})
        .then(value => ({kind:'ALLOWED',shapeValid:typeof value?.offline_mode === 'boolean' &&
          ['total','pending','failed','synced'].every(k => Number.isSafeInteger(value[k]) && value[k] === 0)}))
        .catch(error => ({kind:'REJECTED',message:String(error).slice(0,900)})),
      new Promise(resolve => setTimeout(() => resolve({kind:'NO_REPLY'}),8000))
    ]);
  });
  let success = false, error = null;
  try {
    await page.route('**/*', routeHandler);
    observations.push({phase:'local-before',origin:new URL(page.url()).origin,...await invoke()});
    assert.equal(observations[0].kind,'ALLOWED'); assert.equal(observations[0].shapeValid,true);
    await page.goto(alias,{waitUntil:'domcontentloaded',timeout:15000});
    assert.equal(page.url(),alias); assert.equal(await page.locator('#owned-origin-control').innerText(),'Owned origin isolation control');
    const foreign = {phase:'foreign-origin',origin:new URL(page.url()).origin,...await invoke()};
    observations.push(foreign);
    assert.equal(foreign.kind,'REJECTED','Foreign document must receive an explicit Rust IPC denial');
    assert.match(foreign.message,/not allowed|denied|forbidden|ACL/i,'Transport failure is not an authorization proof');
    await page.goto(localControl,{waitUntil:'domcontentloaded',timeout:20000});
    assert.equal(page.url(),localControl);
    observations.push({phase:'local-after',origin:new URL(page.url()).origin,...await invoke()});
    assert.equal(observations[2].kind,'ALLOWED'); assert.equal(observations[2].shapeValid,true);
    assert.deepEqual(unexpectedRequests,[]); assert.deepEqual(errors,[]);
    success = true;
  } catch (caught) { error = caught.message; }
  finally {
    await page.unroute('**/*',routeHandler); page.off('pageerror',onError);
    if (page.url() !== originalUrl) {
      try { await page.goto(originalUrl,{waitUntil:'domcontentloaded',timeout:20000}); }
      catch (caught) { error = `${error || ''}; restoration failed: ${caught.message}`; success = false; }
    }
    await browser.close();
    assert.equal(sha(binary),launch.binarySha256);
  }
  const proof = {success,complete:success,surface:'WINDOWS_TAURI_WEBVIEW2_REAL_RUST_IPC',
    scope:staged?'Current Rust core compiled with minimal owned HTML; technical origin isolation only, no business or release binary acceptance':'Origin isolation on exact integrated UAT binary',
    launch,observations,error,scriptErrors:errors,unexpectedRequests,remoteRequests:0,businessWrites:0,
    htmlResponseFixtureOnly:true,ipcAuthorizationMocked:false,sourceScriptSha256:sha(__filename),completedAt:new Date().toISOString()};
  fs.writeFileSync(path.join(output,'native-origin-isolation.json'),JSON.stringify(proof,null,2),{flag:'wx'});
  if (!success) throw Error(error || 'Native origin isolation failed');
  return proof;
}
module.exports = {checkOrigin};
if (require.main === module) {
  const [root,output] = process.argv.slice(2); assert(root && output && process.argv.length === 4);
  const launch = JSON.parse(fs.readFileSync(path.join(output,'native-launch.json')));
  checkOrigin({root:path.resolve(root),output:path.resolve(output),launch,staged:true})
    .then(() => console.log(JSON.stringify({success:true,localControls:2,foreignExplicitDenial:1,businessWrites:0})))
    .catch(error => { console.error(error.message); process.exitCode=1; });
}
