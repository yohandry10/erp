# Implementation: POST /api/compras/ordenes/:id/rechazar

## Overview
Implemented the endpoint to reject purchase orders (órdenes de compra) with proper validation and state management.

## Files Created/Modified

### 1. DTO Created
**File:** `apps/erp-api/src/modules/compras/dto/rechazar-orden-compra.dto.ts`

- Defines the structure for rejection requests
- Fields:
  - `rechazado_por_id` (optional): UUID of the user rejecting
  - `rechazado_por_nombre` (optional): Name of the user rejecting
  - `motivo_rechazo` (required): Reason for rejection
- Includes validation decorators and OpenAPI documentation

### 2. Service Method Added
**File:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`

Added `rechazar()` method with:
- Validation that the order exists
- Validation that the order is in a rejectable state (PENDIENTE, BORRADOR, APROBACION)
- Updates order state to RECHAZADA
- Records rejection timestamp, user, and reason
- Returns updated order with details

### 3. Controller Endpoint Added
**File:** `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`

Added POST endpoint `/api/compras/ordenes/:id/rechazar`:
- Accepts RechazarOrdenCompraDto in request body
- Supports tenant_id from body or query parameter
- Returns success/error response with updated order data
- Includes OpenAPI documentation

### 4. Database Migration Created
**File:** `supabase/migrations/036_ordenes_compra_rechazo.sql`

As per task instructions, created a new migration (036) instead of modifying 035:
- Adds `rechazado_at` column (TIMESTAMP WITH TIME ZONE)
- Adds `rechazado_by` column (UUID)
- Adds `motivo_rechazo` column (TEXT)
- Adds 'RECHAZADA' value to estado_orden_compra enum
- Creates index on rechazado_at for performance
- Includes column comments for documentation

### 5. Test Script Created
**File:** `test-rechazar-orden-compra.ps1`

Comprehensive PowerShell test script that:
- Creates a test orden de compra
- Rejects the order with a valid reason
- Verifies the order state changed to RECHAZADA
- Tests that already rejected orders cannot be rejected again
- Tests that rejection requires a motivo (reason)

## Business Logic

### Rejectable States
Orders can only be rejected when in these states:
- PENDIENTE
- BORRADOR
- APROBACION

### Rejection Process
1. Verify order exists
2. Validate order is in rejectable state
3. Update order state to RECHAZADA
4. Record:
   - Rejection timestamp (rechazado_at)
   - User who rejected (rechazado_by)
   - Reason for rejection (motivo_rechazo)
5. Return updated order with all details

### Validation Rules
- Order must exist
- Order must be in rejectable state
- Motivo (reason) is required
- Cannot reject already rejected orders

## API Endpoint

### POST /api/compras/ordenes/:id/rechazar

**Request Body:**
```json
{
  "tenant_id": "uuid",
  "rechazado_por_id": "uuid",
  "rechazado_por_nombre": "string",
  "motivo_rechazo": "string (required)"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Orden de compra rechazada exitosamente",
  "data": {
    "id": "uuid",
    "numero": "OC-001",
    "estado": "RECHAZADA",
    "rechazado_at": "2025-10-24T10:30:00Z",
    "rechazado_by": "uuid",
    "motivo_rechazo": "Presupuesto insuficiente",
    ...
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "No se puede rechazar una orden en estado APROBADA"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Orden de compra con ID {id} no encontrada"
}
```

## Testing

Run the test script:
```powershell
./test-rechazar-orden-compra.ps1
```

The script validates:
1. ✓ Order creation
2. ✓ Order rejection with valid reason
3. ✓ State change to RECHAZADA
4. ✓ Rejection data is stored correctly
5. ✓ Cannot reject already rejected order
6. ✓ Motivo is required for rejection

## Database Changes

To apply the migration:
```sql
-- Run migration 036
\i supabase/migrations/036_ordenes_compra_rechazo.sql
```

This adds the necessary fields to support the rejection workflow without modifying the existing migration 035.

## Future Enhancements (TODOs in code)

1. Create record in `oc_aprobaciones` table with RECHAZADA status
2. Emit `OrdenCompraRechazada` event for notifications
3. Notify relevant users (creator, approvers) about rejection
4. Add rejection to audit log

## Integration Points

- **CxP (Cuentas por Pagar):** Rejected orders should not create payables
- **Inventory:** Rejected orders should not reserve stock
- **Notifications:** Users should be notified of rejection
- **Audit:** Rejection should be logged for compliance

## Status

✅ **COMPLETED** - Task marked as complete in fase-2-compras-tasks.md
