import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { readLocalSql as sql } from './helpers/peru-local-accounting'

const endpoint = (request: { url(): string }) => new URL(request.url()).pathname.replace(/^\/backend/, '').replace(/\/$/, '')
for (const annual of [false, true]) {
  test(`Perú: ${annual ? 'anual' : 'mensual'} recupera versión y constancia tras respuestas perdidas`, async ({ page, context }) => {
    test.setTimeout(240000)
    page.setDefaultTimeout(25000)
    const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!
    const fixture = JSON.parse(fs.readFileSync(path.join(output, 'tax-intents-fixture.json'), 'utf8'))
    expect(fixture.tenant).toMatch(/^[0-9a-f-]{36}$/i)
    const table = annual ? 'tributos_declaraciones_anuales' : 'tributos_declaraciones_mensuales'
    const condition = `tenant_id='${fixture.tenant}'::uuid AND ${annual ? 'ejercicio=2025' : "periodo='2026-10'"}`
    const count = () => Number(sql(`SELECT count(*) FROM ${table} WHERE ${condition};`))
    const proof: { success: boolean; remoteWrites: boolean; scope: string; checks: Array<{ check: string; passed: boolean }>; unexpected_errors: string[] } = {
      success: false, remoteWrites: false, scope: 'Navegador/API/DB reales locales; constancia simulada sin envío SUNAT', checks: [], unexpected_errors: [],
    }
    page.on('pageerror', error => proof.unexpected_errors.push(error.message))
    const pass = (check: string) => proof.checks.push({ check, passed: true })
    await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'))
    try {
      await page.goto('/login/')
      await page.locator('#email').fill(fixture.email)
      await page.locator('#password').fill('Cliente-Local-2026-Only!')
      for (let attempt = 0; attempt < 2; attempt++) {
        const [login] = await Promise.all([page.waitForResponse(r => endpoint(r) === '/api/auth/login' && r.request().method() === 'POST'), page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click()])
        if (login.status() === 429 && attempt === 0) {
          const seconds = Number(await login.headerValue('retry-after'))
          expect(seconds).toBeGreaterThan(0); expect(seconds).toBeLessThanOrEqual(60)
          await new Promise(resolve => setTimeout(resolve, seconds * 1000)); continue
        }
        expect(login.status()).toBe(201)
        await page.waitForURL('**/dashboard/**', { timeout: 25000 }); break
      }
      const pagePath = annual ? '/dashboard/contabilidad/impuestos/anual/' : '/dashboard/contabilidad/impuestos/'
      await page.goto(pagePath)
      await expect(page.getByRole('heading', { name: annual ? 'Renta Anual e ITAN — Perú' : 'IGV y Renta mensual — Perú', exact: true })).toBeVisible()
      if (!annual) await page.locator('#impuestos-periodo').fill('2026-10')
      const saveButton = page.getByRole('button', { name: annual ? 'Guardar versión' : 'Guardar nueva versión', exact: true })
      await expect(saveButton).toBeVisible()
      const notes = page.getByRole('textbox', { name: annual ? 'Notas y sustento' : 'Notas de revisión', exact: true })
      await notes.fill('UI-TRIBUTO-LOCAL')
      async function loseResponse(pathname: string, click: () => Promise<unknown>) {
        const keys: string[] = []
        let committed: any
        const matcher = new RegExp(pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?$')
        await context.route(matcher, async route => {
          if (route.request().method() !== 'POST') return route.continue()
          keys.push(route.request().headers()['idempotency-key'])
          expect(keys[keys.length - 1]).toMatch(/^[0-9a-f-]{36}$/i)
          if (keys.length === 1) {
            const actual = await route.fetch()
            expect(actual.status(), await actual.text()).toBe(201)
            committed = (await actual.json()).data
            await route.fulfill({ status: 503, json: { message: 'Respuesta perdida local tributaria' } })
          } else await route.continue()
        })
        const [failed] = await Promise.all([page.waitForResponse(r => endpoint(r) === pathname && r.request().method() === 'POST' && r.status() === 503), click()])
        expect(failed.status()).toBe(503)
        await expect(page.getByText(annual ? 'No se pudo procesar el borrador anual' : 'No se pudo guardar', { exact: false }).first()).toBeVisible()
        return { keys, matcher, get committed() { return committed } }
      }
      const before = count(), savePath = '/api/contabilidad/impuestos/' + (annual ? 'anual' : 'mensual')
      const saved = await loseResponse(savePath, () => saveButton.click())
      await expect(notes).toHaveValue('UI-TRIBUTO-LOCAL')
      expect(count()).toBe(before + 1)
      const [replay] = await Promise.all([page.waitForResponse(r => endpoint(r) === savePath && r.request().method() === 'POST' && r.status() === 201), saveButton.click()])
      expect((await replay.json()).data.id).toBe(saved.committed.id)
      expect(new Set(saved.keys).size).toBe(1); expect(saved.keys.length).toBe(2); expect(count()).toBe(before + 1)
      await expect(page.getByText(`BORRADOR · v${saved.committed.version}`, { exact: true })).toBeVisible()
      await context.unroute(saved.matcher)
      pass('Guardado: API confirmó una versión; 503 conserva notas y replay de la misma clave recupera el mismo ID/corte')
      await page.reload()
      if (!annual) await page.locator('#impuestos-periodo').fill('2026-10')
      await expect(page.getByText(`BORRADOR · v${saved.committed.version}`, { exact: true })).toBeVisible()
      expect(count()).toBe(before + 1)
      pass('Recarga: versión guardada persiste en el estado e historial')
      const reference = page.getByRole('textbox', { name: 'Número de constancia', exact: true })
      await reference.fill('LOCAL-UI-SIMULADA-NO-ENVIADA')
      const register = page.getByRole('button', { name: 'Registrar constancia', exact: true })
      await expect(register).toBeEnabled()
      const receiptPath = `/api/contabilidad/impuestos/${annual ? 'anuales' : 'declaraciones'}/${saved.committed.id}/constancia`
      // El mensaje de fallo es distinto para la constancia; la respuesta original
      // sigue llegando al endpoint y confirma su transacción antes del 503 local.
      const keys: string[] = []; let receipt: any
      const matcher = new RegExp(receiptPath + '/?$')
      await context.route(matcher, async route => {
        keys.push(route.request().headers()['idempotency-key'])
        if (keys.length === 1) {
          const actual = await route.fetch(); expect(actual.status(), await actual.text()).toBe(201)
          receipt = (await actual.json()).data
          await route.fulfill({ status: 503, json: { message: 'Respuesta perdida local tributaria' } })
        } else await route.continue()
      })
      await Promise.all([page.waitForResponse(r => endpoint(r) === receiptPath && r.status() === 503), register.click()])
      await expect(page.getByText('No se pudo registrar la constancia', { exact: false }).first()).toBeVisible()
      await expect(reference).toHaveValue('LOCAL-UI-SIMULADA-NO-ENVIADA'); await expect(register).toBeEnabled()
      expect(sql(`SELECT estado FROM ${table} WHERE id='${saved.committed.id}'::uuid;`)).toBe('PRESENTADA')
      const [retriedReceipt] = await Promise.all([page.waitForResponse(r => endpoint(r) === receiptPath && r.status() === 201), register.click()])
      expect((await retriedReceipt.json()).data.id).toBe(receipt.id)
      expect(new Set(keys).size).toBe(1); expect(keys.length).toBe(2); expect(keys[0]).not.toBe(saved.keys[0])
      await expect(register).toBeDisabled(); expect(count()).toBe(before + 1)
      await context.unroute(matcher)
      await page.reload(); if (!annual) await page.locator('#impuestos-periodo').fill('2026-10')
      await expect(reference).toHaveValue('LOCAL-UI-SIMULADA-NO-ENVIADA'); await expect(register).toBeDisabled()
      pass('Constancia simulada: pérdida de respuesta conserva campos y misma clave; replay/recarga mantienen una sola presentación')
      expect(proof.unexpected_errors).toEqual([]); proof.success = true
    } finally {
      fs.writeFileSync(path.join(output, `browser-tax-${annual ? 'annual' : 'monthly'}-intents.json`), JSON.stringify(proof, null, 2))
    }
  })
}
