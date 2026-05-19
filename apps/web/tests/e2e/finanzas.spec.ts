import { test, expect } from '@playwright/test';
import { gotoAuthenticated, login } from './helpers/auth';

/**
 * E2E Tests for Finanzas Module
 * 
 * This test suite covers the critical user flows in the finance module,
 * focusing on CxP payments and mass payment processing.
 */

test.describe('Finanzas - Tesorería', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  test('Aplicar pago a CxP', async ({ page }) => {
    // Navigate to CxP page
    await gotoAuthenticated(page, '/dashboard/finanzas/cxp');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Cuentas por Pagar', { timeout: 30000 });
    
    // Look for a CxP in PENDIENTE or PARCIAL state
    const cxpRows = page.locator('table tbody tr');
    await expect(cxpRows.first(), 'Debe renderizarse al menos una CxP para validar el pago real').toBeVisible({ timeout: 30000 });
    const rowCount = await cxpRows.count();
    expect(rowCount, 'Debe existir al menos una CxP para validar el pago real').toBeGreaterThan(0);
    
    // Open the first CxP through the explicit row action.
    const firstRow = cxpRows.first();
    const verButton = firstRow.locator('a:has-text("Ver"), button:has-text("Ver")').first();
    await expect(verButton).toBeVisible({ timeout: 5000 });
    const listUrl = page.url();
    await verButton.click();
    
    // Wait for navigation to detail page
    await page.waitForURL((url) => url.href !== listUrl && /\/dashboard\/finanzas\/cxp\/[^/]+\/?$/.test(url.pathname), { timeout: 10000 });
    
    // Verify we're on the detail page
    await expect(page.locator('h1')).toContainText('Cuenta por Pagar');
    
    // Take screenshot of the CxP detail page
    await page.screenshot({ path: 'tests/screenshots/cxp-detail-before-payment.png', fullPage: true });
    
    // Look for the "Aplicar Pago" button
    const aplicarPagoButton = page.locator('button:has-text("Aplicar Pago")');
    
    // Verify the button is visible
    await expect(aplicarPagoButton).toBeVisible({ timeout: 5000 });
    
    // Click the "Aplicar Pago" button
    await aplicarPagoButton.click();
    
    // Wait for the payment modal to appear
    const pagoModal = page.getByRole('dialog', { name: 'Aplicar Pago a Cuenta por Pagar' });
    await expect(pagoModal).toBeVisible({ timeout: 5000 });
    
    // Take screenshot of the payment modal
    await page.screenshot({ path: 'tests/screenshots/cxp-payment-modal.png', fullPage: true });
    
    // Fill in payment details
    // Select payment method
    await pagoModal.locator('select').first().selectOption('TRANSFERENCIA');

    // Fill in payment amount (use a partial amount)
    const montoInput = pagoModal.getByPlaceholder('0.00');
    await montoInput.clear();
    await montoInput.fill('1.00');
    
    // Fill in reference
    const referenciaPago = `TEST-PAGO-E2E-${Date.now()}`;
    await pagoModal.getByPlaceholder('Ej: OP-2025-001234, Cheque #12345').fill(referenciaPago);
    
    // Fill in observations
    await pagoModal.getByPlaceholder('Observaciones adicionales sobre el pago...').fill('Pago de prueba E2E automatizado');
    
    // Take screenshot with payment details filled
    await page.screenshot({ path: 'tests/screenshots/cxp-payment-modal-filled.png', fullPage: true });
    
    // Click the modal submit button and assert the backend payment is accepted.
    const pagoResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/finanzas/cxp/') &&
        response.url().includes('/aplicar-pago') &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 30000 },
    );
    await pagoModal.getByRole('button', { name: 'Aplicar Pago' }).click();
    const pagoResponse = await pagoResponsePromise;
    const pagoPayload = await pagoResponse.json();
    expect(pagoPayload.success).toBe(true);
    
    // Verify the modal is closed
    await expect(pagoModal).not.toBeVisible();
    
    // Verify the payment was applied (check for updated saldo or payment history)
    const historialSection = page.getByRole('heading', { name: 'Historial de Pagos' });
    await expect(historialSection).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(referenciaPago)).toBeVisible({ timeout: 10000 });
    
    // Take screenshot of the updated CxP
    await page.screenshot({ path: 'tests/screenshots/cxp-after-payment.png', fullPage: true });
    
    console.log('✅ Test de aplicar pago a CxP completado exitosamente');
  });

  test('Pago masivo de proveedores', async ({ page }) => {
    // Navigate to tesorería page
    await gotoAuthenticated(page, '/dashboard/finanzas/tesoreria');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Tesorería');
    
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    
    // Take screenshot of tesorería dashboard
    await page.screenshot({ path: 'tests/screenshots/tesoreria-dashboard.png', fullPage: true });
    
    // Look for the "Pago Masivo" button or link
    const pagoMasivoButton = page.locator('a[href*="/tesoreria/lote"], button:has-text("Pago Masivo")');
    
    // Verify the button is visible
    await expect(pagoMasivoButton.first()).toBeVisible({ timeout: 30000 });
    
    // Click the "Pago Masivo" button
    await pagoMasivoButton.first().click();
    
    // Wait for navigation to pago lote page
    await page.waitForURL('**/tesoreria/lote**', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Pago Masivo', { timeout: 30000 });

    await expect(page.locator('text=Paso 1')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('No hay cuentas bancarias disponibles')).toHaveCount(0);
    await expect(page.getByText('No hay cuentas por pagar pendientes')).toHaveCount(0);
    
    // Take screenshot of pago lote page
    await page.screenshot({ path: 'tests/screenshots/pago-lote-initial.png', fullPage: true });
    
    // STEP 1: Select bank account
    
    const cuentaBancariaSelect = page.getByRole('combobox').first();
    await expect(cuentaBancariaSelect).toBeVisible({ timeout: 10000 });
    await cuentaBancariaSelect.click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(cuentaBancariaSelect, 'Debe quedar seleccionada una cuenta bancaria real').not.toContainText('Seleccione una cuenta');
    
    // Wait for account details to load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    
    // Verify account details are displayed
    await expect(page.locator('text=Saldo Disponible')).toBeVisible();
    
    // Set payment date (today)
    const fechaPagoInput = page.locator('input[type="date"]').first();
    const today = new Date().toISOString().split('T')[0];
    await fechaPagoInput.fill(today);
    
    // Fill in a unique batch reference so idempotency cannot hide a failed run.
    const referenciaLote = `LOTE-E2E-${Date.now()}`;
    const referenciaInput = page.locator('#referencia-lote, input[placeholder*="LOTE"]');
    await expect(referenciaInput.first(), 'El flujo de pago masivo debe permitir referencia única de lote').toBeVisible({ timeout: 10000 });
    await referenciaInput.first().fill(referenciaLote);
    
    // Take screenshot of step 1 completed
    await page.screenshot({ path: 'tests/screenshots/pago-lote-step1-filled.png', fullPage: true });
    
    // Click "Siguiente" to go to step 2
    const siguienteButton = page.locator('button:has-text("Siguiente")');
    await siguienteButton.click();
    
    // STEP 2: Select CxPs to pay
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await expect(page.locator('text=Paso 2')).toBeVisible();
    
    await expect(page.getByText('No hay cuentas por pagar que coincidan con los filtros')).toHaveCount(0);
    const firstCxpCheckbox = page.getByRole('checkbox').first();
    await expect(firstCxpCheckbox).toBeVisible({ timeout: 10000 });
    await firstCxpCheckbox.click();

    const firstMontoInput = page.locator('input[id^="monto-"]').first();
    await expect(firstMontoInput).toBeVisible({ timeout: 10000 });
    await firstMontoInput.fill('1');
    
    // Verify selection summary is updated
    await expect(page.locator('text=/1 seleccionadas/')).toBeVisible();
    
    // Verify total amount is calculated
    await expect(page.locator('text=/Monto Total/')).toBeVisible();
    
    // Take screenshot of step 2 with selections
    await page.screenshot({ path: 'tests/screenshots/pago-lote-step2-selected.png', fullPage: true });
    
    // Click "Siguiente" to go to step 3
    await siguienteButton.click();
    
    // STEP 3: Confirmation
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await expect(page.locator('text=Paso 3')).toBeVisible();
    
    // Verify confirmation details are displayed
    await expect(page.locator('text=Cuenta Bancaria')).toBeVisible();
    await expect(page.locator('text=Fecha de Pago')).toBeVisible();
    await expect(page.locator('text=Método de Pago')).toBeVisible();
    
    // Verify selected CxPs are listed
    await expect(page.locator('text=/\\d+.*pago/')).toBeVisible();
    
    // Verify total amount is displayed
    await expect(page.locator('text=/Total.*Lote/')).toBeVisible();
    
    // Verify balance validation
    await expect(page.locator('text=/Saldo (Actual|Después|Insuficiente)/').first()).toBeVisible();
    
    // Take screenshot of confirmation step
    await page.screenshot({ path: 'tests/screenshots/pago-lote-step3-confirmation.png', fullPage: true });
    
    // Handle success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });
    
    // Click "Procesar Lote" button and assert the backend transaction succeeds.
    const procesarLoteButton = page.locator('button:has-text("Procesar Lote"), button:has-text("Confirmar")');
    const loteResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/finanzas/tesoreria/lote') &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 30000 },
    );
    await procesarLoteButton.click();
    const loteResponse = await loteResponsePromise;
    expect(loteResponse.ok()).toBeTruthy();
    const lotePayload = await loteResponse.json();
    expect(lotePayload.success).toBe(true);
    expect(lotePayload.data?.lote_id).toBe(referenciaLote);
    expect(lotePayload.data?.pagos_exitosos).toBeGreaterThan(0);

    await expect(page.getByText('Lote Procesado Exitosamente')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(referenciaLote)).toBeVisible();
    
    // Take screenshot of result page
    await page.screenshot({ path: 'tests/screenshots/pago-lote-result.png', fullPage: true });
    
    // Verify batch details are displayed
    await expect(page.getByText('Referencia del Lote', { exact: true })).toBeVisible();
    await expect(page.getByText('Pagos Exitosos', { exact: true })).toBeVisible();
    await expect(page.getByText('Monto Total', { exact: true })).toBeVisible();
    await expect(page.getByText('Detalle de Pagos', { exact: true })).toBeVisible();
    
    // Verify action buttons are available
    const volverButton = page.locator('button:has-text("Volver"), a:has-text("Volver")');
    await expect(volverButton.first(), 'El resultado de lote debe permitir volver a Tesorería').toBeVisible({ timeout: 10000 });
    
    console.log('✅ Test de pago masivo de proveedores completado exitosamente');
  });

  test('Importar extracto y conciliar', async ({ page }) => {
    // Navigate to conciliación page
    await gotoAuthenticated(page, '/dashboard/finanzas/conciliacion');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Conciliación', { timeout: 10000 });
    
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    
    // Take screenshot of conciliación list
    await page.screenshot({ path: 'tests/screenshots/conciliacion-list.png', fullPage: true });
    
    // Look for existing conciliación or create new one
    const conciliacionRows = page.locator('table tbody tr');
    const rowCount = await conciliacionRows.count();
    
    let conciliacionId: string;
    
    if (rowCount === 0) {
      console.log('⚠️ No hay conciliaciones. Creando una nueva...');
      
      // Click "Nueva Conciliación" button
      const nuevaConciliacionButton = page.locator('button:has-text("Nueva Conciliación"), a:has-text("Nueva Conciliación")');
      
      await expect(nuevaConciliacionButton.first(), 'Debe existir acción para crear conciliación').toBeVisible();
      
      await nuevaConciliacionButton.first().click();
      
      // Wait for modal or form
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      
      const modal = page.locator('.modal-content');
      const cuentaBancariaSelect = modal.locator('select').first();
      const cuentaOptions = await cuentaBancariaSelect.locator('option:not([value=""])').count();
      expect(cuentaOptions, 'Debe existir al menos una cuenta bancaria para conciliar').toBeGreaterThan(0);
      await cuentaBancariaSelect.selectOption({ index: 1 });

      // Set date range (last month)
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      await modal.locator('input[type="text"]').fill(today.toISOString().slice(0, 7));

      const dateInputs = modal.locator('input[type="date"]');
      await dateInputs.nth(0).fill(firstDay.toISOString().split('T')[0]);
      await dateInputs.nth(1).fill(lastDay.toISOString().split('T')[0]);

      // Submit form
      const crearButton = page.locator('button:has-text("Crear")');
      const crearConciliacionResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/api/finanzas/conciliacion') &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: 30000 },
      );
      await crearButton.click();
      await crearConciliacionResponsePromise;

      // Wait for navigation
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

      const procesarButton = page.getByRole('button', { name: /Procesar|Ver/ }).first();
      await expect(procesarButton, 'Debe poder abrirse la conciliación creada').toBeVisible({ timeout: 15000 });
      await procesarButton.click();
      await page.waitForURL(/\/dashboard\/finanzas\/conciliacion\/[^/]+\/?$/, { timeout: 10000 });
    } else {
      // Click on first conciliación in ABIERTA state
      const firstRowAction = conciliacionRows.first().getByRole('button', { name: /Procesar|Ver/ }).first();
      await expect(firstRowAction, 'La primera conciliación debe tener acción para abrir el detalle').toBeVisible();
      await firstRowAction.click();
      
      // Wait for navigation to detail page
      await page.waitForURL(/\/dashboard\/finanzas\/conciliacion\/[^/]+\/?$/, { timeout: 10000 });
    }
    
    // Verify we're on the detail page
    await expect(page.locator('h1')).toContainText('Conciliación Bancaria', { timeout: 15000 });
    
    // Take screenshot of conciliación detail page
    await page.screenshot({ path: 'tests/screenshots/conciliacion-detail-initial.png', fullPage: true });
    
    // STEP 1: Import CSV
    const importarButton = page.locator('button:has-text("Importar Extracto CSV")');
    await expect(importarButton).toBeVisible({ timeout: 15000 });
    
    // Click import button
    await importarButton.click();
    
    // Wait for import modal to appear
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    await expect(page.getByRole('heading', { name: 'Importar Extracto Bancario' })).toBeVisible({ timeout: 5000 });
    
    // Take screenshot of import modal
    await page.screenshot({ path: 'tests/screenshots/conciliacion-import-modal.png', fullPage: true });
    
    // Create a sample CSV file content
    const todayCsv = new Date().toISOString().split('T')[0];
    const csvRunId = Date.now();
    const csvContent = `Fecha,Descripcion,Referencia,Tipo,Monto
${todayCsv},PAGO E2E CXP,EXT-E2E-CARGO-${csvRunId},CARGO,1.00
${todayCsv},TRANSFERENCIA RECIBIDA,EXT-E2E-ABONO-${csvRunId},ABONO,1500.00
${todayCsv},COMISION BANCARIA,EXT-E2E-COMISION-${csvRunId},CARGO,25.00`;
    
    // Look for file input
    const fileInput = page.locator('input[type="file"]');
    
    await expect(fileInput, 'El modal de importación debe exponer un input[type=file]').toHaveCount(1);

    {
      // Create a temporary CSV file
      const buffer = Buffer.from(csvContent);
      await fileInput.setInputFiles({
        name: 'extracto-test.csv',
        mimeType: 'text/csv',
        buffer: buffer,
      });
      
      // Wait for file to be processed
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      
      // Take screenshot with file uploaded
      await page.screenshot({ path: 'tests/screenshots/conciliacion-csv-uploaded.png', fullPage: true });
      
      // Look for preview table
      const previewTable = page.locator('table').last();
      await expect(previewTable, 'La importación CSV debe mostrar previsualización tabular antes de confirmar').toBeVisible({ timeout: 10000 });
      
      // Click "Importar" button
      const importarConfirmButton = page.locator('button:has-text("Importar"), button:has-text("Confirmar")').last();
      const importarResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/api/finanzas/conciliacion/') &&
          response.url().includes('/importar-csv') &&
          response.status() >= 200 &&
          response.status() < 300,
        { timeout: 30000 },
      );
      await importarConfirmButton.click();
      const importarResponse = await importarResponsePromise;
      const importarPayload = await importarResponse.json();
      expect(importarPayload.success).toBe(true);
      
      // Verify modal is closed
      await expect(page.getByRole('heading', { name: 'Importar Extracto Bancario' })).not.toBeVisible({ timeout: 5000 });
      
      console.log('✅ CSV importado exitosamente');
    }
    
    // Take screenshot after import
    await page.screenshot({ path: 'tests/screenshots/conciliacion-after-import.png', fullPage: true });
    
    // STEP 2: Match Automático
    const matchAutomaticoButton = page.locator('button:has-text("Match Automático")');
    await expect(matchAutomaticoButton, 'La conciliación debe exponer acción de match automático').toBeVisible({ timeout: 10000 });
    await expect(matchAutomaticoButton).toBeEnabled();
    await matchAutomaticoButton.click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await page.screenshot({ path: 'tests/screenshots/conciliacion-after-auto-match.png', fullPage: true });
    console.log('✅ Match automático ejecutado');
    
    // STEP 3: Verify dual reconciliation view
    await expect(page.getByRole('heading', { name: 'Movimientos Pendientes de Conciliar' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('MOVIMIENTOS DEL SISTEMA', { exact: true })).toBeVisible();
    await expect(page.getByText('MOVIMIENTOS DEL EXTRACTO', { exact: true })).toBeVisible();
    
    // Take screenshot of dual table
    await page.screenshot({ path: 'tests/screenshots/conciliacion-dual-table.png', fullPage: true });
    
    // STEP 4: Match Manual (if needed)
    const matchManualButton = page.locator('button:has-text("Match Manual")');
    await expect(matchManualButton, 'La conciliación debe exponer acción de match manual').toBeVisible({ timeout: 10000 });
    await expect(matchManualButton).toBeEnabled();
    await matchManualButton.click();
    
    // Wait for match manual modal
    const matchHeading = page.getByRole('heading', { name: 'Match Manual de Movimientos' });
    await expect(matchHeading).toBeVisible({ timeout: 10000 });
        
    // Take screenshot of match manual modal
    await page.screenshot({ path: 'tests/screenshots/conciliacion-match-manual-modal.png', fullPage: true });
        
    const matchDialog = page.getByRole('dialog', { name: 'Match Manual de Movimientos' });
    const sistemaItems = matchDialog.getByTestId('match-sistema-item');
    const extractoItems = matchDialog.getByTestId('match-extracto-item');
    await expect(sistemaItems.first(), 'El match manual debe cargar movimientos de sistema pendientes').toBeVisible({ timeout: 15000 });
    await expect(extractoItems.first(), 'El match manual debe cargar movimientos de extracto pendientes').toBeVisible({ timeout: 15000 });

    const sistemaCargo = sistemaItems.filter({ hasText: 'CARGO' }).first();
    const extractoCargo = extractoItems.filter({ hasText: 'CARGO' }).first();
    const sistemaAbono = sistemaItems.filter({ hasText: 'ABONO' }).first();
    const extractoAbono = extractoItems.filter({ hasText: 'ABONO' }).first();

    if ((await sistemaCargo.count()) > 0 && (await extractoCargo.count()) > 0) {
      await sistemaCargo.click();
      await extractoCargo.click();
    } else if ((await sistemaAbono.count()) > 0 && (await extractoAbono.count()) > 0) {
      await sistemaAbono.click();
      await extractoAbono.click();
    } else {
      throw new Error('Debe existir al menos un par de movimientos del mismo tipo para validar match manual');
    }

    await expect(matchDialog.getByText('Resumen del Match')).toBeVisible({ timeout: 5000 });

    const confirmarMatchButton = matchDialog.getByRole('button', { name: 'Realizar Match' });
    await expect(confirmarMatchButton, 'El match manual debe habilitar confirmación tras seleccionar pares válidos').toBeEnabled({ timeout: 5000 });
    const matchResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/finanzas/conciliacion/') &&
        response.url().includes('/marcar-item') &&
        response.status() >= 200 &&
        response.status() < 300,
      { timeout: 30000 },
    );
    await confirmarMatchButton.click();
    await matchResponsePromise;
    console.log('✅ Match manual realizado');
        
    // Close modal if it remains open after a non-closing match path.
    if (await matchDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      await matchDialog.getByRole('button', { name: /Cancelar|Cerrar/ }).click();
    }
    
    // STEP 5: Review differences
    const cerrarConciliacionButton = page.locator('button:has-text("Cerrar Conciliación")');
    await expect(cerrarConciliacionButton, 'La conciliación debe exponer revisión/cierre').toBeVisible({ timeout: 10000 });
    await expect(cerrarConciliacionButton).toBeEnabled();
    await cerrarConciliacionButton.click();
      
      // Wait for close confirmation modal
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      await expect(page.locator('text=Confirmar Cierre')).toBeVisible({ timeout: 5000 });
      
      // Take screenshot of close confirmation
      await page.screenshot({ path: 'tests/screenshots/conciliacion-close-confirmation.png', fullPage: true });
      
      // Verify summary information is displayed
      await expect(page.getByText('Resumen de Conciliación', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Saldo Libro' }).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Saldo Banco' }).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Diferencia' }).first()).toBeVisible();
      
      // Verify movimientos statistics
      await expect(page.getByRole('heading', { name: 'Movimientos del Sistema' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Movimientos del Extracto' })).toBeVisible();
      
      // Check if there are pending items
      const pendingWarning = page.getByRole('heading', { name: /Advertencia: Movimientos Pendientes/ });
      const hasPendingItems = await pendingWarning.count() > 0;
      
      if (hasPendingItems) {
        console.log('⚠️ Hay movimientos pendientes. No se puede cerrar sin forzar.');
        
        // Verify warning is displayed
        await expect(pendingWarning).toBeVisible();
        
        // Look for "Forzar Cierre" button
        const forzarCierreButton = page.locator('button:has-text("Forzar Cierre")');
        
        await expect(forzarCierreButton, 'Si hay pendientes, debe existir opción explícita de forzar cierre').toBeVisible({ timeout: 5000 });
        console.log('✅ Opción de forzar cierre disponible');
      } else {
        console.log('✅ Todos los movimientos conciliados. Listo para cerrar.');
        
        // Verify success message
        await expect(page.locator('text=Listo para Cerrar')).toBeVisible();
        
        // Click "Cerrar Conciliación" button
        const confirmarCierreButton = page.locator('button:has-text("Cerrar Conciliación")').last();
        
        await expect(confirmarCierreButton, 'Sin pendientes, debe poder confirmarse el cierre').toBeEnabled({ timeout: 5000 });

        page.on('dialog', async dialog => {
          expect(dialog.message()).toContain('exitosamente');
          await dialog.accept();
        });
        
        await confirmarCierreButton.click();
        await expect(page.locator('text=CERRADA')).toBeVisible({ timeout: 15000 });
        console.log('✅ Conciliación cerrada exitosamente');
      }
      
      // Take screenshot of final state
      await page.screenshot({ path: 'tests/screenshots/conciliacion-final-state.png', fullPage: true });
    console.log('✅ Test de importar extracto y conciliar completado exitosamente');
  });
});
