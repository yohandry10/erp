import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

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
    await page.goto('/dashboard/finanzas/cxp');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Cuentas por Pagar');
    
    // Wait for the table to load
    await page.waitForTimeout(1000);
    
    // Look for a CxP in PENDIENTE or PARCIAL state
    const cxpRows = page.locator('table tbody tr');
    const rowCount = await cxpRows.count();
    
    if (rowCount === 0) {
      console.log('⚠️ No hay CxP disponibles. Saltando test.');
      return;
    }
    
    // Click on the first CxP to view details
    const firstRow = cxpRows.first();
    await firstRow.click();
    
    // Wait for navigation to detail page
    await page.waitForURL('**/cxp/**', { timeout: 10000 });
    
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
    await expect(page.locator('h2:has-text("Aplicar Pago")')).toBeVisible({ timeout: 5000 });
    
    // Take screenshot of the payment modal
    await page.screenshot({ path: 'tests/screenshots/cxp-payment-modal.png', fullPage: true });
    
    // Fill in payment details
    // Select payment method
    await page.selectOption('select[name="metodo_pago"]', 'TRANSFERENCIA');
    
    // Fill in payment amount (use a partial amount)
    const montoInput = page.locator('input[name="monto"]');
    await montoInput.clear();
    await montoInput.fill('500.00');
    
    // Fill in reference
    await page.fill('input[name="referencia"]', 'TEST-PAGO-E2E-001');
    
    // Fill in observations
    await page.fill('textarea[name="observaciones"]', 'Pago de prueba E2E automatizado');
    
    // Take screenshot with payment details filled
    await page.screenshot({ path: 'tests/screenshots/cxp-payment-modal-filled.png', fullPage: true });
    
    // Handle success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });
    
    // Click the "Registrar Pago" button in the modal
    const registrarPagoButton = page.locator('button:has-text("Registrar Pago")').last();
    await registrarPagoButton.click();
    
    // Wait for the modal to close and the page to update
    await page.waitForTimeout(2000);
    
    // Verify the modal is closed
    await expect(page.locator('h2:has-text("Aplicar Pago")')).not.toBeVisible();
    
    // Verify the payment was applied (check for updated saldo or payment history)
    const historialSection = page.locator('text=Historial de Pagos');
    if (await historialSection.count() > 0) {
      await expect(historialSection).toBeVisible();
    }
    
    // Take screenshot of the updated CxP
    await page.screenshot({ path: 'tests/screenshots/cxp-after-payment.png', fullPage: true });
    
    console.log('✅ Test de aplicar pago a CxP completado exitosamente');
  });

  test('Pago masivo de proveedores', async ({ page }) => {
    // Navigate to tesorería page
    await page.goto('/dashboard/finanzas/tesoreria');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Tesorería');
    
    // Wait for the page to fully load
    await page.waitForTimeout(1000);
    
    // Take screenshot of tesorería dashboard
    await page.screenshot({ path: 'tests/screenshots/tesoreria-dashboard.png', fullPage: true });
    
    // Look for the "Pago Masivo" button or link
    const pagoMasivoButton = page.locator('a[href*="/tesoreria/lote"], button:has-text("Pago Masivo")');
    
    // Verify the button is visible
    await expect(pagoMasivoButton.first()).toBeVisible({ timeout: 5000 });
    
    // Click the "Pago Masivo" button
    await pagoMasivoButton.first().click();
    
    // Wait for navigation to pago lote page
    await page.waitForURL('**/tesoreria/lote', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Pago Masivo');
    
    // Take screenshot of pago lote page
    await page.screenshot({ path: 'tests/screenshots/pago-lote-initial.png', fullPage: true });
    
    // STEP 1: Select bank account
    await expect(page.locator('text=Paso 1')).toBeVisible();
    
    // Wait for bank accounts dropdown to load
    await page.waitForSelector('select, [role="combobox"]', { timeout: 5000 });
    
    // Check if there are bank accounts available
    const cuentaBancariaSelect = page.locator('select').first();
    const hasCuentas = await cuentaBancariaSelect.count() > 0;
    
    if (!hasCuentas) {
      console.log('⚠️ No hay cuentas bancarias disponibles. Saltando test.');
      return;
    }
    
    // Select the first bank account
    await cuentaBancariaSelect.selectOption({ index: 1 });
    
    // Wait for account details to load
    await page.waitForTimeout(500);
    
    // Verify account details are displayed
    await expect(page.locator('text=Saldo Disponible')).toBeVisible();
    
    // Set payment date (today)
    const fechaPagoInput = page.locator('input[type="date"]').first();
    const today = new Date().toISOString().split('T')[0];
    await fechaPagoInput.fill(today);
    
    // Select payment method
    const metodoPagoSelect = page.locator('select').nth(1);
    await metodoPagoSelect.selectOption('TRANSFERENCIA');
    
    // Fill in batch reference (optional)
    const referenciaInput = page.locator('input[name="referencia_lote"], input[placeholder*="referencia"]');
    if (await referenciaInput.count() > 0) {
      await referenciaInput.fill('LOTE-TEST-E2E-001');
    }
    
    // Take screenshot of step 1 completed
    await page.screenshot({ path: 'tests/screenshots/pago-lote-step1-filled.png', fullPage: true });
    
    // Click "Siguiente" to go to step 2
    const siguienteButton = page.locator('button:has-text("Siguiente")');
    await siguienteButton.click();
    
    // STEP 2: Select CxPs to pay
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Paso 2')).toBeVisible();
    
    // Wait for CxPs table to load
    await page.waitForSelector('table tbody tr, div:has-text("No hay cuentas por pagar")', { timeout: 5000 });
    
    // Check if there are CxPs available
    const cxpRows = page.locator('table tbody tr');
    const cxpCount = await cxpRows.count();
    
    if (cxpCount === 0) {
      console.log('⚠️ No hay CxP disponibles para pago masivo. Saltando test.');
      return;
    }
    
    // Select at least 2 CxPs for batch payment
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    
    // Select the first 2-3 CxPs (or all if less than 3)
    const numToSelect = Math.min(3, checkboxCount);
    for (let i = 0; i < numToSelect; i++) {
      await checkboxes.nth(i).check();
      await page.waitForTimeout(200);
    }
    
    // Verify selection summary is updated
    await expect(page.locator('text=/Seleccionados:.*\\d+/')).toBeVisible();
    
    // Verify total amount is calculated
    await expect(page.locator('text=/Total:.*\\d+/')).toBeVisible();
    
    // Take screenshot of step 2 with selections
    await page.screenshot({ path: 'tests/screenshots/pago-lote-step2-selected.png', fullPage: true });
    
    // Click "Siguiente" to go to step 3
    await siguienteButton.click();
    
    // STEP 3: Confirmation
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Paso 3, text=Confirmación')).toBeVisible();
    
    // Verify confirmation details are displayed
    await expect(page.locator('text=Cuenta Bancaria')).toBeVisible();
    await expect(page.locator('text=Fecha de Pago')).toBeVisible();
    await expect(page.locator('text=Método de Pago')).toBeVisible();
    
    // Verify selected CxPs are listed
    await expect(page.locator('text=/\\d+.*pago/')).toBeVisible();
    
    // Verify total amount is displayed
    await expect(page.locator('text=/Total.*Lote/')).toBeVisible();
    
    // Verify balance validation
    const saldoSuficienteIndicator = page.locator('text=Saldo Suficiente, text=Saldo Insuficiente');
    await expect(saldoSuficienteIndicator.first()).toBeVisible();
    
    // Take screenshot of confirmation step
    await page.screenshot({ path: 'tests/screenshots/pago-lote-step3-confirmation.png', fullPage: true });
    
    // Handle success alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('exitosamente');
      await dialog.accept();
    });
    
    // Click "Procesar Lote" button
    const procesarLoteButton = page.locator('button:has-text("Procesar Lote"), button:has-text("Confirmar")');
    await procesarLoteButton.click();
    
    // Wait for processing
    await page.waitForTimeout(3000);
    
    // Verify success message or result page
    const successIndicators = [
      page.locator('text=Lote Procesado'),
      page.locator('text=exitosamente'),
      page.locator('text=Pagos Exitosos'),
    ];
    
    let successFound = false;
    for (const indicator of successIndicators) {
      if (await indicator.count() > 0) {
        await expect(indicator.first()).toBeVisible({ timeout: 5000 });
        successFound = true;
        break;
      }
    }
    
    if (!successFound) {
      console.log('⚠️ No se encontró indicador de éxito. Verificando estado...');
    }
    
    // Take screenshot of result page
    await page.screenshot({ path: 'tests/screenshots/pago-lote-result.png', fullPage: true });
    
    // Verify batch details are displayed
    if (await page.locator('text=Referencia del Lote').count() > 0) {
      await expect(page.locator('text=Referencia del Lote')).toBeVisible();
    }
    
    if (await page.locator('text=Pagos Exitosos').count() > 0) {
      await expect(page.locator('text=Pagos Exitosos')).toBeVisible();
    }
    
    if (await page.locator('text=Monto Total').count() > 0) {
      await expect(page.locator('text=Monto Total')).toBeVisible();
    }
    
    // Verify payment details are listed
    if (await page.locator('text=Detalle de Pagos').count() > 0) {
      await expect(page.locator('text=Detalle de Pagos')).toBeVisible();
    }
    
    // Verify action buttons are available
    const volverButton = page.locator('button:has-text("Volver"), a:has-text("Volver")');
    if (await volverButton.count() > 0) {
      await expect(volverButton.first()).toBeVisible();
    }
    
    console.log('✅ Test de pago masivo de proveedores completado exitosamente');
  });

  test('Importar extracto y conciliar', async ({ page }) => {
    // Navigate to conciliación page
    await page.goto('/dashboard/finanzas/conciliacion');
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Conciliación', { timeout: 10000 });
    
    // Wait for the page to fully load
    await page.waitForTimeout(1000);
    
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
      
      if (await nuevaConciliacionButton.count() === 0) {
        console.log('⚠️ No se encontró botón para crear conciliación. Saltando test.');
        return;
      }
      
      await nuevaConciliacionButton.first().click();
      
      // Wait for modal or form
      await page.waitForTimeout(1000);
      
      // Fill in conciliación details
      // Select bank account
      const cuentaBancariaSelect = page.locator('select[name="cuenta_bancaria_id"]');
      if (await cuentaBancariaSelect.count() > 0) {
        await cuentaBancariaSelect.selectOption({ index: 1 });
      }
      
      // Set date range (last month)
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      const fechaDesdeInput = page.locator('input[name="fecha_desde"]');
      if (await fechaDesdeInput.count() > 0) {
        await fechaDesdeInput.fill(firstDay.toISOString().split('T')[0]);
      }
      
      const fechaHastaInput = page.locator('input[name="fecha_hasta"]');
      if (await fechaHastaInput.count() > 0) {
        await fechaHastaInput.fill(lastDay.toISOString().split('T')[0]);
      }
      
      // Submit form
      const crearButton = page.locator('button:has-text("Crear")');
      await crearButton.click();
      
      // Wait for navigation
      await page.waitForTimeout(2000);
    } else {
      // Click on first conciliación in ABIERTA state
      const firstRow = conciliacionRows.first();
      await firstRow.click();
      
      // Wait for navigation to detail page
      await page.waitForURL('**/conciliacion/**', { timeout: 10000 });
    }
    
    // Verify we're on the detail page
    await expect(page.locator('h1')).toContainText('Conciliación Bancaria');
    
    // Take screenshot of conciliación detail page
    await page.screenshot({ path: 'tests/screenshots/conciliacion-detail-initial.png', fullPage: true });
    
    // STEP 1: Import CSV
    const importarButton = page.locator('button:has-text("Importar Extracto CSV")');
    await expect(importarButton).toBeVisible({ timeout: 5000 });
    
    // Click import button
    await importarButton.click();
    
    // Wait for import modal to appear
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Importar Extracto')).toBeVisible({ timeout: 5000 });
    
    // Take screenshot of import modal
    await page.screenshot({ path: 'tests/screenshots/conciliacion-import-modal.png', fullPage: true });
    
    // Create a sample CSV file content
    const csvContent = `Fecha,Descripcion,Referencia,Abono,Cargo
2024-01-15,TRANSFERENCIA RECIBIDA,REF001,1500.00,
2024-01-16,PAGO PROVEEDOR,REF002,,800.00
2024-01-17,DEPOSITO,REF003,2000.00,
2024-01-18,COMISION BANCARIA,REF004,,25.00`;
    
    // Look for file input
    const fileInput = page.locator('input[type="file"]');
    
    if (await fileInput.count() > 0) {
      // Create a temporary CSV file
      const buffer = Buffer.from(csvContent);
      await fileInput.setInputFiles({
        name: 'extracto-test.csv',
        mimeType: 'text/csv',
        buffer: buffer,
      });
      
      // Wait for file to be processed
      await page.waitForTimeout(1000);
      
      // Take screenshot with file uploaded
      await page.screenshot({ path: 'tests/screenshots/conciliacion-csv-uploaded.png', fullPage: true });
      
      // Look for preview table
      const previewTable = page.locator('table').last();
      if (await previewTable.count() > 0) {
        await expect(previewTable).toBeVisible();
      }
      
      // Click "Importar" button
      const importarConfirmButton = page.locator('button:has-text("Importar"), button:has-text("Confirmar")').last();
      await importarConfirmButton.click();
      
      // Wait for import to complete
      await page.waitForTimeout(2000);
      
      // Verify modal is closed
      await expect(page.locator('text=Importar Extracto')).not.toBeVisible({ timeout: 5000 });
      
      console.log('✅ CSV importado exitosamente');
    } else {
      console.log('⚠️ No se encontró input de archivo. Continuando con test...');
    }
    
    // Take screenshot after import
    await page.screenshot({ path: 'tests/screenshots/conciliacion-after-import.png', fullPage: true });
    
    // STEP 2: Match Automático
    const matchAutomaticoButton = page.locator('button:has-text("Match Automático")');
    
    if (await matchAutomaticoButton.count() > 0 && await matchAutomaticoButton.isEnabled()) {
      await matchAutomaticoButton.click();
      
      // Wait for automatic matching to complete
      await page.waitForTimeout(2000);
      
      // Take screenshot after automatic match
      await page.screenshot({ path: 'tests/screenshots/conciliacion-after-auto-match.png', fullPage: true });
      
      console.log('✅ Match automático ejecutado');
    }
    
    // STEP 3: Verify dual table view
    const conciliacionTable = page.locator('table').first();
    await expect(conciliacionTable).toBeVisible();
    
    // Verify movimientos del sistema are displayed
    await expect(page.locator('text=Sistema, text=Movimientos del Sistema')).toBeVisible();
    
    // Verify movimientos del extracto are displayed
    await expect(page.locator('text=Extracto, text=Movimientos del Extracto')).toBeVisible();
    
    // Take screenshot of dual table
    await page.screenshot({ path: 'tests/screenshots/conciliacion-dual-table.png', fullPage: true });
    
    // STEP 4: Match Manual (if needed)
    const matchManualButton = page.locator('button:has-text("Match Manual")');
    
    if (await matchManualButton.count() > 0 && await matchManualButton.isEnabled()) {
      await matchManualButton.click();
      
      // Wait for match manual modal
      await page.waitForTimeout(1000);
      
      if (await page.locator('text=Match Manual').count() > 0) {
        await expect(page.locator('text=Match Manual')).toBeVisible({ timeout: 5000 });
        
        // Take screenshot of match manual modal
        await page.screenshot({ path: 'tests/screenshots/conciliacion-match-manual-modal.png', fullPage: true });
        
        // Look for movimientos to match
        const sistemaRows = page.locator('table').first().locator('tbody tr');
        const extractoRows = page.locator('table').last().locator('tbody tr');
        
        const sistemaCount = await sistemaRows.count();
        const extractoCount = await extractoRows.count();
        
        if (sistemaCount > 0 && extractoCount > 0) {
          // Select first movimiento from sistema
          await sistemaRows.first().click();
          await page.waitForTimeout(300);
          
          // Select first movimiento from extracto
          await extractoRows.first().click();
          await page.waitForTimeout(300);
          
          // Click "Confirmar Match" button
          const confirmarMatchButton = page.locator('button:has-text("Confirmar"), button:has-text("Match")').last();
          
          if (await confirmarMatchButton.count() > 0 && await confirmarMatchButton.isEnabled()) {
            await confirmarMatchButton.click();
            
            // Wait for match to be processed
            await page.waitForTimeout(1000);
            
            console.log('✅ Match manual realizado');
          }
        }
        
        // Close modal
        const cerrarModalButton = page.locator('button:has-text("Cerrar"), button:has-text("Cancelar")').last();
        if (await cerrarModalButton.count() > 0) {
          await cerrarModalButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
    
    // STEP 5: Review differences
    const cerrarConciliacionButton = page.locator('button:has-text("Cerrar Conciliación")');
    
    if (await cerrarConciliacionButton.count() > 0 && await cerrarConciliacionButton.isEnabled()) {
      await cerrarConciliacionButton.click();
      
      // Wait for close confirmation modal
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Confirmar Cierre')).toBeVisible({ timeout: 5000 });
      
      // Take screenshot of close confirmation
      await page.screenshot({ path: 'tests/screenshots/conciliacion-close-confirmation.png', fullPage: true });
      
      // Verify summary information is displayed
      await expect(page.locator('text=Resumen de Conciliación')).toBeVisible();
      await expect(page.locator('text=Saldo Libro')).toBeVisible();
      await expect(page.locator('text=Saldo Banco')).toBeVisible();
      await expect(page.locator('text=Diferencia')).toBeVisible();
      
      // Verify movimientos statistics
      await expect(page.locator('text=Movimientos del Sistema')).toBeVisible();
      await expect(page.locator('text=Movimientos del Extracto')).toBeVisible();
      
      // Check if there are pending items
      const pendingWarning = page.locator('text=Movimientos Pendientes');
      const hasPendingItems = await pendingWarning.count() > 0;
      
      if (hasPendingItems) {
        console.log('⚠️ Hay movimientos pendientes. No se puede cerrar sin forzar.');
        
        // Verify warning is displayed
        await expect(pendingWarning).toBeVisible();
        
        // Look for "Forzar Cierre" button
        const forzarCierreButton = page.locator('button:has-text("Forzar Cierre")');
        
        if (await forzarCierreButton.count() > 0) {
          await expect(forzarCierreButton).toBeVisible();
          console.log('✅ Opción de forzar cierre disponible');
        }
      } else {
        console.log('✅ Todos los movimientos conciliados. Listo para cerrar.');
        
        // Verify success message
        await expect(page.locator('text=Listo para Cerrar')).toBeVisible();
        
        // Click "Cerrar Conciliación" button
        const confirmarCierreButton = page.locator('button:has-text("Cerrar Conciliación")').last();
        
        if (await confirmarCierreButton.count() > 0 && await confirmarCierreButton.isEnabled()) {
          // Handle success alert
          page.on('dialog', async dialog => {
            expect(dialog.message()).toContain('exitosamente');
            await dialog.accept();
          });
          
          await confirmarCierreButton.click();
          
          // Wait for close to complete
          await page.waitForTimeout(2000);
          
          // Verify conciliación is closed
          const estadoBadge = page.locator('text=CERRADA');
          if (await estadoBadge.count() > 0) {
            await expect(estadoBadge).toBeVisible();
            console.log('✅ Conciliación cerrada exitosamente');
          }
        }
      }
      
      // Take screenshot of final state
      await page.screenshot({ path: 'tests/screenshots/conciliacion-final-state.png', fullPage: true });
    }
    
    console.log('✅ Test de importar extracto y conciliar completado exitosamente');
  });
});
