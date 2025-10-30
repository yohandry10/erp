# E2E Tests - Compras Module

This directory contains end-to-end tests for the Compras (Purchasing) module using Playwright.

## Setup

1. Install Playwright browsers:
```bash
pnpm run playwright:install
```

2. Create test environment file:
```bash
cp .env.test.example .env.test
```

3. Update `.env.test` with your test credentials

## Running Tests

### Run all tests (headless)
```bash
pnpm run test:e2e
```

### Run tests with UI mode (recommended for development)
```bash
pnpm run test:e2e:ui
```

### Run tests in headed mode (see browser)
```bash
pnpm run test:e2e:headed
```

### Debug tests
```bash
pnpm run test:e2e:debug
```

### Run specific test file
```bash
pnpm run test:e2e compras.spec.ts
```

### Run specific test
```bash
pnpm run test:e2e -g "Crear proveedor desde UI"
```

## Test Structure

### compras.spec.ts
Tests for the Compras module, including:
- ✅ Crear proveedor desde UI - Full flow of creating a supplier
- ✅ Validar campos requeridos - Form validation for required fields
- ✅ Validar formato de RUC - RUC format validation
- ✅ Validar formato de email - Email format validation
- ✅ Cancelar creación de proveedor - Cancel flow
- ✅ Buscar proveedor por RUC - Search functionality
- ✅ Filtrar proveedores por estado - Filter by status
- ✅ Navegar a detalle de proveedor - Navigation to detail page

## Test Data

Test data is defined at the top of each test file. For the proveedor tests:
- RUC: 20123456789
- Razón Social: DISTRIBUIDORA TEST E2E S.A.C.
- Email: test-e2e@distribuidora.com

## Screenshots

Screenshots are automatically captured:
- On test failure
- At key points in the test flow (form filled, proveedor created)

Screenshots are saved to `tests/screenshots/`

## CI/CD Integration

The tests are configured to run in CI environments with:
- Automatic retries (2 retries in CI)
- Single worker in CI
- HTML report generation

## Troubleshooting

### Tests fail with "Cannot find element"
- Ensure the dev server is running on port 3001
- Check that the selectors match your actual UI
- Use `--headed` or `--debug` mode to see what's happening

### Login fails
- Verify your test credentials in `.env.test`
- Check that the login flow matches your authentication implementation
- Update the `login()` helper function if needed

### Timeout errors
- Increase timeout in `playwright.config.ts`
- Check network conditions
- Ensure backend API is responding

## Best Practices

1. **Use data-testid attributes** for stable selectors
2. **Avoid hardcoded waits** - use `waitForSelector` or `waitForURL`
3. **Clean up test data** - consider adding cleanup hooks
4. **Keep tests independent** - each test should work in isolation
5. **Use Page Object Model** for complex flows (future improvement)

## Future Improvements

- [ ] Add Page Object Model pattern
- [ ] Add test data cleanup
- [ ] Add more comprehensive assertions
- [ ] Add performance testing
- [ ] Add accessibility testing with @axe-core/playwright
