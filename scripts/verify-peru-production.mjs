import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Sólo preflight y consultas de lectura; nunca crea datos ni emite documentos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  assert.ok(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `Falta ${name}`);
  return args[index + 1];
};
const commit = option('--sha');
assert.match(commit, /^[a-f0-9]{40}$/);
const schema = Number(option('--schema'));
assert.ok(Number.isInteger(schema) && schema >= 553);
const output = path.resolve(root, option('--output'));
assert.equal(path.dirname(output), path.join(root, 'artifacts'));
const envFile = fs.realpathSync(option('--env-file'));
assert.equal(path.basename(envFile), '.env.production');
const preflight = spawnSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts/db-environment-preflight.ps1'),
  '-Environment', 'PROD', '-EnvFile', envFile], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
assert.equal(preflight.status, 0, 'El preflight PROD debe pasar antes de consultar');
const gh = parameters => {
  const result = spawnSync('gh', parameters, { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, 'Falló la consulta de lectura a GitHub');
  return JSON.parse(result.stdout);
};
const githubMain = gh(['run', 'list', '--commit', commit, '--branch', 'main', '--limit', '20',
  '--json', 'name,status,conclusion,headSha,url']);
const deployments = gh(['api', `repos/yohandry10/erp/deployments?sha=${commit}&environment=Production`]);
assert.ok(deployments.length, 'Falta el despliegue Production del commit');
const deployment = deployments[0];
const deploymentStatuses = gh(['api', `repos/yohandry10/erp/deployments/${deployment.id}/statuses`]);
const jsonRequest = async endpoint => {
  const response = await fetch(`https://erp-api-2p7i.onrender.com/api/${endpoint}`, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, `HTTP ${endpoint}`);
  return response.json();
};
const [version, ready, health, login, cors] = await Promise.all([
  jsonRequest('health/version'), jsonRequest('health/ready'), jsonRequest('health'),
  fetch('https://erp-web-zeta-neon.vercel.app/login', { signal: AbortSignal.timeout(20000) }),
  fetch('https://erp-api-2p7i.onrender.com/api/auth/login', { method: 'OPTIONS',
    headers: { Origin: 'https://erp-web-zeta-neon.vercel.app', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(20000) }),
]);
const report = {
  verified_at_utc: new Date().toISOString(), merge_sha: commit,
  read_only: true, synthetic_prod_writes: false, prod_preflight: 'passed: authorized project and internal marker',
  github_main: githubMain,
  render: { version, ready, health, effective_plan: 'not_verified_administratively' },
  vercel: { production_deployment_id: deployment.id, deployment_state: deploymentStatuses[0]?.state,
    login_follow_redirect_http_status: login.status }, cors_preflight_http_status: cors.status,
  launch_result: 'not_accepted: functional matrix gaps remain', verification_passed: false,
};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
for (const name of ['CI', 'E2E web aislado', 'Security Scan']) {
  const run = githubMain.find(row => row.name === name);
  assert.ok(run && run.headSha === commit && run.status === 'completed' && run.conclusion === 'success', `Pendiente workflow ${name}`);
}
assert.equal(version.commit, commit, 'Render debe servir el commit integrado');
assert.equal(ready.status, 'ready');
assert.equal(ready.checks.database.contract.schema_version, schema);
assert.equal(ready.checks.database.contract.required_schema_version, schema);
assert.equal(ready.checks.redis.ready, true);
assert.equal(deploymentStatuses[0]?.state, 'success');
assert.equal(login.status, 200);
assert.equal(cors.status, 204);
assert.equal(cors.headers.get('access-control-allow-origin'), 'https://erp-web-zeta-neon.vercel.app');
report.verification_passed = true;
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, commit, schema, verification_passed: true, launch_accepted: false }));
