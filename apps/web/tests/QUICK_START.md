# Quick Start - E2E Tests

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

## 🚀 Get Started in 3 Steps

### 1. Install Playwright Browsers
```bash
cd apps/web
pnpm run playwright:install
```

### 2. Configure Test Environment
```bash
# Copy the example file
cp .env.test.example .env.test

# Edit with your credentials (optional - has defaults)
# TEST_USER_EMAIL=admin@test.com
# TEST_USER_PASSWORD=password123
```

### 3. Run Tests
```bash
# Option A: Run with UI (Recommended for first time)
pnpm run test:e2e:ui

# Option B: Run headless
pnpm run test:e2e

# Option C: Run with visible browser
pnpm run test:e2e:headed
```

## 📋 Available Tests

### Compras Module (compras.spec.ts)
- ✅ Crear proveedor desde UI - Full supplier creation flow
- ✅ Validar campos requeridos - Form validation
- ✅ Validar formato de RUC - RUC validation
- ✅ Validar formato de email - Email validation
- ✅ Cancelar creación - Cancel flow
- ✅ Buscar proveedor - Search functionality
- ✅ Filtrar por estado - Filter by status
- ✅ Navegar a detalle - Navigation

## 🎯 Run Specific Tests

```bash
# Run only compras tests
pnpm run test:e2e compras.spec.ts

# Run specific test by name
pnpm run test:e2e -g "Crear proveedor desde UI"

# Debug a test
pnpm run test:e2e:debug -g "Crear proveedor"
```

## 📊 View Results

After running tests, view the HTML report:
```bash
npx playwright show-report
```

## 🐛 Troubleshooting

### "Cannot find element" errors
- Make sure dev server is running on port 3001
- Try running with `--headed` to see what's happening

### Login fails
- Check credentials in `.env.test`
- Verify the login flow matches your app

### Timeout errors
- Ensure backend API is running
- Check network connection
- Increase timeout in `playwright.config.ts`

## 📚 More Info

See `e2e/README.md` for detailed documentation.
