import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { loginPeruLocal } from './helpers/peru-login-local'

// Recuperación de contraseña desde la UI real: login → enlace → correo en el
// buzón SMTP local → contraseña nueva → login. Sólo hosts locales.
test('Recuperación de contraseña: desde el login hasta entrar con la contraseña nueva', async ({ page, context }) => {
  test.setTimeout(240000)
  page.setDefaultTimeout(25000)
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
  assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1')
  assert.equal(process.env.PGHOST, '127.0.0.1')
  assert.equal(process.env.PGDATABASE, 'erp_e2e')
  const fixture = JSON.parse(fs.readFileSync(path.join(output, 'auth-browser-fixture.json'), 'utf8'))
  const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, ['-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres', '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(sql("SELECT current_database()||'|'||environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;"), 'erp_e2e|DEV|localerpephemeralqax')
  const checks: Array<{ operation: string; passed: boolean }> = []
  const proof = { success: false, remoteWrites: false, complete_acceptance: false, scope: 'UI real de recuperación de contraseña con API/PostgreSQL/SMTP locales', checks }
  const save = () => fs.writeFileSync(path.join(output, 'auth-browser.json'), JSON.stringify(proof, null, 2))
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
  const smtp = path.join(output, 'smtp')
  const mails = () => fs.existsSync(smtp) ? fs.readdirSync(smtp).filter(name => name.endsWith('.json')).sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(smtp, name), 'utf8'))).filter(mail => mail.to.some((to: string) => to.includes(fixture.email))) : []
  const decode = (raw: string) => raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/&amp;/g, '&')
  const isRoute = (url: string, route: string) => new URL(url).pathname.replace(/\/$/, '').endsWith('/api/auth/' + route)
  // Next.js añade su propio role=alert (anunciador de rutas): el error se ubica por id.
  const NEW_PASSWORD = 'Navegador2026$'
  try {
    await page.context().clearCookies()
    await page.goto('/login/')
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
    await expect(page).toHaveURL(/\/reset-password\/$/)
    await expect(page.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeVisible()
    checks.push({ operation: 'El login ofrece la recuperación', passed: true })

    const seen = mails().length
    await page.getByLabel('Correo electrónico').fill(fixture.email)
    const [requested] = await Promise.all([
      page.waitForResponse(response => isRoute(response.url(), 'password-reset/request') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Enviar enlace', exact: true }).click(),
    ])
    expect(requested.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible()
    let link: URL | undefined
    await expect.poll(() => {
      const mail = mails().slice(seen).find(item => /reset-password/.test(decode(item.raw)))
      const href = mail && decode(mail.raw).match(/https?:\/\/[^\s"'<>]+reset-password[^\s"'<>]*/)?.[0]
      link = href ? new URL(href) : undefined
      return Boolean(link)
    }, { timeout: 20000 }).toBe(true)
    expect(link!.origin).toBe(new URL(process.env.BASE_URL!).origin)
    checks.push({ operation: 'La solicitud desde la web entrega un enlace a esta misma web', passed: true }); save()

    await page.goto(link!.pathname + link!.search)
    await expect(page.getByRole('heading', { name: 'Crea una contraseña nueva' })).toBeVisible()
    await expect(page.getByText(`Para la cuenta ${fixture.email}.`)).toBeVisible()
    let confirmCalls = 0
    page.on('request', request => { if (isRoute(request.url(), 'password-reset/confirm')) confirmCalls++ })
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('clave-debil')
    await page.getByLabel('Repite la contraseña', { exact: true }).fill('clave-debil')
    await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
    await expect(page.locator('#reset-confirm-error')).toContainText('Mínimo 8 caracteres')
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(NEW_PASSWORD)
    await page.getByLabel('Repite la contraseña', { exact: true }).fill(NEW_PASSWORD + 'x')
    await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click()
    await expect(page.locator('#reset-confirm-error')).toHaveText('Las dos contraseñas no coinciden.')
    expect(confirmCalls).toBe(0)
    const toggle = page.getByRole('button', { name: 'Mostrar contraseña nueva' })
    await toggle.click()
    await expect(page.getByLabel('Contraseña nueva', { exact: true })).toHaveAttribute('type', 'text')
    await expect(page.getByRole('button', { name: 'Ocultar contraseña nueva' })).toHaveAttribute('aria-pressed', 'true')
    checks.push({ operation: 'Validación local igual al API y mostrar/ocultar accesible', passed: true })

    await page.getByLabel('Repite la contraseña', { exact: true }).fill(NEW_PASSWORD)
    const [confirmed] = await Promise.all([
      page.waitForResponse(response => isRoute(response.url(), 'password-reset/confirm') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click(),
    ])
    expect(confirmed.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Contraseña actualizada' })).toBeVisible()
    expect(sql(`SELECT password_reset_token IS NULL FROM usuarios_sistema WHERE email='${fixture.email}';`)).toBe('t')
    await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click()
    await expect(page).toHaveURL(/\/login\/$/)
    await loginPeruLocal(page, fixture.email, NEW_PASSWORD)
    checks.push({ operation: 'Contraseña nueva guardada y usada para entrar', passed: true }); save()

    await page.context().clearCookies()
    await page.goto(link!.pathname + link!.search)
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('OtraClave2026$')
    await page.getByLabel('Repite la contraseña', { exact: true }).fill('OtraClave2026$')
    const [reused] = await Promise.all([
      page.waitForResponse(response => isRoute(response.url(), 'password-reset/confirm') && response.request().method() === 'POST'),
      page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click(),
    ])
    expect(reused.status()).toBe(401)
    await expect(page.locator('#reset-confirm-error')).toHaveText('El enlace no es válido o ya venció. Solicita uno nuevo para continuar.')
    await expect(page.getByRole('link', { name: 'Solicitar un enlace nuevo' })).toBeVisible()
    checks.push({ operation: 'Un enlace usado no vuelve a servir y ofrece pedir otro', passed: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/reset-password/')
    await expect(page.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    await page.screenshot({ path: path.join(output, 'auth-reset-mobile.png'), fullPage: true })
    checks.push({ operation: 'Sin desborde horizontal en móvil', passed: true })
    proof.success = true
  } finally {
    save()
  }
})
