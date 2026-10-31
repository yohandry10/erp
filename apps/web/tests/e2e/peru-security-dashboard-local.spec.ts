import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'
import { readLocalSql } from './helpers/peru-local-accounting'

const output = () => process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
const sql = (query: string) => readLocalSql(query)
const json = (query: string) => JSON.parse(sql(query))
const tableName = 'uat_security575_' + randomUUID().replaceAll('-', '')
const proof = { scope: 'CURRENT_REAL_GLOBAL_SECURITY_READS_SQL_RBAC_FAILURE_AND_LATE_REPLY', complete: false, remoteWrites: false, page_errors: [] as string[], steps: [] as any[] }

function snapshot() {
  const tables = json("SELECT jsonb_agg(table_name ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT IN('auth_login_attempts','user_sessions')") as string[]
  const terms = tables.map(name => {
    expect(name).toMatch(/^[a-z0-9_]+$/)
    const expression = ['usuarios','usuarios_sistema','usuarios_sistemas'].includes(name) ? "(to_jsonb(t)-'fecha_ultimo_acceso'-'updated_at'-'failed_login_attempts'-'locked_until')" : 'to_jsonb(t)'
    return `SELECT '${name}' AS name,jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg((${expression})::text,E'\\n' ORDER BY (${expression})::text),''),'UTF8')),'hex')) AS value FROM public.${name} t`
  })
  return json('SELECT jsonb_object_agg(name,value) FROM (' + terms.join(' UNION ALL ') + ') s')
}

