import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { backports, runPnpm, verifySecurityBackports } from './verify-security-backports.mjs';

// Registry advisories remain visible. A version-based finding is mitigated only
// after every installed copy matches the reviewed patch and passes regressions.
const verified = verifySecurityBackports();
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
for (const severity of ['high', 'critical']) {
  assert.equal(findings.filter(finding => finding.severity === severity).length,
    audit.metadata.vulnerabilities[severity], `Missing ${severity} registry findings`);
}
const mitigated = [];
const unresolved = [];
for (const finding of findings) {
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
  registryVulnerabilities: audit.metadata.vulnerabilities, verified, mitigated, unresolved };
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const target = path.resolve(process.argv[outputIndex + 1]);
  assert.equal(path.basename(path.dirname(target)), 'artifacts');
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
assert.equal(unresolved.length, 0, 'Unresolved high or critical dependency advisory');
