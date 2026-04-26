# Developer Guide

## 1. Setup & Environment

### Prerequisites
*   Node.js (LTS)
*   pnpm
*   Docker & Docker Compose (for local DB/Redis)

### Installation
```bash
pnpm install
```

### Running Local
```bash
# Start Infrastructure
docker-compose up -d

# Start API
pnpm --filter erp-api start:dev

# Start Web
pnpm --filter web dev
```

## 2. Coding Standards

### Custom Decorators (`apps/erp-api/src/common/decorators`)

#### `@CurrentTenant()`
Extracts `tenant_id` from JWT.
```typescript
findAll(@CurrentTenant() tenantId: string)
```

#### `@CurrentUser()`
Extracts full user object.
```typescript
getProfile(@CurrentUser() user: any)
```

#### `@RequirePermission(module, action, resource)`
RBAC check.
```typescript
@RequirePermission('ventas', 'create', 'facturas')
```

### Authentication
*   Always use `JwtAuthGuard` for protected routes.
*   Never trust `X-Tenant-Id` alone; rely on the Guard/Middleware to validate it against the Token.

## 3. Testing

### Unit Tests
```bash
pnpm test
# OR
pnpm --filter erp-api test
```

### E2E Tests
```bash
pnpm --filter erp-api test:e2e
```
*   Requires local Supabase instance running (`npx supabase start`).

## 4. Database & Migrations

### Supabase
*   Migrations are in `supabase/migrations`.
*   Apply locally: `npx supabase db reset`.
*   **Warning**: Do not manually edit `schema.sql` (if exists), use migrations.

### RLS (Row Level Security)
*   Every table must have RLS enabled.
*   Policies must rely on `app.current_tenant_id()`.
