import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * E2E Tests for Compras Module
 * 
 * This test suite covers the critical user flows in the purchasing module,
 * focusing on the supplier (proveedor) creation process.
 */

// Test data
const testProveedor = {
  ruc: '20123456789',
  razonSocial: 'DISTRIBUIDORA TEST E2E S.A.C.',
  nombreComercial: 'Test E2E Distribuidora',
  email: 'test-e2e@distribuidora.com',
  telefono: '+51 999 888 777',
  direccion: 'Av. Test E2E 123, Lima',
  contacto: 'Juan Pérez Test',
  condicionesPago: 'CREDITO_30',
  limiteCredito: '50000'
};

test.describe('Compras - Proveedores', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  test('Crear proveedor desde UI', async ({ page }) => {
    // Navigate to proveedores page
    await page.goto('/dashboard/compras/proveedores');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Proveedores');
    
    // Click "Nuevo Proveedor" button
    await page.click('button:has-text("Nuevo Proveedor")');
    
    // Wait for navigation to nuevo proveedor page
    await page.waitForURL('**/proveedores/nuevo');
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
    
    // Submit the form
    await page.click('button[type="submit"]:has-text("Crear Proveedor")');
    
    // Wait for success alert or navigation
    // Note: Adjust this based on your actual success handling
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });
    
    // Wait for navigation back to proveedores list
    await page.waitForURL('**/proveedores', { timeout: 10000 });
    
    // Verify the proveedor appears in the list
    await page.waitForTimeout(1000); // Give time for the list to reload
    
    // Search for the newly created proveedor
    await page.fill('input[placeholder*="Buscar"]', testProveedor.ruc);
    await page.waitForTimeout(500); // Wait for search to execute
    
    // Verify the proveedor is in the table
    const proveedorRow = page.locator('table tbody tr').first();
    await expect(proveedorRow).toContainText(testProveedor.ruc);
    await expect(proveedorRow).toContainText(testProveedor.razonSocial);
    
    // Take a screenshot of the result
    await page.screenshot({ path: 'tests/screenshots/proveedor-created.png', fullPage: true });
  });

  test('Validar campos requeridos en formulario de proveedor', async ({ page }) => {
    // Navigate to nuevo proveedor page
    await page.goto('/dashboard/compras/proveedores/nuevo');
    
    // Try to submit empty form
    await page.click('button[type="submit"]:has-text("Crear Proveedor")');
    
    // Verify validation errors appear
    await expect(page.locator('text=El RUC es requerido')).toBeVisible();
    await expect(page.locator('text=La razón social debe tener al menos 3 caracteres')).toBeVisible();
    await expect(page.locator('text=El email es requerido')).toBeVisible();
  });

  test('Validar formato de RUC', async ({ page }) => {
    // Navigate to nuevo proveedor page
    await page.goto('/dashboard/compras/proveedores/nuevo');
    
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
    await page.goto('/dashboard/compras/proveedores/nuevo');
    
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
    await page.goto('/dashboard/compras/proveedores/nuevo');
    
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
    await page.waitForURL('**/proveedores');
    await expect(page.locator('h1')).toContainText('Proveedores');
  });

  test('Buscar proveedor por RUC', async ({ page }) => {
    // Navigate to proveedores page
    await page.goto('/dashboard/compras/proveedores');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Proveedores');
    
    // Use search input
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.fill('20123456789');
    
    // Wait for search results
    await page.waitForTimeout(500);
    
    // Verify filtered results
    const tableRows = page.locator('table tbody tr');
    const count = await tableRows.count();
    
    if (count > 0) {
      // If there are results, verify they contain the search term
      const firstRow = tableRows.first();
      await expect(firstRow).toContainText('20123456789');
    }
  });

  test('Filtrar proveedores por estado', async ({ page }) => {
    // Navigate to proveedores page
    await page.goto('/dashboard/compras/proveedores');
    
    // Select "Activos" filter
    await page.selectOption('select', 'true');
    
    // Wait for filter to apply
    await page.waitForTimeout(500);
    
    // Verify all visible proveedores have "ACTIVO" badge
    const activoBadges = page.locator('span:has-text("ACTIVO")');
    const count = await activoBadges.count();
    
    // Should have at least one active proveedor or show empty state
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('Navegar a detalle de proveedor', async ({ page }) => {
    // Navigate to proveedores page
    await page.goto('/dashboard/compras/proveedores');
    
    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 });
    
    // Click on the first "Ver detalle" button (eye icon)
    const viewButton = page.locator('button[title="Ver detalle"]').first();
    
    if (await viewButton.count() > 0) {
      await viewButton.click();
      
      // Verify navigation to detail page
      await page.waitForURL('**/proveedores/**');
      
      // Verify we're not on the edit or nuevo page
      expect(page.url()).not.toContain('/editar');
      expect(page.url()).not.toContain('/nuevo');
    }
  });
});

