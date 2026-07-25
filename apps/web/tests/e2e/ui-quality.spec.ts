import { expect, test } from '@playwright/test';
import { gotoAuthenticated, login } from './helpers/auth';
import {
  expectHealthyUi,
  expectModalClosed,
  expectVisibleTexts,
  installUiQualityMonitor,
} from './helpers/ui-quality';
import { generateValidRucFromRunId } from './helpers/test-data';

test.describe('T18 calidad funcional UI', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('formularios críticos muestran validación visible y cancelan sin enviar', async ({ page }) => {
    const monitor = installUiQualityMonitor(page);

    await gotoAuthenticated(page, '/dashboard/compras/proveedores/nuevo/');
    await page.getByRole('button', { name: /Crear Proveedor/i }).click();
    await expectVisibleTexts(page, 'Compras proveedor', [
      /El RUC es requerido/i,
      /La razón social debe tener al menos 3 caracteres/i,
      /El email es requerido/i,
    ]);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /^Cancelar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/compras\/proveedores\/?$/, { timeout: 15000 });

    await gotoAuthenticated(page, '/dashboard/ventas/clientes/nuevo/');
    await page.getByRole('button', { name: /Crear Cliente/i }).click();
    await expectVisibleTexts(page, 'Ventas cliente', [
      /El documento debe tener al menos 8 caracteres/i,
      /La razón social debe tener al menos 3 caracteres/i,
    ]);
    await page.getByRole('button', { name: /^Cancelar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/ventas\/clientes\/?$/, { timeout: 15000 });

    await gotoAuthenticated(page, '/dashboard/inventario/productos/nuevo/');
    await page.getByRole('button', { name: /Crear Producto/i }).click();
    await expectVisibleTexts(page, 'Inventario producto', [
      /El código es requerido/i,
      /El nombre es requerido/i,
      /La categoría es requerida/i,
      /El precio de venta debe ser mayor a 0/i,
    ]);
    await page.getByRole('button', { name: /^Cancelar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/inventario\/productos\/?$/, { timeout: 15000 });

    await gotoAuthenticated(page, '/dashboard/finanzas/bancos/');
    await gotoAuthenticated(page, '/dashboard/finanzas/bancos/nueva/');
    await page.getByRole('button', { name: /Crear Cuenta/i }).click();
    await expectVisibleTexts(page, 'Finanzas cuenta bancaria', [
      /El nombre de la cuenta es requerido/i,
      /El nombre del banco es requerido/i,
      /El número de cuenta es requerido/i,
    ]);
    await page.getByRole('button', { name: /^Cancelar$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/finanzas\/bancos\/?$/, { timeout: 15000 });

    await expectHealthyUi(page, monitor, 'formularios críticos');
  });

  test('formulario de clientes registra documento real, crea cliente y persiste en listado', async ({ page }) => {
    const monitor = installUiQualityMonitor(page);
    const unique = Date.now().toString();
    const documento = generateValidRucFromRunId(`ui-cliente-${unique}`);
    const razonSocial = `QA-PROD-READY-${unique} Cliente UI`;

    await gotoAuthenticated(page, '/dashboard/ventas/clientes/nuevo/');
    await page.locator('#tipo').selectOption('EMPRESA');
    await page.locator('#documento_tipo').selectOption('RUC');
    await page.locator('#documento_numero').fill(documento);
    await page.locator('#razon_social').fill(razonSocial);
    await page.locator('#direccion').fill('Av. QA Produccion 123');
    await page.locator('#email').fill(`qa-prod-ready-${unique}@example.test`);
    await page.locator('#telefono').fill('999888777');

    await expect(page.locator('#documento_numero')).toHaveValue(documento);
    const validateRucButton = page.getByRole('button', { name: /^Validar RUC$/i });
    await expect(validateRucButton).toBeEnabled();
    await validateRucButton.click();
    await expect(page.getByText(/Formato y dígito verificador válidos/i).first()).toBeVisible();

    const createResponse = page.waitForResponse((response) =>
      response.url().includes('/api/ventas/clientes') &&
      response.request().method() === 'POST' &&
      response.status() < 400,
    );
    await page.getByRole('button', { name: /Crear Cliente/i }).click();
    const response = await createResponse;
    const created = await response.json();
    expect(created?.id, 'API debe devolver el cliente persistido').toBeTruthy();

    await expect(page).toHaveURL(/\/dashboard\/ventas\/clientes\/?$/, { timeout: 15000 });
    await page.getByPlaceholder(/Buscar por RUC, DNI, nombre o razón social/i).fill(documento);
    await expect(page.locator('body')).toContainText(razonSocial, { timeout: 15000 });
    await expect(page.locator('body')).toContainText(documento);
    await expectHealthyUi(page, monitor, 'cliente creado desde UI');
  });

  test('modal de usuarios es accesible, valida campos requeridos y se puede cerrar', async ({ page }) => {
    const monitor = installUiQualityMonitor(page);

    await gotoAuthenticated(page, '/dashboard/usuarios/');
    await page.getByRole('button', { name: /^Nuevo usuario$/i }).click();
    await expect(page.getByRole('heading', { name: /Nuevo Usuario/i })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /Crear Usuario/i }).click();
    await expectVisibleTexts(page, 'Usuarios modal', [
      /El nombre es requerido/i,
      /El email es requerido/i,
      /La contraseña es requerida/i,
      /El rol es requerido/i,
    ]);

    const closeButton = page.getByRole('button', { name: /^Cerrar$/i });
    await expect(closeButton).toBeVisible();
    await closeButton.click();
    await expectModalClosed(page, /Nuevo Usuario/i);
    await expectHealthyUi(page, monitor, 'modal usuarios');
  });

  test('GRE no expone acción PDF muerta cuando la representación no está implementada', async ({ page }) => {
    const monitor = installUiQualityMonitor(page);

    await gotoAuthenticated(page, '/dashboard/gre/');
    await expect(page.locator('body')).not.toContainText(/Cargando gu[ií]as de remisi[oó]n/i, { timeout: 15000 });
    await expectHealthyUi(page, monitor, 'GRE');

    const pdfButtons = page.getByRole('button', { name: /^PDF$/i });
    const count = await pdfButtons.count();
    for (let index = 0; index < count; index += 1) {
      const button = pdfButtons.nth(index);
      await expect(button, 'PDF GRE debe estar deshabilitado hasta existir endpoint real').toBeDisabled();
      await expect(button).toHaveAttribute('title', /PDF GRE no disponible/i);
    }
  });
});
