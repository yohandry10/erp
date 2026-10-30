import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
const equal=(a,b,message)=>assert.ok(isDeepStrictEqual(a,b),message);
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { buildPeru570Bundle } from './ci/peru-570-bundle.mjs';
import { peru570StateSql, assertPeru570Preserved, summarizePeru570State } from './ci/peru-570-state.mjs';

// Restaura el respaldo PROD únicamente en un contenedor propio sin red ni puertos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.argv.length, 3, 'Uso: node scripts/rehearse-peru-570-local.mjs artifacts/peru-prod-backup-<id>.json');
const manifestPath = path.resolve(process.argv[2]);
assert.equal(path.dirname(manifestPath), path.join(root, 'artifacts'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.project, 'wypnbcptofqdmoynlonq');
assert.equal(manifest.remoteWrites, false);
const archive = fs.realpathSync(manifest.archive);
assert.equal(path.dirname(archive), fs.realpathSync(path.join(root, 'artifacts/db-backups')));
const archiveBytes = fs.readFileSync(archive);
assert.equal(archiveBytes.length, manifest.bytes);
assert.equal(createHash('sha256').update(archiveBytes).digest('hex'), manifest.sha256);
const filename = '570__peru_establishment_structure_from_ui.sql';
const body = fs.readFileSync(path.join(root, 'supabase/migrations', filename), 'utf8');
const verifier = fs.readFileSync(path.join(root, 'supabase/verify', filename), 'utf8');
const bundle = buildPeru570Bundle(filename, body);
const runId = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + process.pid;
const containerName = `erp-peru-570-rehearsal-${runId}`;
const reportPath = path.join(root, 'artifacts', `${containerName}.json`);
const privateLog = path.join(root, 'artifacts/db-backups', `${containerName}.log`);
const report = { success: false, remoteWrites: false, network: 'none', project: manifest.project,
  archiveSha256: manifest.sha256, migrationSha256: createHash('sha256').update(body).digest('hex'),
  verifierSha256: createHash('sha256').update(verifier).digest('hex'),
  bundleSha256: createHash('sha256').update(bundle).digest('hex'),
  limits: ['Sin objetos externos de Storage ni roles globales; tiempo local no acredita RTO.'] };
let container;
let step = 'bootstrap';
function docker(args, input, expectedError) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true,
    timeout: 180000, maxBuffer: 30 * 1024 * 1024 });
  if (expectedError) {
    if (result.status === 0 || !result.stderr?.includes(expectedError)) {
      fs.appendFileSync(privateLog, `\n${step}\n${result.stderr || result.error?.message || 'Fallo sin stderr'}\n`);
    }
    assert.ok(result.status !== 0 && result.stderr?.includes(expectedError), `Control negativo: ${step}`);
    return '';
  }
  if (result.status !== 0) {
    fs.appendFileSync(privateLog, `\n${step}\n${result.stderr || result.error?.message || 'Fallo sin stderr'}\n`);
    throw new Error(`Falló ${step}; diagnóstico privado en artifacts/db-backups/*.log`);
  }
  return result.stdout.trim();
}
const sql = (statement, expectedError) => docker(
  ['exec', '-i', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'],
  statement, expectedError,
);
const snapshot = required => JSON.parse(sql(peru570StateSql(required)));
try {
  step = 'crear contenedor sin red';
  container = docker(['run', '--rm', '--detach', '--name', containerName,
    '--label', `erp.peru.570.rehearsal=${runId}`, '--network', 'none',
    '--env', 'POSTGRES_DB=erp_e2e', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']);
  const inspection = JSON.parse(docker(['inspect', container]))[0];
  assert.equal(inspection.Name, '/' + containerName);
  assert.equal(inspection.HostConfig.NetworkMode, 'none');
  equal(inspection.HostConfig.PortBindings, {});
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1',
      '-U', 'postgres', '-d', 'erp_e2e'], { windowsHide: true, stdio: 'ignore' });
    if (probe.status === 0) { ready = true; break; }
    await delay(500);
  }
  assert.ok(ready);
  step = 'restaurar respaldo privado';
  docker(['cp', archive, `${container}:/tmp/source.dump`]);
  const schema = docker(['exec', container, 'pg_restore', '--schema-only', '--no-owner', '--file=-', '/tmp/source.dump']);
  const roles = new Set(['anon', 'authenticated', 'service_role']);
  for (const line of schema.split('\n').filter(line => /^(GRANT |REVOKE |ALTER DEFAULT PRIVILEGES )/.test(line))) {
    for (const match of line.matchAll(/(?:TO|FROM|FOR ROLE) ([a-z_][a-z_0-9]*)/g)) roles.add(match[1]);
  }
  for (const role of roles) {
    if (role === 'postgres' || role === 'public') continue;
    assert.match(role, /^[a-z_][a-z_0-9]*$/);
    sql(`CREATE ROLE "${role}" NOLOGIN ${role === 'service_role' ? 'BYPASSRLS' : ''};`);
  }
  sql('CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION citext WITH SCHEMA public; CREATE EXTENSION pg_trgm WITH SCHEMA public;');
  const catalog = docker(['exec', container, 'pg_restore', '--list', '/tmp/source.dump']);
  const lines = catalog.split('\n');
  assert.equal(lines.filter(line => /^\d+; \d+ \d+ SCHEMA - public /.test(line)).length, 1);
  docker(['exec', '-i', container, 'sh', '-c', 'cat > /tmp/restore.list'],
    lines.filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n'));
  docker(['exec', container, 'pg_restore', '-U', 'postgres', '-d', 'erp_e2e', '--no-owner',
    '--exit-on-error', '--single-transaction', '--use-list=/tmp/restore.list', '/tmp/source.dump']);
  report.restoreVerified = true;
  // Diagnóstico histórico sin exponer tenant, payload, nombres ni mensajes libres.
  // La copia privada sigue sin red; esto no modifica ni reencola eventos PROD.
  step = 'diagnóstico readonly de DLQ en respaldo privado';
  const accountingTypes = [...fs.readFileSync(path.join(root,
    'apps/erp-api/src/shared/outbox/accounting-event-types.ts'), 'utf8')
    .matchAll(/'([A-Za-z][A-Za-z0-9_.]+)'/g)].map(match => match[1]);
  const accountingSql = accountingTypes.map(type => `'${type}'`).join(',');
  report.historicalOutboxDiagnosis = JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;
    SELECT jsonb_build_object('sourceSchema',569,'source','private-backup-local-copy',
      'deadLetterCount',(SELECT count(*) FROM outbox_events WHERE lower(status::text)='dead_letter'),
      'groups',coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM (
        SELECT CASE WHEN oe.event_type ~ '^[A-Za-z][A-Za-z0-9_.]{0,79}$' THEN oe.event_type ELSE 'OTHER' END AS event_type,
          oe.event_type IN (${accountingSql}) AS accounting_event,
          coalesce(substring(oe.error_message FROM 'MIGRATION_[A-Z0-9_]+|PGRST[0-9]{3}|OUTBOX_[A-Z0-9_]+'),'UNCLASSIFIED') AS contract_code,
          CASE WHEN oe.error_message ILIKE '%suscriptor%' OR oe.error_message ILIKE '%subscriber%' THEN 'NO_SUBSCRIBER'
            WHEN oe.error_message ILIKE '%permission%' OR oe.error_message ILIKE '%permiso%' THEN 'PERMISSION'
            WHEN oe.error_message ILIKE '%cuenta%' OR oe.error_message ILIKE '%account%' THEN 'ACCOUNTING_ACCOUNT'
            WHEN oe.error_message ILIKE '%foreign key%' THEN 'FOREIGN_KEY'
            WHEN oe.error_message ILIKE '%balance%' OR oe.error_message ILIKE '%cuadr%' THEN 'BALANCE'
            ELSE 'OTHER' END AS error_category,
          EXISTS(SELECT 1 FROM asientos_contables a WHERE a.tenant_id=oe.tenant_id AND a.source_event_id=oe.event_id AND a.estado='CONFIRMADO') AS has_confirmed_journal,
          count(*) AS events,min(oe.retry_count) AS min_retries,max(oe.retry_count) AS max_retries
        FROM outbox_events oe WHERE lower(oe.status::text)='dead_letter'
        GROUP BY 1,2,3,4,5 ORDER BY 1,3
      ) g),'[]'::jsonb));
    ROLLBACK;`));
  const before = snapshot(569);
  report.before = summarizePeru570State(before);
  report.historyBefore = before.schema;
  assert.equal(before.schema, 569, 'El respaldo debe estar exactamente en 569');
  step = 'rollback atómico 570';
  sql(bundle.replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;\n'), 'division by zero');
  equal(snapshot(569), before, 'La inyección de fallo debe revertir filas, ACL e historia');
  report.atomicRollbackPassed = true;
  step = 'aplicar 570 en copia aislada';
  sql(bundle);
  const after = snapshot(570);
  assert.equal(after.schema, 570);
  assertPeru570Preserved(before, after);
  for (const field of ['existingData','tableSecurity','policies','existingColumns','existingViews','existingFunctions','existingTriggers','historyHash']) {
    const corrupted=structuredClone(after);corrupted[field]='negative-control';
    assert.throws(()=>assertPeru570Preserved(before,corrupted));
  }
  const cost=structuredClone(after);const product=Object.keys(cost.costs)[0];
  if(product){cost.costs[product]=Number(cost.costs[product]||0)+1;assert.throws(()=>assertPeru570Preserved(before,cost));}
  const exposed=structuredClone(after);exposed.newFunctionSecurity['app.costo_inventario_base_570'].authenticated=true;
  assert.throws(()=>assertPeru570Preserved(before,exposed));
  report.preservationNegativeControlsPassed = true;
  report.existingDataPreserved = true;
  report.existingFunctionsPreserved = true;
  report.tableSecurityPreserved = true;
  report.onlyApprovedPeru570Changes = true;
  report.before = summarizePeru570State(before);
  report.after = summarizePeru570State(after);
  step = 'contratos SQL 570';
  sql(verifier);
  equal(snapshot(570), after, 'Los verificadores deben revertir todos sus cambios');
  report.sqlContractsPassed = true;
  report.historyAfter = after.schema;
  report.success = true;
} finally {
  report.completedAt = new Date().toISOString();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (container) {
    const check = spawnSync('docker', ['inspect', '--format', '{{.Name}}', container],
      { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (check.status === 0 && check.stdout.trim() === '/' + containerName) {
      spawnSync('docker', ['stop', container], { windowsHide: true, timeout: 30000 });
    }
  }
}
console.log(JSON.stringify({reportPath,success:report.success,remoteWrites:false,network:report.network,
 archiveSha256:report.archiveSha256,migrationSha256:report.migrationSha256,verifierSha256:report.verifierSha256,bundleSha256:report.bundleSha256,
 restoreVerified:report.restoreVerified,atomicRollbackPassed:report.atomicRollbackPassed,
 preservationNegativeControlsPassed:report.preservationNegativeControlsPassed,
 onlyApprovedPeru570Changes:report.onlyApprovedPeru570Changes,sqlContractsPassed:report.sqlContractsPassed,
 historyBefore:report.historyBefore,historyAfter:report.historyAfter,
 comparedProducts:report.after?.comparedProducts,comparedGrants:report.after?.comparedGrants,
 completedAt:report.completedAt},null,2));
