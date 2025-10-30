# Implementation: Cancelar Orden de Compra

## Status: ✅ COMPLETED (Pending Migration)

## Overview
Implementation of the "Cancel Purchase Order" functionality that allows users to cancel purchase orders in valid states.

## What Was Implemented

### 1. Backend Implementation

#### Controller Endpoint
- **Endpoint**: `POST /api/compras/ordenes/:id/cancelar`
- **Location**: `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`
- **Status**: ✅ Already implemented

#### Service Method
- **Method**: `cancelar(id, cancelarDto, tenantId, userId)`
- **Location**: `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
- **Status**: ✅ Already implemented

#### DTO
- **File**: `apps/erp-api/src/modules/compras/dto/cancelar-orden-compra.dto.ts`
- **Status**: ✅ Already implemented
- **Fields**:
  - `cancelado_por_id` (optional UUID)
  - `cancelado_por_nombre` (optional string)
  - `motivo_cancelacion` (required string)

### 2. Business Logic

The `cancelar` method implements the following logic:

1. **Validation**: Verifies the order exists
2. **State Check**: Ensures the order is in a cancelable state:
   - PENDIENTE
   - BORRADOR
   - APROBACION
   - APROBADA
   - PARCIAL
3. **State Update**: Changes order state to ANULADA
4. **Metadata**: Records cancellation details:
   - `cancelado_at`: Timestamp of cancellation
   - `cancelado_by`: User ID who canceled
   - `motivo_cancelacion`: Reason for cancellation

### 3. Database Migration

#### Migration File
- **File**: `supabase/migrations/036_add_cancelacion_fields.sql`
- **Status**: ✅ Created, ⚠️ Needs to be applied

#### Fields Added to `ordenes_compra` table:
- `cancelado_at` (TIMESTAMP WITH TIME ZONE)
- `cancelado_by` (UUID)
- `motivo_cancelacion` (TEXT)
- `rechazado_at` (TIMESTAMP WITH TIME ZONE) - for consistency
- `rechazado_by` (UUID) - for consistency
- `motivo_rechazo` (TEXT) - for consistency

#### How to Apply Migration

**Option 1: Supabase Dashboard (Recommended)**
1. Go to https://ifivjoflcplenrgiyrmz.supabase.co
2. Navigate to SQL Editor
3. Copy the contents of `supabase/migrations/036_add_cancelacion_fields_simple.sql`
4. Paste and run the query

**Option 2: Supabase CLI**
```bash
supabase db push
```

### 4. Test Script

#### Test File
- **File**: `test-cancelar-orden-compra.ps1`
- **Status**: ✅ Created and updated
- **What it tests**:
  1. Creates a test order
  2. Cancels the order
  3. Verifies the order status is ANULADA
  4. Tests validation by trying to cancel an already canceled order

## API Documentation

### Request

```http
POST /api/compras/ordenes/:id/cancelar
Content-Type: application/json

{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "cancelado_por_id": "550e8400-e29b-41d4-a716-446655440001",
  "cancelado_por_nombre": "Juan Pérez",
  "motivo_cancelacion": "Cambio en los requerimientos del proyecto"
}
```

### Response (Success)

```json
{
  "success": true,
  "message": "Orden de compra cancelada exitosamente",
  "data": {
    "id": "df881bf8-e447-4ca1-8121-220f33a3983c",
    "numero": "OC-2024-001",
    "estado": "ANULADA",
    "cancelado_at": "2025-10-25T10:30:00Z",
    "cancelado_by": "550e8400-e29b-41d4-a716-446655440001",
    "motivo_cancelacion": "Cambio en los requerimientos del proyecto",
    ...
  }
}
```

### Response (Error - Invalid State)

```json
{
  "success": false,
  "error": "No se puede cancelar una orden en estado RECIBIDA. Estados válidos: PENDIENTE, BORRADOR, APROBACION, APROBADA, PARCIAL"
}
```

### Response (Error - Not Found)

```json
{
  "success": false,
  "error": "Orden de compra con ID xxx no encontrada"
}
```

## Validation Rules

1. **Order Must Exist**: The order ID must be valid and exist in the database
2. **Valid State**: Order must be in one of these states:
   - PENDIENTE
   - BORRADOR
   - APROBACION
   - APROBADA
   - PARCIAL
3. **Cannot Cancel**:
   - RECIBIDA (fully received)
   - CERRADA (closed)
   - ANULADA (already canceled)
4. **Required Field**: `motivo_cancelacion` is mandatory

## Future Enhancements (TODOs in code)

The service includes comments for future enhancements:

1. **Partial Receptions**: If the order has partial receptions, create automatic returns
2. **Stock Management**: Release reserved stock if applicable
3. **Event Emission**: Emit `OrdenCompraCancelada` event for notifications and integrations

## Testing

### Manual Testing Steps

1. **Apply the migration** (see instructions above)
2. **Start the API server**:
   ```bash
   cd apps/erp-api
   pnpm run dev
   ```
3. **Run the test script**:
   ```powershell
   ./test-cancelar-orden-compra.ps1
   ```

### Expected Test Results

- ✅ Order created successfully
- ✅ Order canceled successfully
- ✅ Status changed to ANULADA
- ✅ Cancellation metadata recorded
- ✅ Validation prevents canceling already canceled orders

## Integration Points

### Current
- Updates order state in `ordenes_compra` table
- Records cancellation metadata

### Future (when implemented)
- Will emit `OrdenCompraCancelada` event
- Will trigger notifications to relevant users
- Will handle partial reception scenarios
- Will integrate with inventory for stock release

## Files Modified/Created

### Created
- `supabase/migrations/036_add_cancelacion_fields.sql` - Main migration
- `supabase/migrations/036_add_cancelacion_fields_simple.sql` - Simplified version
- `test-cancelar-orden-compra.ps1` - Test script (updated)
- `IMPLEMENTATION_CANCELAR_ORDEN_COMPRA.md` - This documentation

### Already Existed (No changes needed)
- `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`
- `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
- `apps/erp-api/src/modules/compras/dto/cancelar-orden-compra.dto.ts`

## Completion Checklist

- [x] Controller endpoint exists
- [x] Service method implemented
- [x] DTO defined with validation
- [x] Business logic validates states
- [x] Migration file created
- [ ] **Migration applied to database** ⚠️ PENDING
- [x] Test script created
- [ ] Test script passes ⚠️ PENDING (requires migration)
- [x] Documentation created

## Next Steps

1. **Apply the migration** to the Supabase database
2. **Run the test script** to verify functionality
3. **Update the task status** in `fase-2-compras-tasks.md`
4. **Consider implementing** the future enhancements (events, stock release, etc.)

## Notes

- The implementation follows the same pattern as `aprobar` and `rechazar` methods
- The cancellation is a soft operation (changes state to ANULADA, doesn't delete)
- The migration also adds fields for `rechazar` functionality for consistency
- All validation and error handling is in place
- The endpoint is fully documented with OpenAPI decorators
