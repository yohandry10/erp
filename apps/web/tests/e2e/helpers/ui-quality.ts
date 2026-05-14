import { expect, Page } from '@playwright/test';

export type UiQualityMonitor = {
  consoleErrors: string[];
  serverErrors: string[];
  pageErrors: string[];
};

const fatalConsoleNoiseAllowlist = [
  /Download the React DevTools/i,
];

const fatalTextPatterns = [
  /Unhandled Runtime Error/i,
  /Application error/i,
  /Internal Server Error/i,
  /Cannot find module/i,
  /ChunkLoadError/i,
  /Hydration failed/i,
  /This page could not be found/i,
  /Página no encontrada/i,
] as const;

const permanentLoaderPattern =
  /Verificando autenticaci[oó]n|Redirigiendo|Cargando pa[ií]s configurado|Cargando datos del dashboard|Cargando\.\.\.|Loading\.\.\./i;

export function installUiQualityMonitor(page: Page): UiQualityMonitor {
  const monitor: UiQualityMonitor = {
    consoleErrors: [],
    serverErrors: [],
    pageErrors: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      monitor.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    monitor.pageErrors.push(error.message);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      monitor.serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  return monitor;
}

export async function expectHealthyUi(page: Page, monitor: UiQualityMonitor, label: string) {
  await expect(page.locator('body'), `${label}: body visible`).toBeVisible();
  await expect(page.locator('main'), `${label}: main visible`).toBeVisible({ timeout: 15000 });
  const bodyText = await page.locator('body').innerText({ timeout: 15000 });
  const mainText = await page.locator('main').innerText({ timeout: 15000 });

  expect(mainText.trim().length, `${label}: main debe tener contenido útil`).toBeGreaterThan(40);
  expect(bodyText, `${label}: no debe quedar en loader permanente`).not.toMatch(permanentLoaderPattern);
  for (const pattern of fatalTextPatterns) {
    expect(bodyText, `${label}: no debe renderizar error fatal ${pattern}`).not.toMatch(pattern);
  }

  expect(monitor.serverErrors, `${label}: no debe tener respuestas 500`).toEqual([]);
  expect(
    monitor.pageErrors,
    `${label}: no debe tener pageerror fatal`,
  ).toEqual([]);
  expect(
    monitor.consoleErrors.filter((message) =>
      fatalConsoleNoiseAllowlist.every((allowed) => !allowed.test(message)),
    ),
    `${label}: no debe emitir console.error fatal`,
  ).toEqual([]);
}

export async function expectVisibleTexts(page: Page, label: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    await expect(
      page.locator('body'),
      `${label}: debe mostrar ${pattern}`,
    ).toContainText(pattern, { timeout: 10000 });
  }
}

export async function expectModalClosed(page: Page, modalHeading: RegExp) {
  await expect(page.getByRole('heading', { name: modalHeading })).toBeHidden({ timeout: 10000 });
}
