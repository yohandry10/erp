# Modules Reference

## 1. Compras (Purchasing)

### Recepciones
Manages the reception of goods from Purchase Orders (OC).
*   **Flow**: `BORRADOR` -> `CERRADA`.
*   **Actions**:
    *   Registrar items (Qty, Quality, Batch/Series).
    *   Closes OC (Partial/Full).
    *   Updates Inventory (`stock_actual`).
    *   Emits `RecepcionRegistrada` -> Creates `CxP` (Accounts Payable).
*   **Validations**: Cannot exceed ordered quantity. Must be linked to Approved OC.

### Devoluciones
Handles returns to providers.
*   **Impact**: Reverses inventory entrance and adjusts CxP (credit note).

## 2. Ventas (Sales)

### Pedidos (Orders)
Manages sales cycle.
*   **Standard Flow**: `PENDIENTE` -> `CONFIRMADO` -> `LISTO_FACTURAR` -> `FACTURADO`.
*   **Complete Flow** (Logistics enabled): Adds `EN_PREPARACION` -> `LISTO_DESPACHO`.
*   **Inventory**:
    *   Confirming reserves stock (`stock_reservado`).
    *   Facturing/Dispatching deducts stock (`stock_actual`) and releases reservation.
*   **Endpoints**: `/api/ventas/pedidos`. Allows creation, confirmation, cancellation.

### Cotizaciones (Quotes)
Pre-sales documents.
*   Can be converted to Orders.

## 3. Configuration & Tenants

### Tenant Management (Super Admin)
*   **Service**: `TenantManagementService`.
*   **Features**: Create, Update, Activate/Deactivate tenants.
*   **Data**: `tenants` table. Isolated by super-admin roles.

### Configuration Wizard
*   **Service**: `ConfigurationService`.
*   **Features**: Tracks setup progress (RUC, Certificate, Preferences).
*   **Endpoints**: `/api/configuration/status`, `/api/configuration/wizard/*`.

## 4. Common / Shared

### Authentication
*   **Guards**: `JwtAuthGuard`, `PermissionGuard`.
*   **Decorators**: `@CurrentTenant()`, `@CurrentUser()`.

### Security
*   **Tenancy**: Enforced by `TenantMiddleware` (checks `X-Tenant-Id` vs JWT) and connection RLS.
