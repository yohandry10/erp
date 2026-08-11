import { APIRequestContext, APIResponse, Page, request as playwrightRequest, test, expect } from '@playwright/test';
import { gotoAuthenticated, login } from './helpers/auth';
import { apiContextAsAprobador } from './helpers/test-data';

/**
 * E2E Tests for Compras Module
 *
 * This test suite covers the critical user flows in the purchasing module,
 * focusing on the supplier (proveedor) creation process.
 */

// Test data
const testRunId = Date.now().toString().slice(-9);
const testProveedor = {
  ruc: `20${testRunId}`,
  razonSocial: `DISTRIBUIDORA TEST E2E ${testRunId} S.A.C.`,
  nombreComercial: 'Test E2E Distribuidora',
  email: `test-e2e-${testRunId}@distribuidora.com`,
  telefono: '+51 999 888 777',
  direccion: 'Av. Test E2E 123, Lima',
  contacto: 'Juan Pérez Test',
  condicionesPago: 'CREDITO_30',
  limiteCredito: '50000'
};

const apiBaseURL = process.env.E2E_API_ORIGIN || 'http://localhost:3002';
const api = (path: string) => `/api${path}`;

type ApiEnvelope<T> = { success?: boolean; data?: T; message?: string; error?: string };

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

async function parseOk<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.ok(), `${label} debe responder 2xx, status=${response.status()}`).toBeTruthy();
  const body = (await response.json()) as ApiEnvelope<T> | T;
  if (body && typeof body === 'object' && 'success' in body) {
    expect((body as ApiEnvelope<T>).success, `${label} debe devolver success=true`).not.toBe(false);
  }
  return unwrap<T>(body);
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const accessToken = (await page.context().cookies()).find((cookie) => cookie.name === 'access_token')?.value;
  expect(accessToken, 'la sesión E2E debe tener access_token').toBeTruthy();
  return { Authorization: `Bearer ${accessToken}` };
}

