import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { backports, runPnpm, verifySecurityBackports } from './verify-security-backports.mjs';
import { verifySecurityUpgrades } from './verify-security-upgrades.mjs';

// Registry advisories remain visible. A version-based finding is mitigated only
// after every installed copy matches the reviewed patch and passes regressions.
const verified = verifySecurityBackports();
const verifiedUpgrades = verifySecurityUpgrades();
let audit;
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = runPnpm(['audit', '--json']);
  try {
    audit = JSON.parse(result.stdout);
    if (audit.error) throw new Error(JSON.stringify(audit.error));
    assert.ok([0, 1].includes(result.status), 'Registry audit did not complete');
    assert.ok(audit.advisories && audit.metadata?.vulnerabilities, 'Invalid registry audit response');
    assert.equal(audit.muted?.length ?? 0, 0, 'Muted registry findings are not supported');
    break;
  } catch (error) {
    const diagnostic = `${result.stdout}\n${result.stderr}\n${error.message}`;
    if (attempt === 3 || !/ERR_SOCKET_TIMEOUT|ECONNRESET|ETIMEDOUT|EAI_AGAIN|5\d\d/.test(diagnostic)) throw error;
    await new Promise(resolve => setTimeout(resolve, attempt * 15000));
  }
}
const findings = Object.values(audit.advisories);
// metadata cuenta copias instaladas; advisories agrupa por aviso. Se compara
// por versiones vulnerables para que ningún hallazgo del registro quede fuera.
for (const severity of ['high', 'critical']) {
  const copies = findings.filter(finding => finding.severity === severity)
    .reduce((total, finding) => total + new Set((finding.findings ?? []).map(row => row.version)).size, 0);
  assert.equal(copies, audit.metadata.vulnerabilities[severity], `Missing ${severity} registry findings`);
}
// Avisos sin versión corregida publicada cuyo paquete no llega al runtime: sólo
// lo carga una herramienta de compilación con patrones de configuración. Se
// acepta mientras el registro no publique corrección y el árbol de producción
// lo confirme; en cuanto exista la versión corregida, vuelve a bloquear.
const buildOnly = {
  'GHSA-fc5q-39xc-vjpf': {
    package: 'picomatch', via: '@rollup/plugin-commonjs', reviewed: '2026-11-17',
    reason: 'ReDoS con patrones glob del atacante; sólo lo usa el empaquetador de @sentry/nextjs durante next build',
  },
};
function productionPaths(pkg) {
  const paths = [];
  for (const workspace of ['@erp-suite/erp-api', '@erp-suite/web', '@erp-suite/crypto', '@erp-suite/dtos']) {
    const result = runPnpm(['why', pkg, '--prod', '--json', '--filter', workspace]);
    assert.equal(result.status, 0, `pnpm why ${pkg} ${workspace}`);
    const walk = (node, trail) => {
      for (const [name, dep] of Object.entries(node ?? {})) {
        const next = [...trail, name];
        if (name === pkg) paths.push(next);
        walk(dep.dependencies, next);
      }
    };
    for (const project of JSON.parse(result.stdout || '[]')) walk(project.dependencies, [workspace]);
  }
  return paths;
}
const mitigated = [];
const unresolved = [];
const accepted = [];
for (const finding of findings) {
  const exception = buildOnly[finding.github_advisory_id];
  if (exception && exception.package === finding.module_name && finding.patched_versions === '<0.0.0') {
    const paths = productionPaths(finding.module_name);
    assert.ok(paths.every(trail => trail[0] === '@erp-suite/web' && trail.includes(exception.via)),
      `${finding.module_name} llega a producción fuera de ${exception.via}: ${JSON.stringify(paths)}`);
    accepted.push({ advisory: finding.github_advisory_id, package: finding.module_name, severity: finding.severity,
      productionPaths: paths.length, ...exception });
    continue;
  }
  const patch = backports[finding.module_name];
  const copies = finding.findings?.flatMap(row => row.version ? [row.version] : []) ?? [];
  if (patch && finding.severity === 'high' && patch.advisory === finding.github_advisory_id && copies.length > 0
      && copies.every(version => version === patch.version)
      && verified.some(copy => copy.package === finding.module_name)) {
    mitigated.push({ advisory: finding.github_advisory_id, package: finding.module_name,
      registrySeverity: finding.severity, version: patch.version, reason: 'Verified local backport; registry has no fixed release' });
  } else if (['high', 'critical'].includes(finding.severity)) {
    unresolved.push({ advisory: finding.github_advisory_id, package: finding.module_name, severity: finding.severity });
  }
}
const report = { checkedAt: new Date().toISOString(), success: unresolved.length === 0,
  registryVulnerabilities: audit.metadata.vulnerabilities, verified, verifiedUpgrades, mitigated, accepted, unresolved };
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const target = path.resolve(process.argv[outputIndex + 1]);
  assert.equal(path.basename(path.dirname(target)), 'artifacts');
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
assert.equal(unresolved.length, 0, 'Unresolved high or critical dependency advisory');