async function start(page: Page, context: BrowserContext, email = 'peru-integrated-support-1@example.test') {
  expect(process.env.E2E_EPHEMERAL_LOCAL_DB).toBe('1')
  expect(process.env.PGPORT).toBe('55456')
  expect(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton")).toBe('erp_e2e|DEV|localerpephemeralqax')
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => proof.page_errors.push(error.message))
  await context.route('**/*', route => ['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  return loginPeruLocal(page, email, 'Local-Peru-2026-Only!')
}

test.afterAll(() => {
  proof.complete = proof.steps.length === 3 && !proof.page_errors.length
  fs.writeFileSync(path.join(output(), 'security-dashboard-functional-ui.json'), JSON.stringify(proof, null, 2))
})

test('Seguridad global: lecturas reales, estadísticas SQL exactas y tipos de violación visibles', async ({ page, context }) => {
  test.setTimeout(240000)
  const auth = await start(page, context)
  // Tres eventos sintéticos explícitos, sólo en esta nueva base propiedad del runner.
  const tenant = sql("SELECT tenant_id FROM usuarios_sistema WHERE email='peru-integrated-auditor-1@example.test'")
  expect(tenant).toMatch(/^[0-9a-f-]{36}$/)
  const seedIds = [randomUUID(), randomUUID(), randomUUID()]
  const seed = seedIds.map((id, index) => `('${id}','${tenant}',gen_random_uuid(),'${tableName}','SELECT','CRITICAL','${index < 2 ? 'cross_tenant' : 'missing_tenant'}',now())`).join(',')
  execFileSync(process.env.PSQL_BIN!, ['-XqAt','-h','127.0.0.1','-p','55456','-U','postgres','-d','erp_e2e','-v','ON_ERROR_STOP=1'], { input: `BEGIN; INSERT INTO public.rls_audit_log(id,tenant_id,user_id,table_name,operation,severity,violation_type,timestamp) VALUES ${seed}; COMMIT;`, encoding: 'utf8', windowsHide: true })
  const before = snapshot()
  const statuses: Array<{path:string;status:number}> = []
  page.on('response', response => { if (new URL(response.url()).pathname.includes('/security/dashboard/')) statuses.push({ path: new URL(response.url()).pathname, status: response.status() }) })
  await page.goto('/superadmin/dashboard/security/', { waitUntil: 'networkidle' })
  await expect(page.getByText('VIOLACIONES TOTALES', { exact: true })).toBeVisible()
  const row = page.getByRole('heading', { name: '📊 Violaciones por Tabla', exact: true }).locator('..').getByRole('row').filter({ hasText: tableName })
  await expect(row).toHaveCount(1)
  await expect(row.getByRole('cell').nth(1)).toHaveText('3')
  await expect(row.getByRole('cell').nth(3)).toHaveText('2')
  await expect(row.getByRole('cell').nth(4)).toHaveText('1')
  expect(statuses.length).toBeGreaterThanOrEqual(4)
  expect(statuses.every(response => response.status === 200)).toBe(true)
  const token = auth.access_token ?? auth.data?.access_token
  const api = process.env.LOCAL_API_URL!
  const response = await page.request.get(api + '/api/security/dashboard/stats?days=7', { headers: { authorization: 'Bearer ' + token } })
  expect(response.status()).toBe(200)
  const body = await response.json(), stats = body.data ?? body
  const expected = json("SELECT jsonb_build_object('total',(SELECT count(*) FROM rls_audit_log WHERE timestamp>now()-interval '7 days'),'users',(SELECT count(DISTINCT user_id) FROM rls_audit_log WHERE timestamp>now()-interval '7 days'),'tables',(SELECT count(DISTINCT table_name) FROM rls_audit_log WHERE timestamp>now()-interval '7 days'),'alerts',(SELECT count(*) FROM rls_alert_history WHERE triggered_at>=now()-interval '7 days'),'pending',(SELECT count(*) FROM rls_alert_history WHERE acknowledged=false))")
  expect(stats).toMatchObject({ totalViolations: expected.total, uniqueUsers: expected.users, tablesAffected: expected.tables, totalAlerts: expected.alerts, unacknowledgedAlerts: expected.pending })
  for (const endpoint of ['dashboard/stats?days=0','dashboard/stats?days=abc','dashboard/security-report?days=366','dashboard/violations-recent?limit=-1','rls/violations?limit=1001']) {
    const invalid = await page.request.get(api + '/api/security/' + endpoint, { headers: { authorization: 'Bearer ' + token } })
    expect(invalid.status(), endpoint).toBe(400)
  }
  expect(snapshot()).toEqual(before)
  await page.screenshot({ path: path.join(output(), 'security575-real-read.png'), fullPage: true })
  proof.steps.push({ name: 'global_security_actual_200_SQL_exact_type_counts_invalid_queries400_no_business_change', result: 'PASS', seedIds, seedTable: tableName, statuses, expected })
})

test('Seguridad global: fallos y respuestas parciales muestran reintento; un período anterior no reemplaza al actual', async ({ page, context }) => {
  test.setTimeout(300000)
  await start(page, context)
  const before = snapshot()
  for (const endpoint of ['stats','violations-by-table','violations-recent','alerts-unacknowledged']) {
    const pattern = '**/api/security/dashboard/' + endpoint + '**'
    await page.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Lectura temporalmente indisponible' }) }))
    await page.goto('/superadmin/dashboard/security/', { waitUntil: 'networkidle' })
    await expect(page.getByRole('alert').filter({ hasText: 'No se pudieron cargar los datos de seguridad.' })).toBeVisible()
    await expect(page.getByText('VIOLACIONES TOTALES', { exact: true })).toHaveCount(0)
    await page.unroute(pattern)
    await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click()
    await expect(page.getByText('VIOLACIONES TOTALES', { exact: true })).toBeVisible()
  }
  const statsPattern = '**/api/security/dashboard/stats**'
  await page.route(statsPattern, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ period: '7 días', totalViolations: 0 }) }))
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('button', { name: 'Reintentar consulta', exact: true })).toBeVisible()
  await expect(page.getByText('VIOLACIONES TOTALES', { exact: true })).toHaveCount(0)
  await page.unroute(statsPattern)
  await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click()
  await expect(page.getByText('VIOLACIONES TOTALES', { exact: true })).toBeVisible()
  let held = false, release: (() => void) | undefined, delivered = false
  await page.route(statsPattern, async route => {
    if (new URL(route.request().url()).searchParams.get('days') !== '30') return route.continue()
    const actual = await route.fetch()
    held = true
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ response: actual })
    delivered = true
  })
  await page.locator('#security-periodo').selectOption('30')
  await expect.poll(() => held).toBe(true)
  await page.locator('#security-periodo').selectOption('1')
  const currentPeriod = page.getByText('1 días', { exact: true })
  try {
    await expect(currentPeriod).toHaveCount(2)
    await expect(currentPeriod.nth(0)).toBeVisible()
    await expect(currentPeriod.nth(1)).toBeVisible()
  } finally { release!() }
  await expect.poll(() => delivered).toBe(true)
  await page.waitForLoadState('networkidle')
  await expect(currentPeriod).toHaveCount(2)
  await expect(currentPeriod.nth(0)).toBeVisible()
  await expect(currentPeriod.nth(1)).toBeVisible()
  await expect(page.getByText('30 días', { exact: true })).toHaveCount(0)
  await page.unroute(statsPattern)
  expect(snapshot()).toEqual(before)
  proof.steps.push({ name: 'all_four_security_sources503_and_partial200_visible_error_actual_retry_late_period_discarded', result: 'PASS', delayedResponseActuallyDelivered: delivered, businessWrites: 0 })
})

test('Seguridad global: permiso de auditoría tenant no concede privilegio global', async ({ page, context, request }) => {
  test.setTimeout(180000)
  const auth = await start(page, context, 'peru-integrated-auditor-1@example.test')
  const before = snapshot(), token = auth.access_token ?? auth.data?.access_token
  const endpoints = ['dashboard/stats','dashboard/violations-by-table','dashboard/violations-recent','dashboard/violations-by-user','dashboard/violations-hourly','dashboard/alerts-recent','dashboard/alerts-unacknowledged','dashboard/security-report','rls/violations']
  for (const endpoint of endpoints) {
    const response = await request.get(process.env.LOCAL_API_URL + '/api/security/' + endpoint, { headers: { authorization: 'Bearer ' + token } })
    expect(response.status(), endpoint).toBe(403)
  }
  const anonymous = await request.get(process.env.LOCAL_API_URL + '/api/security/dashboard/stats')
  expect(anonymous.status()).toBe(401)
  await page.goto('/superadmin/dashboard/security/')
  await expect(page).toHaveURL(/\/dashboard\/?$/)
  await expect(page.getByRole('heading', { name: '🔒 Dashboard de Seguridad RLS', exact: true })).toHaveCount(0)
  expect(snapshot()).toEqual(before)
  proof.steps.push({ name: 'tenant_security_auditor_all_nine_global_routes403_anonymous401_UI_denied', result: 'PASS', globalRoutes: endpoints, businessWrites: 0 })
})
