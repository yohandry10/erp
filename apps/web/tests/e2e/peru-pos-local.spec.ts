import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test, expect, type Page, type BrowserContext, type Response } from '@playwright/test';

interface Proof {
  success: boolean; remoteWrites: false; scope: string;
  checks: { check: string; passed: boolean; [key: string]: unknown }[];
  unexpected_errors: string[];
}
const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!;
const fixture: { email: string; tenant: string; client_id: string } = JSON.parse(
  fs.readFileSync(path.join(output, 'pos-browser-fixture.json'), 'utf8'),
);
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, '1');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'erp_e2e');
assert.equal(new URL(process.env.LOCAL_API_URL!).hostname, '127.0.0.1');
assert.match(fixture.tenant, /^[0-9a-f-]{36}$/i);
const sql = (query: string) => execFileSync(process.env.PSQL_BIN!, [
  '-XqAt', '-h', '127.0.0.1', '-p', process.env.PGPORT!, '-U', 'postgres',
  '-d', 'erp_e2e', '-v', 'ON_ERROR_STOP=1',
], { input: query, encoding: 'utf8', windowsHide: true }).trim();
const count = () => Number(sql(`SELECT count(*) FROM ventas_pos WHERE tenant_id='${fixture.tenant}'::uuid;`));
const saleResponse = (r: Response) => new URL(r.url()).pathname.replace(/\/$/, '')
  .endsWith('/pos/venta') && r.request().method() === 'POST';

async function setup(page: Page, context: BrowserContext) {
  // El iframe se retira en afterprint. Observar beforeprint conserva lo que
  // recibió el motor de impresión sin sustituir window.print ni congelar UI.
  await context.addInitScript(() => {
    new MutationObserver(records => {
      for (const record of records) for (const node of Array.from(record.addedNodes)) {
        if (node instanceof HTMLIFrameElement && node.title === 'Documento listo para imprimir') {
          // document.open elimina listeners previos del iframe. El observador
          // se ejecuta después de escribir el documento y antes de su load.
          node.contentWindow?.addEventListener('beforeprint', () => {
            (window as Window & { posPrintedText?: string }).posPrintedText = node.contentDocument?.body.innerText;
          });
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]']
    .includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort('blockedbyclient'));
  await page.goto('/login/');
  await page.locator('#email').fill(fixture.email);
  await page.locator('#password').fill('Cliente-Local-2026-Only!');
  const [login] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname.replace(/\/$/, '')
      .endsWith('/auth/login') && r.request().method() === 'POST'),
    page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click(),
  ]);
  expect(login.status()).toBe(201);
  await expect(page).toHaveURL(/\/dashboard\//, { timeout: 25000 });
  await page.goto('/dashboard/pos/');
}
async function cart(page: Page) {
  await page.getByRole('combobox', { name: 'Cliente de la venta' }).selectOption(fixture.client_id);
  await page.getByLabel('Buscar productos').fill('Servicio POS local');
  await page.getByRole('button', { name: 'Agregar Servicio POS local', exact: true }).click();
  await page.getByRole('button', { name: /^Cobrar/ }).click();
  await page.getByRole('button', { name: 'Efectivo', exact: true }).click();
  await page.getByLabel('Efectivo recibido', { exact: true }).fill('100');
}

test('POS: primer ADMIN abre, vende y recupera respuesta perdida sin duplicar', async ({ page, context }) => {
  test.setTimeout(180000); page.setDefaultTimeout(25000);
  const proof: Proof = { success: false, remoteWrites: false,
    scope: 'POS API/UI/DB locales; ticket térmico representado, sin impresora física ni aceptación SUNAT',
    checks: [], unexpected_errors: [] };
  page.on('pageerror', e => proof.unexpected_errors.push(e.message));
  try {
    await setup(page, context);
    await page.getByRole('button', { name: 'Abrir Caja Registradora', exact: true }).click();
    await page.locator('#monto-inicial-caja').fill('100');
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await cart(page);
    const before = count(); let committed: { venta_id: string } | undefined;
    await page.route(/\/api\/pos\/venta\/?$/, async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch(); expect(response.status()).toBe(201);
      committed = await response.json();
      await route.fulfill({ status: 503, contentType: 'application/json',
        body: JSON.stringify({ message: 'Respuesta perdida local tras commit real' }) });
    }, { times: 1 });
    const [lost] = await Promise.all([page.waitForResponse(saleResponse),
      page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click()]);
    expect(lost.status()).toBe(503); await expect.poll(count).toBe(before + 1);
    await expect(page.getByRole('button', { name: 'Confirmar cobro', exact: true })).toBeEnabled();
    const [retry] = await Promise.all([page.waitForResponse(saleResponse),
      page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click()]);
    expect(retry.status()).toBe(201); const recovered = await retry.json();
    expect(recovered.venta_id).toBe(committed!.venta_id); expect(count()).toBe(before + 1);
    expect(recovered.total).toBe(23.6);
    await expect(page.getByText('Ticket interno listo para canje', { exact: true })).toBeVisible();
    proof.checks.push({ check: 'Respuesta perdida recupera una venta y mantiene el total persistido',
      passed: true, venta_id: recovered.venta_id, total: recovered.total });
    await page.getByRole('button', { name: 'Imprimir ticket', exact: true }).click();
    const preview = page.locator('[data-pos-print-document]');
    await expect(preview).toContainText('Servicio POS local'); await expect(preview).toContainText('23.60');
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
    const printedText = () => page.evaluate(() => (window as Window & { posPrintedText?: string }).posPrintedText || '');
    await expect.poll(printedText).toContain('Servicio POS local');
    await expect.poll(printedText).toContain('23.60');
    proof.checks.push({ check: 'Vista térmica e iframe de impresión contienen líneas y total reales',
      passed: true, physical_printer_verified: false });
    await page.getByRole('button', { name: 'Cerrar vista previa', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar vendiendo', exact: true }).click();
    await cart(page);
    const [secondResponse] = await Promise.all([page.waitForResponse(saleResponse),
      page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click()]);
    expect(secondResponse.status()).toBe(201); const second = await secondResponse.json();
    expect(second.venta_id).not.toBe(recovered.venta_id); expect(count()).toBe(before + 2);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Agregar Servicio POS local', exact: true })).toBeVisible();
    proof.checks.push({ check: 'Nueva intención idéntica persiste otra venta; recarga conserva catálogo', passed: true });
    expect(proof.unexpected_errors).toEqual([]); proof.success = true;
  } finally {
    fs.writeFileSync(path.join(output, 'browser-pos-recovery.json'), JSON.stringify(proof, null, 2));
  }
});
