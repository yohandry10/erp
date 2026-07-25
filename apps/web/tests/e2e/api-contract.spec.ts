import { expect, test } from '@playwright/test';
import { apiSucceeded, parseApiBoolean, parseApiDateOnly, unwrapApiArray, unwrapApiData } from '@/lib/api-contract';
import { gotoAuthenticated } from './helpers/auth';

test.describe('API/UI contracts', () => {
  test('normalizadores frontend aceptan envelope y respuestas crudas sin tratar "false" como true', async () => {
    expect(apiSucceeded({ success: true, data: [{ id: 1 }] })).toBe(true);
    expect(apiSucceeded({ success: 'true', data: [{ id: 1 }] })).toBe(true);
    expect(apiSucceeded({ success: 'false', error: 'rechazado' })).toBe(false);
    expect(unwrapApiArray({ success: true, data: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(unwrapApiArray({ success: true, data: { data: [{ id: 'nested' }], pagination: { total: 1 } } })).toEqual([{ id: 'nested' }]);
    expect(unwrapApiArray([{ id: 'raw' }])).toEqual([{ id: 'raw' }]);
    expect(unwrapApiData({ success: true, data: { id: 'obj' } })).toEqual({ id: 'obj' });
    expect(parseApiBoolean('false')).toBe(false);
    expect(parseApiBoolean('true')).toBe(true);
    expect(parseApiDateOnly('2026-05-13T12:34:56.000Z')).toBe('2026-05-13');
    expect(parseApiDateOnly('13/05/2026')).toBeNull();
  });

  test('rutas criticas no descartan arrays validos ni envelopes validos', async ({ page }) => {
    const consoleErrors: string[] = [];
    const badResponses: Array<{ status: number; url: string }> = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      const status = response.status();
      const url = response.url();
      if (status >= 500 || (status === 404 && /(_next|chunk|dashboard|backend\/api)/.test(url))) {
        badResponses.push({ status, url });
      }
    });

    for (const route of [
      '/dashboard/compras/',
      '/dashboard/documentos/',
      '/dashboard/cpe/',
      '/dashboard/gre/',
      '/dashboard/sire/',
      '/dashboard/rrhh/planillas/',
      '/dashboard/audit-logs/',
    ]) {
      await gotoAuthenticated(page, route);
      const main = page.locator('main').first();
      await expect(main).toBeVisible({ timeout: 30000 });
      await expect(page.locator('body')).not.toContainText(/Application error|Internal Server Error|404: This page could not be found/i);
      await expect(main).not.toContainText(/Cargando|Validando acceso/i, { timeout: 30000 });
      const text = await main.innerText({ timeout: 15000 });
      expect(text.trim().length, `${route} debe mostrar contenido util`).toBeGreaterThan(40);
    }

    expect(badResponses).toEqual([]);
    expect(consoleErrors.filter((error) => /TypeError|Unhandled|Cannot read|Cannot convert|Application error/i.test(error))).toEqual([]);
  });
});
