import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs/promises'

export function readLocalSql(query: string): string {
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  const host = process.env.PGHOST ?? '127.0.0.1'
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(host))
  const port = process.env.PGPORT ?? '55456'
  assert.match(port, /^\d{4,5}$/)
  const environment: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: '' }
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete environment[key]
  return execFileSync(process.env.PSQL_BIN ?? 'psql', ['-XqAt', '-h', host, '-p', port,
    '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], {
    input: `BEGIN READ ONLY;\n${query}\nCOMMIT;`, encoding: 'utf8', env: environment,
  }).trim()
}

export async function consumeLocalAccounting(label: string) {
  assert.match(label, /^[a-z0-9-]+$/)
  assert.equal(readLocalSql('SELECT current_database() || \'|\' || environment || \'|\' || project_ref FROM app.deployment_environment WHERE singleton;'),
    'erp_e2e|DEV|localerpephemeralqax')
  const apiDirectory = path.resolve('../erp-api')
  const requireApi = createRequire(path.join(apiDirectory, 'package.json'))
  const log = execFileSync(process.execPath, [requireApi.resolve('ts-node/dist/bin.js'), '--transpile-only',
    'tests/e2e/helpers/local-api-harness.ts', '--accounting-once'], {
    cwd: apiDirectory, env: { ...process.env, E2E_EPHEMERAL_LOCAL_DB: '1' }, encoding: 'utf8',
    timeout: 60000, maxBuffer: 5 * 1024 * 1024,
  })
  await fs.writeFile(path.join(process.env.LOCAL_INTEGRATED_OUTPUT_DIR!, `${label}.log`), log)
}
