# Implementation: E2E Test - Crear Proveedor desde UI

**Task:** TASK 2.15 - Tests Frontend (Playwright) - Crear proveedor desde UI  
**Status:** ✅ COMPLETED  
**Date:** 2025-01-XX

## Overview

Implemented comprehensive end-to-end tests for the Compras module using Playwright, with primary focus on the supplier (proveedor) creation flow from the UI.

## Changes Made

### 1. Playwright Setup

**File:** `apps/web/playwright.config.ts`
- Configured Playwright test runner
- Set base URL to `http://localhost:3001`
- Configured automatic dev server startup
- Set up screenshot and trace capture on failure
- Configured for CI/CD with retries

**File:** `apps/web/package.json`
- Added `@playwright/test` as dev dependency
- Added test scripts:
  - `test:e2e` - Run all tests headless
  - `test:e2e:ui` - Run with Playwright UI
  - `test:e2e:headed` - Run with visible browser
  - `test:e2e:debug` - Debug mode
  - `playwright:install` - Install browsers

### 2. Test Implementation

**File:** `apps/web/tests/e2e/compras.spec.ts`

Implemented 8 comprehensive test scenarios:

#### ✅ Test 1: Crear proveedor desde UI (Main Test)
- Navigates to proveedores page
- Clicks "Nuevo Proveedor" button
- Fills complete form with test data:
  - RUC: 20123456789
  - Razón Social: DISTRIBUIDORA TEST E2E S.A.C.
  - Email: test-e2e@distribuidora.com
  - Contact info, address, payment terms
  - Credit limit: 50,000 PEN
- Submits form
- Verifies success alert
- Confirms proveedor appears in list
- Takes screenshots at key points

#### ✅ Test 2: Validar campos requeridos
- Attempts to submit empty form
- Verifies validation errors for:
  - RUC required
  - Razón social required (min 3 chars)
  - Email required

#### ✅ Test 3: Validar formato de RUC
- Tests invalid RUC (too short)
- Verifies error message about 11 or 9 digits

#### ✅ Test 4: Validar formato de email
- Tests invalid email format
- Verifies email validation error

#### ✅ Test 5: Cancelar creación de proveedor
- Fills partial form data
- Clicks cancel button
- Confirms cancellation dialog
- Verifies navigation back to list

#### ✅ Test 6: Buscar proveedor por RUC
- Uses search functionality
- Filters by RUC
- Verifies filtered results

#### ✅ Test 7: Filtrar proveedores por estado
- Applies "Activos" filter
- Verifies filtered results show only active suppliers

#### ✅ Test 8: Navegar a detalle de proveedor
- Clicks "Ver detalle" button
- Verifies navigation to detail page

### 3. Test Helpers

**File:** `apps/web/tests/e2e/helpers/auth.ts`
- `login()` - Authenticate user before tests
- `logout()` - Clean logout
- `isLoggedIn()` - Check authentication status

### 4. Configuration Files

**File:** `apps/web/.env.test.example`
- Template for test environment variables
- Documents required credentials
- Base URL configuration

**File:** `apps/web/tests/.gitignore`
- Ignores test artifacts
- Ignores screenshots (except .gitkeep)
- Ignores .env.test

**File:** `apps/web/tests/screenshots/.gitkeep`
- Ensures screenshots directory exists

### 5. Documentation

**File:** `apps/web/tests/e2e/README.md`
- Complete test documentation
- Setup instructions
- Running tests guide
- Test structure overview
- Troubleshooting guide
- Best practices
- Future improvements

## Test Coverage

### Scenarios Covered
- ✅ Full proveedor creation flow
- ✅ Form validation (required fields)
- ✅ RUC format validation
- ✅ Email format validation
- ✅ Cancel flow with confirmation
- ✅ Search functionality
- ✅ Filter by status
- ✅ Navigation to detail

### Not Yet Covered (Future)
- [ ] Edit proveedor flow
- [ ] Delete/deactivate proveedor
- [ ] Import/export functionality
- [ ] Pagination
- [ ] Multiple proveedores creation
- [ ] Error handling (network failures)

## How to Run

### First Time Setup
```bash
# Install Playwright browsers
cd apps/web
pnpm run playwright:install

# Create test environment file
cp .env.test.example .env.test
# Edit .env.test with your credentials
```

### Run Tests
```bash
# Run all tests (headless)
pnpm run test:e2e

# Run with UI (recommended for development)
pnpm run test:e2e:ui

# Run in headed mode (see browser)
pnpm run test:e2e:headed

# Debug specific test
pnpm run test:e2e:debug -g "Crear proveedor desde UI"
```

## Test Data

The tests use the following test data:
```typescript
{
  ruc: '20123456789',
  razonSocial: 'DISTRIBUIDORA TEST E2E S.A.C.',
  nombreComercial: 'Test E2E Distribuidora',
  email: 'test-e2e@distribuidora.com',
  telefono: '+51 999 888 777',
  direccion: 'Av. Test E2E 123, Lima',
  contacto: 'Juan Pérez Test',
  condicionesPago: 'CREDITO_30',
  limiteCredito: '50000'
}
```

## Screenshots

Screenshots are automatically captured:
1. **proveedor-form-filled.png** - Form filled before submission
2. **proveedor-created.png** - Proveedor in list after creation
3. **On failure** - Automatic screenshot on any test failure

## CI/CD Integration

The tests are configured for CI/CD:
- Automatic retries (2 retries in CI)
- Single worker in CI mode
- HTML report generation
- Automatic dev server startup
- Headless mode by default

## Dependencies

```json
{
  "@playwright/test": "^1.56.1"
}
```

## Notes

1. **Authentication**: Tests assume a login flow exists. Update `helpers/auth.ts` if your auth implementation differs.

2. **Selectors**: Tests use semantic selectors (text, name attributes). Consider adding `data-testid` attributes for more stable selectors.

3. **Cleanup**: Tests currently don't clean up created data. Consider adding cleanup hooks for production test environments.

4. **Timing**: Uses minimal hardcoded waits. Relies on Playwright's auto-waiting for most interactions.

5. **Isolation**: Each test is independent and can run in any order.

## Verification

To verify the implementation:

1. Start the dev server:
```bash
pnpm run dev
```

2. Run the tests:
```bash
cd apps/web
pnpm run test:e2e
```

3. Check the HTML report:
```bash
npx playwright show-report
```

## Future Improvements

1. **Page Object Model**: Refactor to use POM pattern for better maintainability
2. **Test Data Management**: Implement test data factory and cleanup
3. **API Mocking**: Add MSW for API mocking in isolated tests
4. **Accessibility**: Add @axe-core/playwright for a11y testing
5. **Performance**: Add performance assertions
6. **Visual Regression**: Add visual comparison tests
7. **Data-testid**: Add data-testid attributes to components for stable selectors

## Related Files

- `apps/web/app/dashboard/compras/proveedores/page.tsx` - List page
- `apps/web/app/dashboard/compras/proveedores/nuevo/page.tsx` - Create page
- `apps/web/components/compras/ProveedorForm.tsx` - Form component
- `apps/web/types/compras.ts` - Type definitions

## Task Completion

✅ **TASK 2.15 - Crear proveedor desde UI** - COMPLETED

The E2E test successfully covers the complete flow of creating a supplier from the UI, including:
- Navigation
- Form filling
- Validation
- Submission
- Verification

All 8 test scenarios are implemented and ready to run.