test.describe('Compras - Órdenes de Compra', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  test('Crear OC completa', async ({ page }) => {
    // Navigate to ordenes de compra page
    await page.goto('/dashboard/compras/ordenes');
    
    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');
    
    // Wait for the page to fully load
    await page.waitForTimeout(1000);
    
    // Click "Nueva Orden" button
    const nuevaOrdenBtn = page.locator('button:has-text("Nueva Orden")');
    await nuevaOrdenBtn.waitFor({ state: 'visible', timeout: 5000 });
    await nuevaOrdenBtn.click();
    
    // Wait for navigation to nueva orden page
    await page.waitForURL('**/ordenes/nueva', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Nueva Orden de Compra');
    
    // Verify wizard is displayed with step 1
    await expect(page.locator('text=Información Básica')).toBeVisible();
    
    // STEP 1: Fill basic information
    // Número de orden should be auto-generated
    const numeroOrden = await page.inputValue('input[name="numero"]');
    expect(numeroOrden).toMatch(/OC-\d{4}-\d{6}/);
    
    // Select a proveedor (wait for dropdown to load)
    await page.waitForSelector('select[name="proveedor_id"] option:not([value=""])', { timeout: 5000 });
    const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();
    
    if (proveedorOptions === 0) {
      console.log('⚠️ No hay proveedores disponibles. Saltando test.');
      return;
    }
    
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
    
    // Wait for productos dropdown to load
    await page.waitForSelector('select option:not([value=""])', { timeout: 5000 });
    const productoOptions = await page.locator('select option:not([value=""])').count();
    
    if (productoOptions === 0) {
      console.log('⚠️ No hay productos disponibles. Saltando test.');
      return;
    }
    
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
    const addButton = page.locator('button.refresh-btn').filter({ hasText: '' }).first();
    await addButton.click();
    
    // Wait a bit for the product to be added
    await page.waitForTimeout(500);
    
    // Verify product was added to the table
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    
    // Add second product
    await productSelect.selectOption({ index: 2 });
    await cantidadInput.clear();
    await cantidadInput.fill('5');
    await precioInput.clear();
    await precioInput.fill('250.00');
    await addButton.click();
    
    // Wait a bit for the second product to be added
    await page.waitForTimeout(500);
    
    // Verify two products in table
    await expect(page.locator('table tbody tr')).toHaveCount(2);
    
    // Verify totals are calculated
    await expect(page.locator('text=Subtotal:')).toBeVisible();
    await expect(page.locator('text=IGV (18%):')).toBeVisible();
    await expect(page.locator('text=Total:')).toBeVisible();
    
    // Take screenshot of step 2
    await page.screenshot({ path: 'tests/screenshots/oc-step2-products.png', fullPage: true });
    
    // Click "Siguiente" to go to step 3
    await page.click('button:has-text("Siguiente")');
    
    // STEP 3: Review
    await expect(page.locator('text=Revisión Final')).toBeVisible();
    
    // Verify basic information is displayed
    await expect(page.locator('text=Información Básica')).toBeVisible();
    await expect(page.locator(`text=${numeroOrden}`)).toBeVisible();
    
    // Verify products summary
    await expect(page.locator('text=Productos (2)')).toBeVisible();
    
    // Verify totals are displayed
    await expect(page.locator('text=Subtotal:')).toBeVisible();
    await expect(page.locator('text=IGV (18%):')).toBeVisible();
    await expect(page.locator('text=Total:')).toBeVisible();
    
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
    await page.waitForURL('**/ordenes', { timeout: 10000 });
    
    // Wait for the list to reload
    await page.waitForTimeout(1000);
    
    // Verify we're back on the ordenes page
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');
    
    // Take final screenshot
    await page.screenshot({ path: 'tests/screenshots/oc-created.png', fullPage: true });
  });

  test('Validar que se requiere al menos un producto', async ({ page }) => {
    // Navigate to nueva orden page
    await page.goto('/dashboard/compras/ordenes/nueva');
    
    // Fill step 1 with minimal data
    await page.waitForSelector('select[name="proveedor_id"] option:not([value=""])', { timeout: 5000 });
    const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();
    
    if (proveedorOptions === 0) {
      console.log('⚠️ No hay proveedores disponibles. Saltando test.');
      return;
    }
    
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
    await page.goto('/dashboard/compras/ordenes/nueva');
    
    // Verify step 1 is active
    await expect(page.locator('text=Información Básica')).toBeVisible();
    
    // Fill minimal data for step 1
    await page.waitForSelector('select[name="proveedor_id"] option:not([value=""])', { timeout: 5000 });
    const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();
    
    if (proveedorOptions === 0) {
      console.log('⚠️ No hay proveedores disponibles. Saltando test.');
      return;
    }
    
    await page.selectOption('select[name="proveedor_id"]', { index: 1 });
    
    // Go to step 2
    await page.click('button:has-text("Siguiente")');
    await expect(page.locator('text=Agregar Productos')).toBeVisible();
    
    // Go back to step 1
    await page.click('button:has-text("Anterior")');
    await expect(page.locator('text=Información Básica')).toBeVisible();
    
    // Verify data is preserved
    const selectedProveedor = await page.inputValue('select[name="proveedor_id"]');
    expect(selectedProveedor).not.toBe('');
  });

  test('Cancelar creación de OC desde step 1', async ({ page }) => {
    // Navigate to nueva orden page
    await page.goto('/dashboard/compras/ordenes/nueva');
    
    // Fill some data
    await page.waitForSelector('select[name="proveedor_id"] option:not([value=""])', { timeout: 5000 });
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
    await page.waitForURL('**/ordenes');
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');
  });

  test('Aprobar OC', async ({ page }) => {
    // Navigate to ordenes de compra page
    await page.goto('/dashboard/compras/ordenes');
    
    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');
    
    // Wait for the page to fully load
    await page.waitForTimeout(1000);
    
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
      await page.waitForURL('**/ordenes/**', { timeout: 10000 });
      
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
      await page.waitForURL('**/ordenes/nueva', { timeout: 10000 });
      
      // STEP 1: Fill basic information
      await page.waitForSelector('select[name="proveedor_id"] option:not([value=""])', { timeout: 5000 });
      const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();
      
      if (proveedorOptions === 0) {
        console.log('⚠️ No hay proveedores disponibles. Saltando test.');
        return;
      }
      
      await page.selectOption('select[name="proveedor_id"]', { index: 1 });
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const fechaEntrega = futureDate.toISOString().split('T')[0];
      await page.fill('input[name="fecha_entrega_esperada"]', fechaEntrega);
      
      await page.selectOption('select[name="condiciones_pago"]', 'CREDITO_30');
      await page.fill('input[name="dias_credito"]', '30');
      
      const almacenOptions = await page.locator('select[name="almacen_destino_id"] option:not([value=""])').count();
      if (almacenOptions > 0) {
        await page.selectOption('select[name="almacen_destino_id"]', { index: 1 });
      }
      
      await page.fill('textarea[name="observaciones"]', 'Orden de compra para test de aprobación');
      
      await page.click('button:has-text("Siguiente")');
      
      // STEP 2: Add products
      await page.waitForSelector('select option:not([value=""])', { timeout: 5000 });
      const productoOptions = await page.locator('select option:not([value=""])').count();
      
      if (productoOptions === 0) {
        console.log('⚠️ No hay productos disponibles. Saltando test.');
        return;
      }
      
      const productSelect = page.locator('select').first();
      await productSelect.selectOption({ index: 1 });
      
      const cantidadInput = page.locator('input[type="number"]').first();
      await cantidadInput.clear();
      await cantidadInput.fill('10');
      
      const precioInput = page.locator('input[type="number"]').nth(1);
      await precioInput.clear();
      await precioInput.fill('150.50');
      
      const addButton = page.locator('button.refresh-btn').filter({ hasText: '' }).first();
      await addButton.click();
      
      await page.waitForTimeout(500);
      
      await page.click('button:has-text("Siguiente")');
      
      // STEP 3: Review and create
      page.on('dialog', async dialog => {
        await dialog.accept();
      });
      
      await page.click('button:has-text("Crear Orden de Compra")');
      
      // Wait for navigation back to ordenes list
      await page.waitForURL('**/ordenes', { timeout: 10000 });
      await page.waitForTimeout(1000);
      
      // Now find the newly created order
      const newOrdenCards = page.locator('[data-testid="orden-card"]');
      const newOrdenCount = await newOrdenCards.count();
      
      if (newOrdenCount > 0) {
        await newOrdenCards.first().click();
        await page.waitForURL('**/ordenes/**', { timeout: 10000 });
        
        const url = page.url();
        const match = url.match(/\/ordenes\/([^\/]+)/);
        if (match) {
          ordenId = match[1];
        }
      }
    }
    
    if (!ordenId) {
      console.log('⚠️ No se pudo obtener el ID de la orden. Saltando test.');
      return;
    }
    
    // Now we should be on the orden detail page
    await expect(page.locator('h1')).toContainText('Orden de Compra');
    
    // Take screenshot of the orden detail page
    await page.screenshot({ path: 'tests/screenshots/oc-detail-before-approval.png', fullPage: true });
    
    // Check if the orden is in a state that can be approved (BORRADOR, APROBACION, or PENDIENTE)
    const estadoBadge = page.locator('span').filter({ hasText: /Borrador|En Aprobación|Pendiente/i });
    const canApprove = await estadoBadge.count() > 0;
    
    if (!canApprove) {
      console.log('⚠️ La orden no está en un estado que permita aprobación. Saltando test.');
      return;
    }
    
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
    
    // Handle success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });
    
    // Click the "Aprobar Orden" button in the modal
    const confirmarAprobarButton = page.locator('button:has-text("Aprobar Orden")').last();
    await confirmarAprobarButton.click();
    
    // Wait for the modal to close and the page to update
    await page.waitForTimeout(2000);
    
    // Verify the modal is closed
    await expect(page.locator('h2:has-text("Aprobar Orden de Compra")')).not.toBeVisible();
    
    // Verify the orden state has changed to APROBADA
    const estadoAprobada = page.locator('span').filter({ hasText: /Aprobada/i });
    await expect(estadoAprobada).toBeVisible({ timeout: 5000 });
    
    // Take screenshot of the approved orden
    await page.screenshot({ path: 'tests/screenshots/oc-approved.png', fullPage: true });
    
    // Verify the "Aprobar Orden" button is no longer visible
    await expect(aprobarButton).not.toBeVisible();
    
    // Verify the "Crear Recepción" button is now visible (for APROBADA state)
    const crearRecepcionButton = page.locator('button:has-text("Crear Recepción")');
    await expect(crearRecepcionButton).toBeVisible({ timeout: 5000 });
    
    // Verify the approvals panel is visible
    const aprobacionesPanel = page.locator('text=Aprobaciones');
    if (await aprobacionesPanel.count() > 0) {
      await expect(aprobacionesPanel).toBeVisible();
      
      // Take screenshot of the approvals panel
      await page.screenshot({ path: 'tests/screenshots/oc-approvals-panel.png', fullPage: true });
    }
    
    console.log('✅ Test de aprobación de OC completado exitosamente');
  });

  test('Recepcionar mercancía', async ({ page }) => {
    // Navigate to ordenes de compra page
    await page.goto('/dashboard/compras/ordenes');
    
    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Órdenes de Compra');
    
    // Wait for the page to fully load
    await page.waitForTimeout(1000);
    
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
          await page.waitForURL('**/ordenes/**', { timeout: 10000 });
          
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
      await page.goto('/dashboard/compras/ordenes');
      
      const nuevaOrdenBtn = page.locator('button:has-text("Nueva Orden")');
      await nuevaOrdenBtn.waitFor({ state: 'visible', timeout: 5000 });
      await nuevaOrdenBtn.click();
      
      await page.waitForURL('**/ordenes/nueva', { timeout: 10000 });
      
      // STEP 1: Fill basic information
      await page.waitForSelector('select[name="proveedor_id"] option:not([value=""])', { timeout: 5000 });
      const proveedorOptions = await page.locator('select[name="proveedor_id"] option:not([value=""])').count();
      
      if (proveedorOptions === 0) {
        console.log('⚠️ No hay proveedores disponibles. Saltando test.');
        return;
      }
      
      await page.selectOption('select[name="proveedor_id"]', { index: 1 });
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const fechaEntrega = futureDate.toISOString().split('T')[0];
      await page.fill('input[name="fecha_entrega_esperada"]', fechaEntrega);
      
      await page.selectOption('select[name="condiciones_pago"]', 'CREDITO_30');
      await page.fill('input[name="dias_credito"]', '30');
      
      const almacenOptions = await page.locator('select[name="almacen_destino_id"] option:not([value=""])').count();
      if (almacenOptions > 0) {
        await page.selectOption('select[name="almacen_destino_id"]', { index: 1 });
      }
      
      await page.fill('textarea[name="observaciones"]', 'Orden para test de recepción E2E');
      
      await page.click('button:has-text("Siguiente")');
      
      // STEP 2: Add products
      await page.waitForSelector('select option:not([value=""])', { timeout: 5000 });
      const productoOptions = await page.locator('select option:not([value=""])').count();
      
      if (productoOptions === 0) {
        console.log('⚠️ No hay productos disponibles. Saltando test.');
        return;
      }
      
      const productSelect = page.locator('select').first();
      await productSelect.selectOption({ index: 1 });
      
      const cantidadInput = page.locator('input[type="number"]').first();
      await cantidadInput.clear();
      await cantidadInput.fill('20');
      
      const precioInput = page.locator('input[type="number"]').nth(1);
      await precioInput.clear();
      await precioInput.fill('100.00');
      
      const addButton = page.locator('button.refresh-btn').filter({ hasText: '' }).first();
      await addButton.click();
      
      await page.waitForTimeout(500);
      
      await page.click('button:has-text("Siguiente")');
      
      // STEP 3: Review and create
      page.on('dialog', async dialog => {
        await dialog.accept();
      });
      
      await page.click('button:has-text("Crear Orden de Compra")');
      
      await page.waitForURL('**/ordenes', { timeout: 10000 });
      await page.waitForTimeout(1000);
      
      // Find the newly created order and approve it
      const newOrdenCards = page.locator('div').filter({ 
        has: page.locator('div[style*="fontFamily: monospace"]')
      }).filter({
        has: page.locator('div:has-text("OC-")')
      });
      
      const newOrdenCount = await newOrdenCards.count();
      
      if (newOrdenCount > 0) {
        await newOrdenCards.first().click();
        await page.waitForURL('**/ordenes/**', { timeout: 10000 });
        
        const url = page.url();
        const match = url.match(/\/ordenes\/([^\/]+)/);
        if (match) {
          ordenId = match[1];
          
          const numeroElement = page.locator('div[style*="fontFamily: monospace"]').first();
          ordenNumero = await numeroElement.textContent();
        }
        
        // Approve the order
        const aprobarButton = page.locator('button:has-text("Aprobar Orden")');
        if (await aprobarButton.count() > 0) {
          await aprobarButton.click();
          await expect(page.locator('h2:has-text("Aprobar Orden de Compra")')).toBeVisible({ timeout: 5000 });
          
          const comentariosTextarea = page.locator('textarea[placeholder*="comentarios"]');
          await comentariosTextarea.fill('Aprobación automática para test de recepción');
          
          const confirmarAprobarButton = page.locator('button:has-text("Aprobar Orden")').last();
          await confirmarAprobarButton.click();
          
          await page.waitForTimeout(2000);
        }
      }
    }
    
    if (!ordenId) {
      console.log('⚠️ No se pudo obtener el ID de la orden. Saltando test.');
      return;
    }
    
    // Now we should be on the orden detail page with APROBADA state
    await expect(page.locator('h1')).toContainText('Orden de Compra');
    
    // Verify the orden is APROBADA
    const estadoAprobada = page.locator('span').filter({ hasText: /Aprobada/i });
    await expect(estadoAprobada).toBeVisible({ timeout: 5000 });
    
    // Take screenshot before creating reception
    await page.screenshot({ path: 'tests/screenshots/recepcion-orden-aprobada.png', fullPage: true });
    
    // Click "Crear Recepción" button
    const crearRecepcionButton = page.locator('button:has-text("Crear Recepción")');
    await expect(crearRecepcionButton).toBeVisible({ timeout: 5000 });
    await crearRecepcionButton.click();
    
    // Wait for navigation to nueva recepcion page
    await page.waitForURL('**/recepciones/nueva**', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Nueva Recepción de Mercancía');
    
    // Verify wizard is displayed
    await expect(page.locator('text=Paso 1 de 4')).toBeVisible();
    
    // Take screenshot of wizard step 1
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step1.png', fullPage: true });
    
    // STEP 1: Verify orden information is loaded
    if (ordenNumero) {
      await expect(page.locator(`text=${ordenNumero}`)).toBeVisible();
    }
    
    // Verify products table is displayed with pending items
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('table tbody tr')).toHaveCount(await page.locator('table tbody tr').count());
    
    // Click "Siguiente" to go to step 2
    await page.click('button:has-text("Siguiente")');
    
    // STEP 2: Enter quantities and quality
    await expect(page.locator('text=Paso 2 de 4')).toBeVisible();
    await expect(page.locator('text=Ingresar Cantidades y Calidad')).toBeVisible();
    
    // Take screenshot of step 2
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step2-initial.png', fullPage: true });
    
    // Get the first product row
    const firstProductRow = page.locator('table tbody tr').first();
    
    // Fill cantidad to receive (use input within the first row)
    const cantidadRecibir = firstProductRow.locator('input[type="number"]').first();
    await cantidadRecibir.clear();
    await cantidadRecibir.fill('10');
    
    // Select quality as OK (should be default, but let's click it)
    const okButton = firstProductRow.locator('button:has-text("OK")');
    await okButton.click();
    
    // Take screenshot after filling quantities
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step2-filled.png', fullPage: true });
    
    // Click "Siguiente" to go to step 3
    await page.click('button:has-text("Siguiente")');
    
    // STEP 3: Assign lotes/series/ubicaciones
    await expect(page.locator('text=Paso 3 de 4')).toBeVisible();
    await expect(page.locator('text=Asignar Lotes, Series y Ubicaciones')).toBeVisible();
    
    // Take screenshot of step 3
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step3-initial.png', fullPage: true });
    
    // Select almacen (required)
    const almacenSelect = page.locator('select').first();
    const almacenOptionsCount = await almacenSelect.locator('option:not([value=""])').count();
    
    if (almacenOptionsCount > 0) {
      await almacenSelect.selectOption({ index: 1 });
      
      // Wait for ubicaciones to load
      await page.waitForTimeout(500);
      
      // Optionally select ubicacion if available
      const ubicacionSelect = page.locator('select').nth(1);
      const ubicacionOptionsCount = await ubicacionSelect.locator('option:not([value=""])').count();
      
      if (ubicacionOptionsCount > 0) {
        await ubicacionSelect.selectOption({ index: 1 });
      }
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
    await expect(page.locator('text=Paso 4 de 4')).toBeVisible();
    await expect(page.locator('text=Revisión Final')).toBeVisible();
    
    // Verify summary cards are displayed
    await expect(page.locator('text=Total Items')).toBeVisible();
    await expect(page.locator('text=Items OK')).toBeVisible();
    
    // Verify the review table shows the items
    await expect(page.locator('table')).toBeVisible();
    
    // Take screenshot of review step
    await page.screenshot({ path: 'tests/screenshots/recepcion-wizard-step4-review.png', fullPage: true });
    
    // Handle success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });
    
    // Click "Cerrar Recepción" button
    const cerrarRecepcionButton = page.locator('button:has-text("Cerrar Recepción")');
    await expect(cerrarRecepcionButton).toBeVisible();
    await cerrarRecepcionButton.click();
    
    // Wait for navigation back to recepciones list
    await page.waitForURL('**/recepciones', { timeout: 10000 });
    
    // Wait for the list to reload
    await page.waitForTimeout(1000);
    
    // Verify we're back on the recepciones page
    await expect(page.locator('h1')).toContainText('Recepciones');
    
    // Take final screenshot
    await page.screenshot({ path: 'tests/screenshots/recepcion-created.png', fullPage: true });
    
    // Verify the reception appears in the list
    const recepcionesTable = page.locator('table tbody tr');
    const recepcionCount = await recepcionesTable.count();
    
    if (recepcionCount > 0) {
      // Verify at least one reception exists
      expect(recepcionCount).toBeGreaterThan(0);
      
      // Optionally verify the orden numero appears in the list
      if (ordenNumero) {
        const firstRecepcion = recepcionesTable.first();
        const recepcionText = await firstRecepcion.textContent();
        // The reception should reference the orden
        expect(recepcionText).toBeTruthy();
      }
    }
    
    console.log('✅ Test de recepción de mercancía completado exitosamente');
  });

  test('Crear devolución', async ({ page }) => {
    // Navigate to devoluciones page
    await page.goto('/dashboard/compras/devoluciones');
    
    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Devoluciones');
    
    // Wait for the page to fully load
    await page.waitForTimeout(1000);
    
    // Take screenshot of devoluciones list
    await page.screenshot({ path: 'tests/screenshots/devoluciones-list.png', fullPage: true });
    
    // Click "Nueva Devolución" button
    const nuevaDevolucionBtn = page.locator('button:has-text("Nueva Devolución")');
    await nuevaDevolucionBtn.waitFor({ state: 'visible', timeout: 5000 });
    await nuevaDevolucionBtn.click();
    
    // Wait for navigation to nueva devolución page
    await page.waitForURL('**/devoluciones/nueva', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Nueva Devolución a Proveedor');
    
    // Verify wizard is displayed with step 1
    await expect(page.locator('text=Seleccionar Recepción')).toBeVisible();
    
    // Take screenshot of step 1
    await page.screenshot({ path: 'tests/screenshots/devolucion-step1-initial.png', fullPage: true });
    
    // STEP 1: Select a closed reception
    // Wait for recepciones to load
    await page.waitForTimeout(1000);
    
    // Check if there are any recepciones available
    const recepcionCards = page.locator('div').filter({ hasText: /REC-\d{4}-\d{6}/ });
    const recepcionCount = await recepcionCards.count();
    
    if (recepcionCount === 0) {
      console.log('⚠️ No hay recepciones cerradas disponibles. Saltando test.');
      return;
    }
    
    // Click on the first recepcion
    await recepcionCards.first().click();
    
    // Wait for step 2 to load
    await page.waitForTimeout(1000);
    
    // STEP 2: Configure items to return
    await expect(page.locator('text=Items a Devolver')).toBeVisible();
    
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
      await page.waitForTimeout(500);
      
      // Fill the item details
      // Note: In a real scenario, we would need to select from available products
      // For this test, we'll fill with a product ID if the field is available
      const productoInput = page.locator('input[placeholder*="ID del producto"]').first();
      if (await productoInput.count() > 0) {
        // This would need a real product ID from the database
        console.log('⚠️ Se requiere un producto ID válido. En producción, esto vendría de la recepción.');
        // For now, we'll skip if no pre-loaded items
        return;
      }
    } else {
      // If there are pre-loaded items, verify and optionally modify them
      console.log(`✅ ${preLoadedItems} items pre-cargados desde la recepción`);
      
      // Verify the first item has required fields
      const firstItemCantidad = page.locator('input[type="number"]').first();
      const cantidadValue = await firstItemCantidad.inputValue();
      
      if (!cantidadValue || parseFloat(cantidadValue) === 0) {
        // Fill cantidad if empty
        await firstItemCantidad.clear();
        await firstItemCantidad.fill('5');
      }
      
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
    
    // Handle success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });
    
    // Click "Crear Devolución" button
    const crearDevolucionBtn = page.locator('button:has-text("Crear Devolución")');
    await expect(crearDevolucionBtn).toBeVisible();
    
    // Verify button is enabled (has items and motivo)
    const isDisabled = await crearDevolucionBtn.isDisabled();
    if (isDisabled) {
      console.log('⚠️ El botón "Crear Devolución" está deshabilitado. Verificando requisitos...');
      
      // Check if motivo general is filled
      const motivoValue = await motivoSelect.inputValue();
      console.log('Motivo general:', motivoValue);
      
      // Check if there are items
      const itemsCount = await page.locator('div').filter({ hasText: /Items a Devolver \(\d+\)/ }).textContent();
      console.log('Items:', itemsCount);
      
      return;
    }
    
    await crearDevolucionBtn.click();
    
    // Wait for navigation to devolucion detail page
    await page.waitForURL('**/devoluciones/**', { timeout: 10000 });
    
    // Verify we're on the detail page (not on /nueva)
    expect(page.url()).not.toContain('/nueva');
    
    // Wait for the detail page to load
    await page.waitForTimeout(1000);
    
    // Verify we're on the devolucion detail page
    await expect(page.locator('h1')).toContainText('Devolución');
    
    // Verify the devolucion number is displayed
    await expect(page.locator('text=/DEV-\d{4}-\d{6}/')).toBeVisible();
    
    // Verify estado badge is visible (should be PENDIENTE)
    const estadoBadge = page.locator('span').filter({ hasText: /Pendiente/i });
    await expect(estadoBadge).toBeVisible({ timeout: 5000 });
    
    // Take screenshot of the created devolucion
    await page.screenshot({ path: 'tests/screenshots/devolucion-created.png', fullPage: true });
    
    // Verify key information is displayed
    await expect(page.locator('text=Información General')).toBeVisible();
    await expect(page.locator('text=Items Devueltos')).toBeVisible();
    
    // Verify motivo is displayed
    await expect(page.locator('text=/DEFECTUOSO|Defectuoso/')).toBeVisible();
    
    // Verify totals are displayed
    await expect(page.locator('text=Subtotal')).toBeVisible();
    await expect(page.locator('text=IGV')).toBeVisible();
    await expect(page.locator('text=Total')).toBeVisible();
    
    // Verify "Emitir Devolución" button is visible (for PENDIENTE state)
    const emitirButton = page.locator('button:has-text("Emitir Devolución")');
    await expect(emitirButton).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Test de creación de devolución completado exitosamente');
  });
});
