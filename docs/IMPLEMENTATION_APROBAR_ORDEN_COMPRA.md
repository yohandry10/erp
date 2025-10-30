# Implementation: POST /api/compras/ordenes/:id/aprobar

## Summary
Implemented the approval endpoint for purchase orders (órdenes de compra) as specified in task 2.4 of the Fase 2 Compras module.

## Files Created/Modified

### 1. Created DTO
**File:** `apps/erp-api/src/modules/compras/dto/aprobar-orden-compra.dto.ts`
- Defines the data structure for approving a purchase order
- Fields:
  - `aprobador_id` (optional): UUID of the approver
  - `aprobador_nombre` (optional): Name of the approver
  - `comentarios` (optional): Comments from the approver

### 2. Updated Service
**File:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
- Added `aprobar()` method
- Validates that the order exists
- Validates that the order is in an approvable state (PENDIENTE, BORRADOR, or APROBACION)
- Updates the order state to APROBADA
- Records approval timestamp and approver ID

### 3. Updated Controller
**File:** `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`
- Added POST endpoint: `/api/compras/ordenes/:id/aprobar`
- Includes OpenAPI documentation
- Handles tenant_id from body or query parameter
- Returns success/error response

### 4. Updated DTO Index
**File:** `apps/erp-api/src/modules/compras/dto/index.ts`
- Added export for `AprobarOrdenCompraDto`

### 5. Created Test Script
**File:** `test-aprobar-orden-compra.ps1`
- PowerShell test script to verify the endpoint
- Tests the complete flow:
  1. Creates a test proveedor
  2. Creates a test orden de compra in PENDIENTE state
  3. Approves the orden
  4. Verifies the estado changed to APROBADA
  5. Tests error case (trying to approve already approved orden)

## API Endpoint Details

### POST /api/compras/ordenes/:id/aprobar

**Description:** Approves a purchase order, changing its state to APROBADA.

**Path Parameters:**
- `id` (UUID): The ID of the purchase order to approve

**Query Parameters:**
- `tenant_id` (optional): Tenant ID (defaults to test tenant if not provided)

**Request Body:**
```json
{
  "tenant_id": "uuid",
  "aprobador_id": "uuid",
  "aprobador_nombre": "string",
  "comentarios": "string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Orden de compra aprobada exitosamente",
  "data": {
    "id": "uuid",
    "numero": "OC-2024-001",
    "estado": "APROBADA",
    "aprobado_by": "uuid",
    "aprobado_at": "2024-10-24T10:30:00Z",
    ...
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message"
}
```

**Status Codes:**
- 200: Order approved successfully
- 400: Order is not in an approvable state
- 404: Order not found

## Business Logic

### Validation Rules
1. Order must exist in the database
2. Order must be in one of these states:
   - PENDIENTE
   - BORRADOR
   - APROBACION
3. Cannot approve orders in states: APROBADA, PARCIAL, RECIBIDA, CERRADA, ANULADA

### State Transition
- Current State: PENDIENTE | BORRADOR | APROBACION
- New State: APROBADA

### Database Updates
1. Updates `ordenes_compra.estado` to 'APROBADA'
2. Sets `ordenes_compra.aprobado_at` to current timestamp
3. Sets `ordenes_compra.aprobado_by` to approver's user ID
4. Updates `ordenes_compra.updated_at` to current timestamp

## Future Enhancements (TODOs in code)

1. **Multi-level Approval Flow:**
   - Create records in `oc_aprobaciones` table for multi-level approval workflows
   - Implement approval level logic based on order amount
   - Track approval history per level

2. **Event Emission:**
   - Emit `OrdenCompraAprobada` domain event
   - Enable integration with other modules (e.g., inventory, finance)
   - Support event-driven architecture

3. **Notifications:**
   - Notify relevant users when order is approved
   - Send email/SMS notifications to stakeholders

## Testing

### Manual Testing
Run the test script:
```powershell
./test-aprobar-orden-compra.ps1
```

### Test Coverage
The implementation includes:
- ✅ Happy path: Approve order in PENDIENTE state
- ✅ Error handling: Order not found
- ✅ Error handling: Order in non-approvable state
- ✅ Validation: State transition rules
- ✅ Database updates: Estado, aprobado_at, aprobado_by

### Integration Points
- Uses existing `OrdenesCompraRepository.updateEstado()` method
- Integrates with existing order validation logic
- Compatible with multi-tenant architecture

## Database Schema

The implementation uses these database columns (already present in migration 035):
- `ordenes_compra.estado` (estado_orden_compra enum)
- `ordenes_compra.aprobado_at` (timestamp)
- `ordenes_compra.aprobado_by` (uuid)
- `ordenes_compra.updated_at` (timestamp)

The `oc_aprobaciones` table is available for future multi-level approval implementation.

## Notes

- The endpoint supports both body and query parameter for `tenant_id` for flexibility
- Default tenant ID is used for testing purposes when not provided
- The implementation follows the existing pattern used in other endpoints
- All validation errors return descriptive messages
- The code includes TODO comments for future enhancements
