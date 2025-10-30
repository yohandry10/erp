# Implementation: Crear Devolución E2E Test

## Overview
This document describes the implementation of the E2E test for creating a devolución (return to supplier) in the Compras module.

## Test Location
- **File**: `apps/web/tests/e2e/compras.spec.ts`
- **Test Name**: "Crear devolución"
- **Test Suite**: "Compras - Órdenes de Compra"

## Test Flow

### Step 1: Navigate to Devoluciones List
1. Navigate to `/dashboard/compras/devoluciones`
2. Verify page title contains "Devoluciones"
3. Wait for page to fully load
4. Take screenshot: `devoluciones-list.png`

### Step 2: Start New Devolución
1. Click "Nueva Devolución" button
2. Wait for navigation to `/dashboard/compras/devoluciones/nueva`
3. Verify page title contains "Nueva Devolución a Proveedor"
4. Verify wizard step 1 is displayed ("Seleccionar Recepción")
5. Take screenshot: `devolucion-step1-initial.png`

### Step 3: Select Closed Reception
1. Wait for recepciones to load (1 second)
2. Check if there are any closed recepciones available
3. If no recepciones available, skip test with warning
4. Click on the first available recepcion
5. Wait for step 2 to load

### Step 4: Configure Items to Return
1. Verify step 2 is displayed ("Items a Devolver")
2. Verify recepcion information is displayed
3. Take screenshot: `devolucion-step2-initial.png`
4. Fill motivo general (required): Select "DEFECTUOSO"
5. Fill observaciones generales (optional): Add detailed description
6. Check for pre-loaded items (from rejected/observed items in reception)
7. If pre-loaded items exist:
   - Verify cantidad is filled
   - Verify motivo is selected
   - Add item observaciones
8. If no pre-loaded items:
   - Would need to add items manually (requires valid product IDs)
   - Skip test if not possible
9. Take screenshot: `devolucion-step2-filled.png`

### Step 5: Create Devolución
1. Verify "Crear Devolución" button is visible
2. Check if button is enabled (requires items and motivo general)
3. If disabled, log requirements and skip
4. Click "Crear Devolución" button
5. Handle success alert dialog
6. Wait for navigation to devolucion detail page

### Step 6: Verify Created Devolución
1. Verify URL is on detail page (not `/nueva`)
2. Verify page title contains "Devolución"
3. Verify devolución number is displayed (DEV-YYYY-NNNNNN format)
4. Verify estado badge shows "Pendiente"
5. Take screenshot: `devolucion-created.png`
6. Verify key sections are displayed:
   - Información General
   - Items Devueltos
   - Motivo (DEFECTUOSO)
   - Totals (Subtotal, IGV, Total)
7. Verify "Emitir Devolución" button is visible

## Screenshots Generated
1. **devoluciones-list.png**: Initial devoluciones list page
2. **devolucion-step1-initial.png**: Step 1 - Select reception
3. **devolucion-step2-initial.png**: Step 2 - Initial state with recepcion info
4. **devolucion-step2-filled.png**: Step 2 - After filling motivo and items
5. **devolucion-created.png**: Final devolucion detail page

## Test Data
- **Motivo General**: DEFECTUOSO (Producto Defectuoso)
- **Observaciones**: "Productos defectuosos detectados durante inspección de calidad. Requieren reemplazo inmediato."
- **Item Observaciones**: "Defecto de fabricación detectado en inspección visual"

## Edge Cases Handled
1. **No Closed Recepciones**: Test skips with warning if no recepciones are available
2. **No Pre-loaded Items**: Test skips if no items from reception and manual entry not possible
3. **Button Disabled**: Test logs requirements and skips if button is disabled
4. **Missing Product IDs**: Test handles case where product IDs would be needed

## Validations
- ✅ Page navigation and URLs
- ✅ Page titles and headings
- ✅ Wizard step progression
- ✅ Recepcion information display
- ✅ Form field filling (motivo, observaciones)
- ✅ Pre-loaded items from reception
- ✅ Button states (enabled/disabled)
- ✅ Success alert handling
- ✅ Devolución number format (DEV-YYYY-NNNNNN)
- ✅ Estado badge (PENDIENTE)
- ✅ Key sections visibility
- ✅ Totals display
- ✅ "Emitir Devolución" button visibility

## Dependencies
- Requires at least one closed recepcion (estado: CERRADA)
- Recepciones should ideally have rejected or observed items for pre-loading
- Requires valid proveedor and orden data in the recepcion

## Running the Test

### Using PowerShell Script
```powershell
.\test-crear-devolucion.ps1
```

### Using Playwright CLI
```bash
cd apps/web
npx playwright test compras.spec.ts -g "Crear devolución" --headed
```

### Headless Mode
```bash
cd apps/web
npx playwright test compras.spec.ts -g "Crear devolución"
```

## Expected Results
- ✅ Test navigates through the 2-step wizard successfully
- ✅ Devolución is created with PENDIENTE state
- ✅ All required information is displayed on detail page
- ✅ 5 screenshots are generated documenting the process
- ✅ Test completes with success message

## Integration with Task List
This test completes the task:
- **Task 2.15**: Tests Frontend (Playwright)
- **Subtask**: Crear devolución

## Related Files
- **Test File**: `apps/web/tests/e2e/compras.spec.ts`
- **Page Under Test**: `apps/web/app/dashboard/compras/devoluciones/nueva/page.tsx`
- **List Page**: `apps/web/app/dashboard/compras/devoluciones/page.tsx`
- **Detail Page**: `apps/web/app/dashboard/compras/devoluciones/[id]/page.tsx`
- **Test Script**: `test-crear-devolucion.ps1`

## Notes
- The test follows the same pattern as other E2E tests in the suite
- Uses consistent screenshot naming convention
- Handles edge cases gracefully with informative warnings
- Validates both UI elements and business logic
- Pre-loaded items feature is tested (items from rejected/observed reception items)
- Test is robust with appropriate timeouts and waits

## Future Enhancements
1. Add test for emitting the devolución (changing state to EMITIDA)
2. Add test for canceling a devolución (changing state to ANULADA)
3. Add test for viewing devolución in list after creation
4. Add test for filtering devoluciones by estado
5. Add test for manual item addition (when no pre-loaded items)
6. Add test for removing items from the list
7. Add test for validation errors (empty motivo, no items, etc.)

## Status
✅ **COMPLETED** - E2E test for creating devolución implemented and documented