async function crearRecepcionCerradaParaDevolucion(page: Page): Promise<{ numero: string }> {
  const headers = await authHeaders(page);
  const apiContext: APIRequestContext = await playwrightRequest.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: headers,
    storageState: { cookies: [], origins: [] },
  });

  const run = `DEV-${Date.now().toString().slice(-9)}`;
  const almacenes = await parseOk<any[]>(await apiContext.get(api('/inventario/almacenes')), 'listar almacenes para devolución');
  expect(almacenes.length, 'debe existir almacén operativo para preparar devolución').toBeGreaterThan(0);
  const almacenId = almacenes[0].id;

  const proveedor = await parseOk<any>(
    await apiContext.post(api('/compras/proveedores'), {
      data: {
        ruc: `20${run.replace(/\D/g, '').slice(-9)}`,
        razon_social: `Proveedor Devolucion UI ${run} S.A.C.`,
        nombre_comercial: `Proveedor DEV ${run}`,
        email: `proveedor-dev-${run.toLowerCase()}@example.com`,
        telefono: '999888777',
        direccion: 'Av. Test Devolucion 123',
        contacto: 'QA Devolucion',
        condiciones_pago: 'CREDITO_30',
        dias_credito: 30,
        limite_credito: 50000,
      },
    }),
    'crear proveedor para devolución',
  );

  const producto = await parseOk<any>(
    await apiContext.post(api('/inventario/productos'), {
      data: {
        codigo: `P-${run}`,
        nombre: `Producto Devolucion UI ${run}`,
        categoria: 'AUDITORIA',
        precio_compra: 33,
        precio_venta: 60,
        stock: 0,
        stock_minimo: 0,
        controla_stock: true,
        almacen_id: almacenId,
      },
    }),
    'crear producto para devolución',
  );

  const orden = await parseOk<any>(
    await apiContext.post(api('/compras/ordenes'), {
      data: {
        numero: `OC-${run}`,
        proveedor_id: proveedor.id,
        fecha_orden: new Date().toISOString(),
        fecha_entrega_esperada: new Date(Date.now() + 86400000).toISOString(),
        condiciones_pago: 'CREDITO_30',
        dias_credito: 30,
        almacen_destino_id: almacenId,
        estado: 'BORRADOR',
        observaciones: 'Setup UI devolución',
        detalles: [
          {
            producto_id: producto.id,
            descripcion: producto.nombre,
            cantidad: 5,
            precio_unitario: 33,
          },
        ],
      },
    }),
    'crear orden para devolución',
  );
  const detalleId = orden.detalles?.[0]?.id ?? orden.detalle?.[0]?.id;
  expect(detalleId, 'la orden debe devolver detalle para recepción').toBeTruthy();

  // SEC-001 fix: el creador no puede aprobar; aprobador autentica con su JWT.
  const aprobadorCtx = await apiContextAsAprobador();
  try {
    await parseOk<any>(
      await aprobadorCtx.post(api(`/compras/ordenes/${orden.id}/aprobar`), {
        data: {
          aprobador_nombre: 'Admin QA',
          comentarios: 'Setup UI devolución',
        },
      }),
      'aprobar orden para devolución',
    );
  } finally {
    await aprobadorCtx.dispose();
  }

  const recepcionBorrador = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/ordenes/${orden.id}`), {
      data: {
        orden_id: orden.id,
        idempotency_key: `recepcion:${run}:devolucion`,
        almacen_id: almacenId,
        observaciones: 'Recepción setup UI devolución',
        items: [
          {
            detalle_id: detalleId,
            cantidad_recibida: 5,
            calidad: 'OK',
            almacen_id: almacenId,
            lote: `LT-${run}`,
          },
        ],
      },
    }),
    'crear recepción para devolución',
  );

  const recepcionCerrada = await parseOk<any>(
    await apiContext.post(api(`/compras/recepciones/${recepcionBorrador.id}/cerrar`), {
      data: { observaciones: 'Cierre setup UI devolución' },
    }),
    'cerrar recepción para devolución',
  );

  return { numero: recepcionCerrada.numero };
}

test.describe('Compras - Proveedores', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  test('Crear proveedor desde UI', async ({ page }) => {
    // Navigate to proveedores page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Proveedores');

    // Click "Nuevo Proveedor" button
    await page.click('button:has-text("Nuevo Proveedor")');

    // Wait for navigation to nuevo proveedor page
    await page.waitForURL('**/proveedores/nuevo**');
    await expect(page.locator('h1')).toContainText('Nuevo Proveedor');

    // Fill in the form - Información Básica
    await page.fill('input[name="ruc"]', testProveedor.ruc);
    await page.fill('input[name="razon_social"]', testProveedor.razonSocial);
    await page.fill('input[name="nombre_comercial"]', testProveedor.nombreComercial);
    await page.fill('input[name="email"]', testProveedor.email);

    // Fill in Información de Contacto
    await page.fill('input[name="contacto"]', testProveedor.contacto);
    await page.fill('input[name="telefono"]', testProveedor.telefono);
    await page.fill('textarea[name="direccion"]', testProveedor.direccion);

    // Fill in Condiciones Comerciales
    await page.selectOption('select[name="condiciones_pago"]', testProveedor.condicionesPago);
    await page.fill('input[name="limite_credito"]', testProveedor.limiteCredito);

    // Take a screenshot before submitting
    await page.screenshot({ path: 'tests/screenshots/proveedor-form-filled.png', fullPage: true });

    // Wait for success alert or navigation
    // Note: Adjust this based on your actual success handling
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });

    // Submit the form
    await page.click('button[type="submit"]:has-text("Crear Proveedor")');

    // Wait for navigation back to proveedores list
    await page.waitForURL(/\/dashboard\/compras\/proveedores\/?$/, { timeout: 30000 });

    // Verify the proveedor appears in the list
    // Search for the newly created proveedor
    const searchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/compras/proveedores') &&
        response.url().includes(`search=${testProveedor.ruc}`) &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 30000 },
    );
    await page.fill('input[placeholder*="Buscar"]', testProveedor.ruc);
    await searchResponsePromise;

    // Verify the proveedor is in the table
    const proveedorRow = page.locator('table tbody tr').filter({
      hasText: testProveedor.ruc,
    }).filter({
      hasText: testProveedor.razonSocial,
    }).first();
    await expect(proveedorRow).toBeVisible({ timeout: 30000 });
    await expect(proveedorRow).toContainText(testProveedor.ruc);
    await expect(proveedorRow).toContainText(testProveedor.razonSocial);

    // Take a screenshot of the result
    await page.screenshot({ path: 'tests/screenshots/proveedor-created.png', fullPage: true });
  });

  test('Validar campos requeridos en formulario de proveedor', async ({ page }) => {
    // Navigate to nuevo proveedor page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores/nuevo');

    // Try to submit empty form
    await page.click('button[type="submit"]:has-text("Crear Proveedor")');

    // Verify validation errors appear
    await expect(page.locator('text=El RUC es requerido')).toBeVisible();
    await expect(page.locator('text=La razón social debe tener al menos 3 caracteres')).toBeVisible();
    await expect(page.locator('text=El email es requerido')).toBeVisible();
  });

  test('Validar formato de RUC', async ({ page }) => {
    // Navigate to nuevo proveedor page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores/nuevo');

    // Fill with invalid RUC (too short)
    await page.fill('input[name="ruc"]', '12345');
    await page.fill('input[name="razon_social"]', 'Test Company');
    await page.fill('input[name="email"]', 'test@test.com');

    // Try to submit
    await page.click('button[type="submit"]');

    // Verify RUC validation error
    await expect(page.locator('text=/El RUC debe tener 11 dígitos.*o 9 dígitos/')).toBeVisible();
  });

  test('Validar formato de email', async ({ page }) => {
    // Navigate to nuevo proveedor page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores/nuevo');

    // Fill with invalid email
    await page.fill('input[name="ruc"]', '20123456789');
    await page.fill('input[name="razon_social"]', 'Test Company');
    await page.fill('input[name="email"]', 'invalid-email');

    // Try to submit
    await page.click('button[type="submit"]');

    // Verify email validation error
    await expect(page.locator('text=Debe proporcionar un email válido')).toBeVisible();
  });

  test('Cancelar creación de proveedor', async ({ page }) => {
    // Navigate to nuevo proveedor page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores/nuevo');

    // Fill some data
    await page.fill('input[name="ruc"]', testProveedor.ruc);
    await page.fill('input[name="razon_social"]', testProveedor.razonSocial);

    // Handle confirmation dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('cancelar');
      await dialog.accept();
    });

    // Click cancel button
    await page.click('button:has-text("Cancelar")');

    // Verify navigation back to proveedores list
    await page.waitForURL(/\/dashboard\/compras\/proveedores\/?$/);
    await expect(page.locator('h1')).toContainText('Proveedores');
  });

  test('Buscar proveedor por término existente', async ({ page }) => {
    // Navigate to proveedores page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Proveedores');

    // Use a known search term from the seeded/provider-created dataset.
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.fill('PROVEEDOR');

    // Verify filtered results
    const tableRows = page.locator('table tbody tr');
    await expect(tableRows.first(), 'La búsqueda de proveedores debe devolver al menos un resultado real').toBeVisible({ timeout: 30000 });
    await expect(tableRows.first()).toContainText(/PROVEEDOR|Proveedor/i);
  });

  test('Filtrar proveedores por estado', async ({ page }) => {
    // Navigate to proveedores page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores');

    await expect(page.locator('h1'), 'La ruta de proveedores no debe redirigir al wizard').toContainText('Proveedores', {
      timeout: 30000,
    });

    // Select "Activos" filter
    await page.getByRole('combobox').first().selectOption('true');

    // Verify all visible proveedores have "ACTIVO" badge
    const activoBadges = page.locator('span:has-text("ACTIVO")');
    await expect(activoBadges.first(), 'El filtro de proveedores activos debe mostrar al menos un proveedor activo').toBeVisible({ timeout: 30000 });
  });

  test('Navegar a detalle de proveedor', async ({ page }) => {
    // Navigate to proveedores page
    await gotoAuthenticated(page, '/dashboard/compras/proveedores');

    // Wait for table to load
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 30000 });

    // Click on the first "Ver detalle" button (eye icon)
    const viewButton = page.locator('button[title="Ver detalle"]').first();
    await expect(viewButton, 'Cada fila de proveedor debe exponer acción Ver detalle').toBeVisible({ timeout: 30000 });
    await viewButton.click();

    // Verify navigation to detail page
    await page.waitForURL(/\/dashboard\/compras\/proveedores\/[^/]+\/?$/, { timeout: 30000 });

    // Verify we're not on the edit or nuevo page
    expect(page.url()).not.toContain('/editar');
    expect(page.url()).not.toContain('/nuevo');
  });
});

test.describe('Compras - Órdenes de Compra', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  test('Crear OC completa', async ({ page }) => {
    // Navigate to ordenes de compra page
    await gotoAuthenticated(page, '/dashboard/compras/ordenes');

    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Click "Nueva Orden" button
    const nuevaOrdenBtn = page.locator('button:has-text("Nueva Orden")');
    await nuevaOrdenBtn.waitFor({ state: 'visible', timeout: 5000 });
    await nuevaOrdenBtn.click();

    // Wait for navigation to nueva orden page
    await page.waitForURL('**/ordenes/nueva**', { timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Nueva Orden de Compra');

    // Verify wizard is displayed with step 1
    await expect(page.getByRole('heading', { name: 'Información Básica' })).toBeVisible();

    // STEP 1: Fill basic information
    // Número de orden should be auto-generated
    const numeroOrden = await page.inputValue('input[name="numero"]');
    expect(numeroOrden).toMatch(/OC-\d{4}-\d{6}/);

    // Select a proveedor (wait for dropdown to load)
    await expect(page.locator('select[name="proveedor_id"] option:not([value=""])').first()).toBeAttached({ timeout: 15000 });
    const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();

    expect(proveedorOptions, 'Debe existir al menos un proveedor para crear una OC real').toBeGreaterThan(0);

    // Select the first available proveedor
    await page.selectOption('select[name="proveedor_id"]', { index: 1 });

    // Fecha orden should be today (already filled)
    const fechaOrden = await page.inputValue('input[name="fecha_orden"]');
    expect(fechaOrden).toBeTruthy();

    // Set fecha entrega esperada (7 days from now)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const fechaEntrega = futureDate.toISOString().split('T')[0];
    await page.fill('input[name="fecha_entrega_esperada"]', fechaEntrega);

    // Select condiciones de pago
    await page.selectOption('select[name="condiciones_pago"]', 'CREDITO_30');

    // Set dias credito
    await page.fill('input[name="dias_credito"]', '30');

    // Select almacen destino (if available)
    const almacenOptions = await page.locator('select[name="almacen_destino_id"] option:not([value=""])').count();
    if (almacenOptions > 0) {
      await page.selectOption('select[name="almacen_destino_id"]', { index: 1 });
    }

    // Add observaciones
    await page.fill('textarea[name="observaciones"]', 'Orden de compra de prueba E2E - Entrega urgente');

    // Take screenshot of step 1
    await page.screenshot({ path: 'tests/screenshots/oc-step1-filled.png', fullPage: true });

    // Click "Siguiente" to go to step 2
    await page.click('button:has-text("Siguiente")');

    // STEP 2: Add products
    await expect(page.locator('text=Agregar Productos')).toBeVisible();

    // Wait for productos dropdown to load; if there is no seed data, skip below.
    await expect(page.locator('select option:not([value=""])').first()).toBeAttached({ timeout: 15000 });
    const productoOptions = await page.locator('select option:not([value=""])').count();

    expect(productoOptions, 'Debe existir al menos un producto para crear una OC real').toBeGreaterThan(0);

    // Add first product
    const productSelect = page.locator('select').first();
    await productSelect.selectOption({ index: 1 });

    // Fill cantidad (first number input in the form)
    const cantidadInput = page.locator('input[type="number"]').first();
    await cantidadInput.clear();
    await cantidadInput.fill('10');

    // Fill precio unitario (second number input in the form)
    const precioInput = page.locator('input[type="number"]').nth(1);
    await precioInput.clear();
    await precioInput.fill('150.50');

    // Click add button (button with Plus icon in the form)
    const addButton = page.getByRole('button', { name: 'Agregar producto' });
    await addButton.click();

    // Wait a bit for the product to be added
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Verify product was added to the table
    await expect(page.locator('table tbody tr')).toHaveCount(1);

    let expectedProductRows = 1;
    if (productoOptions > 1) {
      // Add second product when the environment has more than one item available.
      await productSelect.selectOption({ index: 2 });
      await cantidadInput.clear();
      await cantidadInput.fill('5');
      await precioInput.clear();
      await precioInput.fill('250.00');
      await addButton.click();

      // Wait a bit for the second product to be added
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      expectedProductRows = 2;
    }

    // Verify products in table
    await expect(page.locator('table tbody tr')).toHaveCount(expectedProductRows);

    // Verify totals are calculated
    await expect(page.getByText('Subtotal:', { exact: true })).toBeVisible();
    await expect(page.getByText('IGV (18%):', { exact: true })).toBeVisible();
    await expect(page.getByText('Total:', { exact: true })).toBeVisible();

    // Take screenshot of step 2
    await page.screenshot({ path: 'tests/screenshots/oc-step2-products.png', fullPage: true });

    // Click "Siguiente" to go to step 3
    await page.click('button:has-text("Siguiente")');

    // STEP 3: Review
    await expect(page.locator('text=Revisión Final')).toBeVisible();

    // Verify basic information is displayed
    await expect(page.getByRole('heading', { name: 'Información Básica' })).toBeVisible();
    await expect(page.locator(`text=${numeroOrden}`)).toBeVisible();

    // Verify products summary
    await expect(page.locator(`text=Productos (${expectedProductRows})`)).toBeVisible();

    // Verify totals are displayed
    await expect(page.getByText('Subtotal:', { exact: true })).toBeVisible();
    await expect(page.getByText('IGV (18%):', { exact: true })).toBeVisible();
    await expect(page.getByText('Total:', { exact: true })).toBeVisible();

    // Take screenshot of step 3
    await page.screenshot({ path: 'tests/screenshots/oc-step3-review.png', fullPage: true });

    // Handle success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });

    // Click "Crear Orden de Compra" button
    await page.click('button:has-text("Crear Orden de Compra")');

    // Wait for navigation back to ordenes list
    await page.waitForURL(/\/dashboard\/compras\/ordenes\/?$/, { timeout: 30000 });

    // Wait for the list to reload
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Verify we're back on the ordenes page
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');

    // Take final screenshot
    await page.screenshot({ path: 'tests/screenshots/oc-created.png', fullPage: true });
  });

  test('Validar que se requiere al menos un producto', async ({ page }) => {
    // Navigate to nueva orden page
    await gotoAuthenticated(page, '/dashboard/compras/ordenes/nueva');

    // Fill step 1 with minimal data
    await expect(page.locator('select[name="proveedor_id"] option:not([value=""])').first()).toBeAttached({ timeout: 5000 });
    const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();

    expect(proveedorOptions, 'Debe existir al menos un proveedor para validar el wizard de OC').toBeGreaterThan(0);

    await page.selectOption('select[name="proveedor_id"]', { index: 1 });

    // Click siguiente to go to step 2
    await page.click('button:has-text("Siguiente")');

    // Try to go to step 3 without adding products
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('al menos un producto');
      await dialog.accept();
    });

    await page.click('button:has-text("Siguiente")');

    // Should still be on step 2
    await expect(page.locator('text=Agregar Productos')).toBeVisible();
  });

  test('Navegar entre pasos del wizard', async ({ page }) => {
    // Navigate to nueva orden page
    await gotoAuthenticated(page, '/dashboard/compras/ordenes/nueva');

    // Verify step 1 is active
    await expect(page.getByRole('heading', { name: 'Información Básica' })).toBeVisible();

    // Fill minimal data for step 1
    await expect(page.locator('select[name="proveedor_id"] option:not([value=""])').first()).toBeAttached({ timeout: 5000 });
    const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();

    expect(proveedorOptions, 'Debe existir al menos un proveedor para navegar el wizard de OC').toBeGreaterThan(0);

    await page.selectOption('select[name="proveedor_id"]', { index: 1 });

    // Go to step 2
    await page.click('button:has-text("Siguiente")');
    await expect(page.locator('text=Agregar Productos')).toBeVisible();

    // Go back to step 1
    await page.click('button:has-text("Anterior")');
    await expect(page.getByRole('heading', { name: 'Información Básica' })).toBeVisible();

    // Verify data is preserved
    const selectedProveedor = await page.inputValue('select[name="proveedor_id"]');
    expect(selectedProveedor).not.toBe('');
  });

  test('Cancelar creación de OC desde step 1', async ({ page }) => {
    // Navigate to nueva orden page
    await gotoAuthenticated(page, '/dashboard/compras/ordenes/nueva');

    // Fill some data when seed suppliers are available.
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();

    if (proveedorOptions > 0) {
      await page.selectOption('select[name="proveedor_id"]', { index: 1 });
    }

    // Handle confirmation dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('cancelar');
      await dialog.accept();
    });

    // Click cancelar button
    await page.click('button:has-text("Cancelar")');

    // Verify navigation back to ordenes list
    await page.waitForURL(/\/dashboard\/compras\/ordenes\/?$/);
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');
  });

  test('Aprobar OC', async ({ page }) => {
    // Navigate to ordenes de compra page
    await gotoAuthenticated(page, '/dashboard/compras/ordenes');

    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Look for an order in APROBACION or BORRADOR state that can be approved
    // Try to find an order card in the kanban view (cards with orden.numero)
    const ordenCards = page.locator('div').filter({
      has: page.locator('div[style*="fontFamily: monospace"]')
    }).filter({
      has: page.locator('div:has-text("OC-")')
    });

    const ordenCount = await ordenCards.count();

    let ordenId: string | null = null;

    if (ordenCount > 0) {
      // Click on the first order card to view details
      await ordenCards.first().click();

      // Wait for navigation to detail page
      await page.waitForURL('**/ordenes/**', { timeout: 30000 });

      // Extract orden ID from URL
      const url = page.url();
      const match = url.match(/\/ordenes\/([^\/]+)/);
      if (match) {
        ordenId = match[1];
      }
    } else {
      // If no orders in kanban, create a new one first
      console.log('⚠️ No hay órdenes disponibles. Creando una nueva orden primero...');

      // Click "Nueva Orden" button
      const nuevaOrdenBtn = page.locator('button:has-text("Nueva Orden")');
      await nuevaOrdenBtn.waitFor({ state: 'visible', timeout: 5000 });
      await nuevaOrdenBtn.click();

      // Wait for navigation to nueva orden page
      await page.waitForURL('**/ordenes/nueva**', { timeout: 30000 });

      // STEP 1: Fill basic information
      await page.inputValue('input[name="numero"]');
      await expect(page.locator('select[name="proveedor_id"] option:not([value=""])').first()).toBeAttached({ timeout: 5000 });
      const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();

      expect(proveedorOptions, 'Debe existir al menos un proveedor para crear la OC de aprobación').toBeGreaterThan(0);

      await page.selectOption('select[name="proveedor_id"]', { index: 1 });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const fechaEntrega = futureDate.toISOString().split('T')[0];
      await page.fill('input[name="fecha_entrega_esperada"]', fechaEntrega);

      await page.selectOption('select[name="condiciones_pago"]', 'CREDITO_30');
      await page.fill('input[name="dias_credito"]', '30');

      await expect(page.locator('select[name="almacen_destino_id"] option:not([value=""])').first()).toBeAttached({ timeout: 15000 });
      await expect(page.locator('select[name="almacen_destino_id"] option:not([value=""])').first()).toBeAttached({ timeout: 15000 });
      const almacenOptions = await page.locator('select[name="almacen_destino_id"] option:not([value=""])').count();
      if (almacenOptions > 0) {
        await page.selectOption('select[name="almacen_destino_id"]', { index: 1 });
      }

      await page.fill('textarea[name="observaciones"]', 'Orden de compra para test de aprobación');

      await page.click('button:has-text("Siguiente")');

      // STEP 2: Add products
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      const productoOptions = await page.locator('select option:not([value=""])').count();

      expect(productoOptions, 'Debe existir al menos un producto para crear la OC de aprobación').toBeGreaterThan(0);

      const productSelect = page.locator('select').first();
      await productSelect.selectOption({ index: 1 });

      const cantidadInput = page.locator('input[type="number"]').first();
      await cantidadInput.clear();
      await cantidadInput.fill('10');

      const precioInput = page.locator('input[type="number"]').nth(1);
      await precioInput.clear();
      await precioInput.fill('150.50');

      const addButton = page.getByRole('button', { name: 'Agregar producto' });
      await addButton.click();

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

      await page.click('button:has-text("Siguiente")');

      // STEP 3: Review and create
      const crearOrdenResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/api/compras/ordenes') &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: 30000 },
      );
      await page.click('button:has-text("Crear Orden de Compra")');
      const crearOrdenResponse = await crearOrdenResponsePromise;
      const crearOrdenBody = await crearOrdenResponse.json().catch(() => null);
      ordenId = crearOrdenBody?.data?.id ?? crearOrdenBody?.id ?? null;

      // Wait for navigation back to ordenes list
      await page.waitForURL(/\/dashboard\/compras\/ordenes\/?$/, { timeout: 30000 });
      await expect(page.getByText('Cargando órdenes de compra...')).toHaveCount(0, { timeout: 20000 });

      expect(ordenId, 'La respuesta de creación debe incluir el id de la OC').toBeTruthy();
      await gotoAuthenticated(page, `/dashboard/compras/ordenes/${ordenId}`);
    }

    expect(ordenId, 'La prueba debe obtener o crear una OC para aprobar').toBeTruthy();

    // Now we should be on the orden detail page
    await expect(page.locator('h1')).toContainText('Orden de Compra');

    // Take screenshot of the orden detail page
    await page.screenshot({ path: 'tests/screenshots/oc-detail-before-approval.png', fullPage: true });

    // Check if the orden is in a state that can be approved (BORRADOR, APROBACION, or PENDIENTE)
    const estadoBadge = page.locator('span').filter({ hasText: /Borrador|En Aprobación|Pendiente/i });
    const canApprove = await estadoBadge.count() > 0;

    expect(canApprove, 'La OC seleccionada debe estar en estado aprobable').toBe(true);

    // Look for the "Aprobar Orden" button
    const aprobarButton = page.locator('button:has-text("Aprobar Orden")');

    // Verify the button is visible
    await expect(aprobarButton).toBeVisible({ timeout: 5000 });

    // Click the "Aprobar Orden" button
    await aprobarButton.click();

    // Wait for the approval modal to appear
    await expect(page.locator('h2:has-text("Aprobar Orden de Compra")')).toBeVisible({ timeout: 5000 });

    // Take screenshot of the approval modal
    await page.screenshot({ path: 'tests/screenshots/oc-approval-modal.png', fullPage: true });

    // Verify modal content
    await expect(page.locator('text=¿Está seguro que desea aprobar la orden de compra')).toBeVisible();

    // Fill in optional comments
    const comentariosTextarea = page.locator('textarea[placeholder*="comentarios"]');
    await comentariosTextarea.fill('Orden aprobada mediante test E2E automatizado. Todos los requisitos cumplidos.');

    // Take screenshot with comments filled
    await page.screenshot({ path: 'tests/screenshots/oc-approval-modal-filled.png', fullPage: true });

    // Click the "Aprobar Orden" button in the modal
    const confirmarAprobarButton = page.locator('button:has-text("Aprobar Orden")').last();
    await confirmarAprobarButton.click();

    // Wait for the modal to close and the page to update
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Verify the modal is closed
    await expect(page.locator('h2:has-text("Aprobar Orden de Compra")')).not.toBeVisible();

    // Verify the orden state has changed to APROBADA
    await expect(page.getByText('Aprobada', { exact: true })).toBeVisible({ timeout: 30000 });

    // Take screenshot of the approved orden
    await page.screenshot({ path: 'tests/screenshots/oc-approved.png', fullPage: true });

    // Verify the "Aprobar Orden" button is no longer visible
    await expect(aprobarButton).not.toBeVisible();

    // Verify the "Crear Recepción" button is now visible (for APROBADA state)
    const crearRecepcionButton = page.locator('button:has-text("Crear Recepción")');
    await expect(crearRecepcionButton).toBeVisible({ timeout: 5000 });

    // Verify the approvals panel is visible
    const aprobacionesPanel = page.getByRole('heading', { name: 'Aprobaciones' });
    await expect(aprobacionesPanel, 'La OC aprobada debe mostrar trazabilidad de aprobaciones').toBeVisible({ timeout: 30000 });

    // Take screenshot of the approvals panel
    await page.screenshot({ path: 'tests/screenshots/oc-approvals-panel.png', fullPage: true });

    console.log('✅ Test de aprobación de OC completado exitosamente');
  });

  test('Recepcionar mercancía', async ({ page }) => {
    // Navigate to ordenes de compra page
    await gotoAuthenticated(page, '/dashboard/compras/ordenes');

    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Look for an order in APROBADA state that can be received
    const ordenCards = page.locator('div').filter({
      has: page.locator('div[style*="fontFamily: monospace"]')
    }).filter({
      has: page.locator('div:has-text("OC-")')
    });

    const ordenCount = await ordenCards.count();

    let ordenId: string | null = null;
    let ordenNumero: string | null = null;

    if (ordenCount > 0) {
      // Look for an APROBADA order
      for (let i = 0; i < ordenCount; i++) {
        const card = ordenCards.nth(i);
        const cardText = await card.textContent();

        if (cardText?.includes('Aprobada')) {
          await card.click();
          await page.waitForURL('**/ordenes/**', { timeout: 30000 });

          const url = page.url();
          const match = url.match(/\/ordenes\/([^\/]+)/);
          if (match) {
            ordenId = match[1];

            // Get orden numero from the page
            const numeroElement = page.locator('div[style*="fontFamily: monospace"]').first();
            ordenNumero = await numeroElement.textContent();
          }
          break;
        }
      }
    }

    // If no APROBADA order found, create and approve one
    if (!ordenId) {
      console.log('⚠️ No hay órdenes aprobadas. Creando y aprobando una nueva orden...');

      // Create a new order first
      await gotoAuthenticated(page, '/dashboard/compras/ordenes');

      const nuevaOrdenBtn = page.locator('button:has-text("Nueva Orden")');
      await nuevaOrdenBtn.waitFor({ state: 'visible', timeout: 5000 });
      await nuevaOrdenBtn.click();

      await page.waitForURL('**/ordenes/nueva**', { timeout: 30000 });

      // STEP 1: Fill basic information
      const numeroOrdenCreada = await page.inputValue('input[name="numero"]');
      await expect(page.locator('select[name="proveedor_id"] option:not([value=""])').first()).toBeAttached({ timeout: 5000 });
      const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();

      expect(proveedorOptions, 'Debe existir al menos un proveedor para crear la OC de recepción').toBeGreaterThan(0);

      await page.selectOption('select[name="proveedor_id"]', { index: 1 });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const fechaEntrega = futureDate.toISOString().split('T')[0];
      await page.fill('input[name="fecha_entrega_esperada"]', fechaEntrega);

      await page.selectOption('select[name="condiciones_pago"]', 'CREDITO_30');
      await page.fill('input[name="dias_credito"]', '30');

      await expect(page.locator('select[name="almacen_destino_id"] option:not([value=""])').first()).toBeAttached({ timeout: 15000 });
      const almacenOptions = await page.locator('select[name="almacen_destino_id"] option:not([value=""])').count();
      expect(almacenOptions, 'Debe existir al menos un almacén destino para crear una OC recepcionable').toBeGreaterThan(0);
      await page.selectOption('select[name="almacen_destino_id"]', { index: 1 });

      await page.fill('textarea[name="observaciones"]', 'Orden para test de recepción E2E');

      await page.click('button:has-text("Siguiente")');

      // STEP 2: Add products
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      const productoOptions = await page.locator('select option:not([value=""])').count();

      expect(productoOptions, 'Debe existir al menos un producto para crear la OC de recepción').toBeGreaterThan(0);

      const productSelect = page.locator('select').first();
      await productSelect.selectOption({ index: 1 });

      const cantidadInput = page.locator('input[type="number"]').first();
      await cantidadInput.clear();
      await cantidadInput.fill('20');

      const precioInput = page.locator('input[type="number"]').nth(1);
      await precioInput.clear();
      await precioInput.fill('100.00');

      const addButton = page.getByRole('button', { name: 'Agregar producto' });
      await addButton.click();

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

      await page.click('button:has-text("Siguiente")');

      // STEP 3: Review and create
      const crearOrdenResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/api/compras/ordenes') &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: 30000 },
      );
      await page.click('button:has-text("Crear Orden de Compra")');
      await crearOrdenResponsePromise;

      await page.waitForURL(/\/dashboard\/compras\/ordenes\/?$/, { timeout: 30000 });
      await expect(page.getByText('Cargando órdenes de compra...')).toHaveCount(0, { timeout: 20000 });

      // Find the newly created order and approve it
      const nuevaOrdenCard = page.getByText(numeroOrdenCreada, { exact: true });
      await expect(nuevaOrdenCard).toBeVisible({ timeout: 20000 });
      await nuevaOrdenCard.click();
      await page.waitForURL(/\/dashboard\/compras\/ordenes\/[^/]+\/?$/, { timeout: 30000 });

      const url = page.url();
      const match = url.match(/\/ordenes\/([^\/]+)/);
      if (match) {
        ordenId = match[1];
        ordenNumero = numeroOrdenCreada;
      }

      // Approve the order
      const aprobarButton = page.locator('button:has-text("Aprobar Orden")');
      await expect(aprobarButton).toBeVisible({ timeout: 5000 });
      await aprobarButton.click();
      await expect(page.locator('h2:has-text("Aprobar Orden de Compra")')).toBeVisible({ timeout: 5000 });

      const comentariosTextarea = page.locator('textarea[placeholder*="comentarios"]');
      await comentariosTextarea.fill('Aprobación automática para test de recepción');

      const confirmarAprobarButton = page.locator('button:has-text("Aprobar Orden")').last();
      await confirmarAprobarButton.click();

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    }

    expect(ordenId, 'La prueba debe obtener o crear una OC aprobada para recepcionar').toBeTruthy();

    // Now we should be on the orden detail page with APROBADA state
    await expect(page.getByText('Cargando orden de compra...')).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator('h1')).toContainText('Orden de Compra');

    // Verify the orden is APROBADA
    await expect(page.getByText('Aprobada', { exact: true })).toBeVisible({ timeout: 30000 });

    // Take screenshot before creating reception
    await page.screenshot({ path: 'tests/screenshots/recepcion-orden-aprobada.png', fullPage: true });

    // Click "Crear Recepción" button
    const crearRecepcionButton = page.locator('button:has-text("Crear Recepción")');
    await expect(crearRecepcionButton).toBeVisible({ timeout: 5000 });
    await crearRecepcionButton.click();

    // Wait for navigation to nueva recepcion page
    await page.waitForURL('**/recepciones/nueva**', { timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Nueva Recepción de Mercancía');

    // Verify wizard is displayed
    await expect(page.getByRole('heading', { name: 'Ingrese las cantidades recibidas' })).toBeVisible();

    // Take screenshot of wizard step 1
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step1.png', fullPage: true });

    // STEP 1: Verify orden information is loaded
    if (ordenNumero) {
      await expect(page.locator(`text=${ordenNumero}`)).toBeVisible();
    }

    // Verify pending items are displayed and receive the whole pending quantity.
    await expect(page.getByText(/productos? pendientes?/i)).toBeVisible();
    await page.getByRole('button', { name: /Recibir todo/ }).first().click();
    await expect(page.getByText(/Total de items a recibir:/)).toBeVisible();

    // Click "Siguiente" to go to step 2
    await page.click('button:has-text("Siguiente")');

    // STEP 2: Enter quality
    await expect(page.getByRole('heading', { name: 'Evaluación de Calidad' })).toBeVisible();

    // Take screenshot of step 2
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step2-initial.png', fullPage: true });

    // Select quality as OK
    await page.getByRole('button', { name: /^OK$/ }).first().click();

    // Take screenshot after filling quantities
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step2-filled.png', fullPage: true });

    // Click "Siguiente" to go to step 3
    await page.click('button:has-text("Siguiente")');

    // STEP 3: Assign lotes/series/ubicaciones
    await expect(page.getByRole('heading', { name: 'Asignar Almacén, Ubicación, Lotes y Series' })).toBeVisible();

    // Take screenshot of step 3
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step3-initial.png', fullPage: true });

    // Select almacen (required)
    const almacenSelect = page.locator('select').first();
    const almacenOptionsCount = await almacenSelect.locator('option:not([value=""])').count();
    expect(almacenOptionsCount, 'La recepción debe permitir asignar un almacén operativo').toBeGreaterThan(0);
    await almacenSelect.selectOption({ index: 1 });

    // Wait for ubicaciones to load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Select ubicacion when the warehouse has locations configured.
    const ubicacionSelect = page.locator('select').nth(1);
    const ubicacionOptionsCount = await ubicacionSelect.locator('option:not([value=""])').count();

    if (ubicacionOptionsCount > 0) {
      await ubicacionSelect.selectOption({ index: 1 });
    }

    // Fill lote for the first product
    const firstProductRowStep3 = page.locator('table tbody tr').first();
    const loteInput = firstProductRowStep3.locator('input[placeholder*="Lote"]');
    if (await loteInput.count() > 0) {
      await loteInput.fill('LOTE-TEST-001');
    }

    // Fill fecha expiracion if available
    const fechaExpInput = firstProductRowStep3.locator('input[type="date"]');
    if (await fechaExpInput.count() > 0) {
      const futureExpDate = new Date();
      futureExpDate.setFullYear(futureExpDate.getFullYear() + 1);
      const fechaExp = futureExpDate.toISOString().split('T')[0];
      await fechaExpInput.fill(fechaExp);
    }

    // Take screenshot after filling lotes
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step3-filled.png', fullPage: true });

    // Click "Siguiente" to go to step 4
    await page.click('button:has-text("Siguiente")');

    // STEP 4: Review and confirm
    await expect(page.getByRole('heading', { name: 'Confirmar Recepción' })).toBeVisible();

    // Verify summary cards are displayed
    await expect(page.locator('text=Total Items')).toBeVisible();
    await expect(page.getByText('OK', { exact: true }).first()).toBeVisible();

    // Verify the review table shows the items
    await expect(page.locator('table')).toBeVisible();

    // Take screenshot of review step
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step4-review.png', fullPage: true });

    // Click "Completar Recepción" button
    const cerrarRecepcionButton = page.locator('button:has-text("Completar Recepción")');
    await expect(cerrarRecepcionButton).toBeVisible();
    const successDialogPromise = page.waitForEvent('dialog', { timeout: 30000 });
    const cerrarRecepcionResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/compras/recepciones/') &&
        /\/cerrar\/?(\?|$)/.test(response.url()) &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 30000 },
    );
    await cerrarRecepcionButton.click();
    const cerrarRecepcionResponse = await cerrarRecepcionResponsePromise;
    expect(cerrarRecepcionResponse.status(), 'La API debe aceptar el cierre de recepción').toBe(200);

    const successDialog = await successDialogPromise;
    expect(successDialog.message()).toContain('exitosamente');
    await successDialog.accept();

    // Wait for navigation back to recepciones list
    await page.waitForURL(/\/dashboard\/compras\/recepciones\/?$/, { timeout: 30000 });

    // Wait for the list to reload
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Verify we're back on the recepciones page
    await expect(page.locator('h1')).toContainText('Recepciones');

    // Take final screenshot
    await page.screenshot({ path: 'tests/screenshots/recepcion-created.png', fullPage: true });

    await expect(page.getByRole('heading', { name: 'ÓRDENES PENDIENTES', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'APROBADAS', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'PARCIALES', exact: true })).toBeVisible();

    console.log('✅ Test de recepción de mercancía completado exitosamente');
  });

  test('Crear devolución', async ({ page }) => {
    const recepcionSetup = await crearRecepcionCerradaParaDevolucion(page);

    // Navigate to devoluciones page
    await gotoAuthenticated(page, '/dashboard/compras/devoluciones');

    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Devoluciones');

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Take screenshot of devoluciones list
    await page.screenshot({ path: 'tests/screenshots/devoluciones-list.png', fullPage: true });

    // Click "Nueva Devolución" button
    const nuevaDevolucionBtn = page.locator('button:has-text("Nueva Devolución")');
    await nuevaDevolucionBtn.waitFor({ state: 'visible', timeout: 5000 });
    await nuevaDevolucionBtn.click();

    // Wait for navigation to nueva devolución page
    await page.waitForURL('**/devoluciones/nueva**', { timeout: 30000 });
    await expect(page.locator('h1')).toContainText('Nueva Devolución a Proveedor');

    // Verify wizard is displayed with step 1
    await expect(page.locator('text=Seleccionar Recepción')).toBeVisible();

    // Take screenshot of step 1
    await page.screenshot({ path: 'tests/screenshots/devolucion-step1-initial.png', fullPage: true });

    // STEP 1: Select a closed reception
    // Wait for recepciones to load
    await expect(page.getByText('Cargando recepciones...')).toBeHidden({ timeout: 30000 });

    await page.getByPlaceholder('Buscar por número de recepción, orden o proveedor...').fill(recepcionSetup.numero);
    await expect(page.getByText(recepcionSetup.numero, { exact: true })).toBeVisible({ timeout: 15000 });

    // Check if there are any recepciones available
    const recepcionCards = page.locator('div').filter({ hasText: /REC-\d{4}-\d{4,6}/ });
    const recepcionCount = await recepcionCards.count();

    expect(recepcionCount, 'Debe existir al menos una recepción cerrada para validar devoluciones').toBeGreaterThan(0);

    await page.getByText(recepcionSetup.numero, { exact: true }).click();

    // Wait for step 2 to load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // STEP 2: Configure items to return
    await expect(page.getByRole('heading', { name: /Items a Devolver/i })).toBeVisible();

    // Verify recepcion info is displayed
    await expect(page.locator('text=/Recepción: REC-/')).toBeVisible();

    // Take screenshot of step 2 initial state
    await page.screenshot({ path: 'tests/screenshots/devolucion-step2-initial.png', fullPage: true });

    // Fill motivo general (required)
    const motivoSelect = page.locator('select').first();
    await motivoSelect.selectOption('DEFECTUOSO');

    // Fill observaciones generales (optional)
    const observacionesTextarea = page.locator('textarea').first();
    await observacionesTextarea.fill('Productos defectuosos detectados durante inspección de calidad. Requieren reemplazo inmediato.');

    // Check if there are pre-loaded items (from rejected/observed items in reception)
    const preLoadedItems = await page.locator('div').filter({ hasText: /Items a Devolver/ }).locator('..').locator('div').filter({ hasText: /Producto \*/ }).count();

    if (preLoadedItems === 0) {
      // If no pre-loaded items, add one manually
      const addItemBtn = page.locator('button:has-text("Agregar Item")');
      await addItemBtn.click();

      // Wait for the item form to appear
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

      // Fill the item details
      // Note: In a real scenario, we would need to select from available products
      // For this test, we'll fill with a product ID if the field is available
      const productoInput = page.locator('input[placeholder*="ID del producto"]').first();
      await expect(productoInput, 'La devolución debe precargar items desde una recepción real; no debe requerir ID manual').toHaveCount(0);
      expect(preLoadedItems, 'Debe haber items precargados para una devolución real').toBeGreaterThan(0);
    } else {
      // If there are pre-loaded items, verify and optionally modify them
      console.log(`✅ ${preLoadedItems} items pre-cargados desde la recepción`);

      // Verify the first item has required fields
      const firstItemCantidad = page.locator('input[type="number"]').first();
      await firstItemCantidad.clear();
      await firstItemCantidad.fill('2');

      // Verify motivo is selected
      const firstItemMotivo = page.locator('select').nth(1); // Second select (first is motivo general)
      const motivoValue = await firstItemMotivo.inputValue();

      if (!motivoValue) {
        await firstItemMotivo.selectOption('DEFECTUOSO');
      }

      // Optionally add observaciones to the item
      const itemObservaciones = page.locator('input[placeholder*="Detalles específicos"]').first();
      if (await itemObservaciones.count() > 0) {
        await itemObservaciones.fill('Defecto de fabricación detectado en inspección visual');
      }
    }

    // Take screenshot after filling data
    await page.screenshot({ path: 'tests/screenshots/devolucion-step2-filled.png', fullPage: true });

    // Click "Crear Devolución" button
    const crearDevolucionBtn = page.locator('button:has-text("Crear Devolución")');
    await expect(crearDevolucionBtn).toBeVisible();

    // Verify button is enabled (has items and motivo)
    const isDisabled = await crearDevolucionBtn.isDisabled();
    expect(isDisabled, 'Crear Devolución debe estar habilitado con recepción, motivo e items válidos').toBe(false);

    const crearDevolucionResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/compras/devoluciones') &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 30000 },
    );
    await crearDevolucionBtn.click();

    const crearDevolucionResponse = await crearDevolucionResponsePromise;
    expect(crearDevolucionResponse.status(), 'La API debe crear la devolución').toBe(201);

    // Wait for navigation to devolucion detail page
    await page.waitForURL(/\/dashboard\/compras\/devoluciones\/[0-9a-f-]{36}\/?$/i, { timeout: 30000 });

    // Verify we're on the detail page (not on /nueva)
    expect(page.url()).not.toContain('/nueva');

    // Wait for the detail page to load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    // Verify we're on the devolucion detail page
    await expect(page.locator('h1')).toContainText('Devolución');

    // Verify the devolucion number is displayed
    await expect(page.getByRole('heading', { name: /Devolución DEV-\d{4}-\d{4,6}/ })).toBeVisible();

    // Verify estado badge is visible (should be PENDIENTE)
    const estadoBadge = page.locator('span').filter({ hasText: /PENDIENTE|Pendiente/i });
    await expect(estadoBadge).toBeVisible({ timeout: 5000 });

    // Take screenshot of the created devolucion
    await page.screenshot({ path: 'tests/screenshots/devolucion-created.png', fullPage: true });

    // Verify key information is displayed
    await expect(page.locator('text=Información General')).toBeVisible();
    await expect(page.locator('text=Items Devueltos')).toBeVisible();

    // Verify motivo is displayed
    await expect(page.locator('text=/DEFECTUOSO|Defectuoso/')).toBeVisible();

    // Verify totals are displayed
    await expect(page.getByText('Subtotal:', { exact: true })).toBeVisible();
    await expect(page.getByText('IGV (18%):', { exact: true })).toBeVisible();
    await expect(page.getByText('Total:', { exact: true })).toBeVisible();

    // Verify "Emitir Devolución" button is visible (for PENDIENTE state)
    const emitirButton = page.locator('button:has-text("Emitir Devolución")');
    await expect(emitirButton).toBeVisible({ timeout: 5000 });

    console.log('✅ Test de creación de devolución completado exitosamente');
  });
});
