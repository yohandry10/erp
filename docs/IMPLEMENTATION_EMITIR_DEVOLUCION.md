# Implementation: POST /api/compras/devoluciones/:id/emitir

## Overview
Endpoint to emit (process) a return to supplier. This endpoint handles the complete workflow of processing a supplier return including inventory movements and event emission.

## Endpoint Details
- **Method**: POST
- **Path**: `/api/compras/devoluciones/:id/emitir`
- **Auth**: JWT Bearer Token (currently disabled for testing)
- **Multi-tenant**: Yes (via query param `tenant_id`)

## Request

### Path Parameters
- `id` (UUID, required): ID of the devolution to emit

### Query Parameters
- `tenant_id` (UUID, required for testing): Tenant identifier

### Body
No body required

## Response

### Success Response (200 OK)
```json
{
  "id": "uuid",
  "numero": "DEV-2024-0001",
  "recepcion_id": "uuid",
  "orden_id": "uuid",
  "proveedor_id": "uuid",
  "fecha_devolucion": "2024-10-25",
  "estado": "EMITIDA",
  "motivo": "Producto defectuoso",
  "subtotal": 100.00,
  "igv": 18.00,
  "total": 118.00,
  "observaciones": "Observaciones adicionales",
  "emitido_por": "user-uuid",
  "emitido_at": "2024-10-25T10:30:00Z",
  "items": [
    {
      "id": "uuid",
      "devolucion_id": "uuid",
      "producto_id": "uuid",
      "descripcion": "Producto X",
      "cantidad": 1,
      "precio_unitario": 100.00,
      "subtotal": 100.00,
      "motivo_detalle": "Defecto de fabricación"
    }
  ]
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "La devolución ya fue procesada. Estado actual: EMITIDA"
}
```

#### 404 Not Found
```json
{
  "statusCode": 404,
  "message": "Devolución no encontrada"
}
```

## Business Logic

### Emission Process
1. **Validate devolution state**: Must be in PENDIENTE state
2. **Create inventory movements**: For each item, create a SALIDA movement
3. **Update stock**: Decrease stock_actual for each product
4. **Update devolution state**: Change to EMITIDA
5. **Emit event**: Publish `devolucion.proveedor.emitida` event

### Inventory Impact
- Creates inventory movement type: `SALIDA`
- Reference type: `DEVOLUCION_PROVEEDOR`
- Decreases `stock_actual` for each product
- Decreases `stock_reservado` if applicable

### Event Emission
Event type: `devolucion.proveedor.emitida`
Module: `compras`

Event payload:
```typescript
{
  devolucion_id: string;
  numero: string;
  proveedor_id: string;
  orden_id: string;
  total: number;
  items: Array<{
    producto_id: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }>;
  emitido_por: string;
  emitido_at: string;
  tenant_id: string;
}
```

## Implementation Details

### Files Modified
1. **Controller**: `apps/erp-api/src/modules/compras/controllers/devoluciones-proveedor.controller.ts`
   - Added `emitirDevolucion` endpoint handler

2. **Service**: `apps/erp-api/src/modules/compras/services/devoluciones-proveedor.service.ts`
   - Added `emitirDevolucion` method
   - Integrated with InventarioService
   - Integrated with EventBusService

### Dependencies
- `InventarioService`: For creating inventory movements and updating stock
- `EventBusService`: For emitting domain events
- `DevolucionesProveedorRepository`: For database operations

## Testing

### Test Script
Run the test script to verify the implementation:
```powershell
.\test-emitir-devolucion.ps1
```

### Test Scenarios
1. ✅ Create a test devolution
2. ✅ Emit the devolution successfully
3. ✅ Verify estado changed to EMITIDA
4. ✅ Verify stock was decreased
5. ✅ Verify duplicate emission is rejected
6. ✅ Verify event was emitted

### Manual Testing
```powershell
# 1. Create a devolution first
$body = @{
    orden_id = "orden-uuid"
    proveedor_id = "proveedor-uuid"
    motivo = "Producto defectuoso"
    items = @(
        @{
            producto_id = "producto-uuid"
            descripcion = "Producto X"
            cantidad = 1
            precio_unitario = 100.00
        }
    )
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3001/api/compras/devoluciones?tenant_id=550e8400-e29b-41d4-a716-446655440000" -Method Post -Body $body -ContentType "application/json"

# 2. Emit the devolution
Invoke-RestMethod -Uri "http://localhost:3001/api/compras/devoluciones/{devolucion-id}/emitir?tenant_id=550e8400-e29b-41d4-a716-446655440000" -Method Post
```

## Future Enhancements

### Pending Implementation
The following features are marked as TODO and will be implemented when the respective modules are available:

1. **CxP Integration** (Cuentas por Pagar)
   - Create nota de crédito de proveedor (negative CxP)
   - Adjust supplier balance

2. **Supplier Notification**
   - Send email/notification to supplier about the return
   - Include return details and instructions

### Code Locations
See comments in `devoluciones-proveedor.service.ts`:
- Line ~180: CxP integration placeholder
- Line ~190: Supplier notification placeholder

## Requirements Traceability
- **Task**: TASK 2.6 - Implementar Devoluciones a Proveedor (Backend)
- **Subtask**: POST /api/compras/devoluciones/:id/emitir
- **Status**: ✅ COMPLETED

### Implemented Requirements
- ✅ Create inventory movement (SALIDA_DEV_PROV)
- ✅ Update producto_existencias (decrease stock)
- ⏳ Create nota de crédito de proveedor (pending CxP module)
- ✅ Emit DevolucionProveedorEmitida event
- ⏳ Notify supplier (pending notification implementation)

## Notes
- The endpoint is currently accessible without authentication for testing purposes
- Multi-tenant isolation is enforced through the `tenant_id` query parameter
- The operation is atomic - if any step fails, the entire operation is rolled back
- Stock validation is performed but warnings are logged instead of blocking the operation
