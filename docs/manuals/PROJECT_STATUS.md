# Project Status & Backlog

**Based on Forensics Report (Dec 2025)**  
**Reference:** `docs/analisis.md` for detailed revision plan.

## 1. Critical Findings (High Priority)

### Security
*   **H-SEC-001**: RLS policies for login were too permissive. **Fix Applied**: Restricted to `service_role`.
*   **H-SEC-002**: Tenant Spoofing via `X-Tenant-Id`. **Fix Applied**: `TenantMiddleware` hardened, blocks mismatches.
*   **H-SEC-004**: Endpoints missing `JwtAuthGuard`. **Fix Applied**: Added guards to Finanzas/Cotizaciones controllers.

### Build & Ops
*   **H-BUILD-001**: Worker build failing on `undefined` types. **Fixed**.
*   **H-DB-MIG-001**: Fresh `supabase start` fails because migrations assume tables exist. **PENDING**: Needs bootstrap migration `000_init.sql`.

### Business Logic
*   **H-INV-001**: Inconsistency in `stock` vs `stock_actual`. **Fix Applied**: Properties unified to `stock_actual`.
*   **H-COMP-001**: Missing `idempotency_key` in Compras events. **Fixed**.
*   **H-VEN-002**: Facturacion flow silencing errors and risking double inventory deduction. **Fixed**.

## 2. Module Status

| Module | Status | Notes |
| :--- | :--- | :--- |
| **Ventas** | 🟡 Audit | Updates to Cotizaciones/Pedidos logic applied. |
| **Compras** | 🟡 Audit | Recepciones/Devoluciones idempotency fixed. |
| **Inventario**| 🟢 Stable | Unified to `stock_actual`. |
| **Fiscal** | 🟡 Integrating| CPE/GRE/SIRE retry logic hardened with "in-flight" guards. |
| **POS** | ⚪ Pending | Needs full offline/sync audit. |

## 3. Pending Actions

1.  **DB Manual Execution** (`Section 9` in old roadmap)
    *   Verify RLS changes.
    *   Add `CHECK (stock_actual >= 0)`.
    *   Add Idempotency Index on Outbox.

2.  **Testing**
    *   Stabilize E2E tests for RLS.
    *   Complete coverage for Fiscal Retries.

3.  **Documentation**
    *   (Completed) Consolidated ~85 docs into `docs/manuals/`.
