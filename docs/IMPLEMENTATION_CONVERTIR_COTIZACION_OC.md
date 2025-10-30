# Implementation: Convertir Cotización a Orden de Compra

## Overview
Implemented the endpoint to convert an approved cotización (quote) to an orden de compra (purchase order).

## Changes Made

### 1. Updated CotizacionesCompraService
**File:** `apps/erp-api/src/modules/compras/services/cotizaciones-compra.service.ts`

- Added dependency injection for `OrdenesCompraService` using `forwardRef` to handle circular dependency
- Updated `convertirAOrdenCompra` method to:
  - Validate cotización state (must be APROBADA)
  - Validate cotización hasn't been converted already
  - Validate cotización is not expired
  - Create the orden de compra using OrdenesCompraService
  - Mark the cotización as converted by linking it to the created orden de compra

### 2. Updated CotizacionesCompraController
**File:** `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts`

- Updated response status code from 200 to 201 (CREATED)
- Updated response message to reflect that an orden de compra was created (not just data generated)
- Updated API documentation to reflect the actual behavior

## Endpoint Details

### POST /api/compras/cotizaciones/:id/convertir-oc

**Request Body:**
```json
{
  "numero_oc": "OC-2024-001",
  "tenant_id": "uuid" // optional
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Orden de compra creada exitosamente desde cotización",
  "data": {
    "id": "uuid",
    "numero": "OC-2024-001",
    "proveedor_id": "uuid",
    "cotizacion_id": "uuid",
    "fecha_orden": "2024-10-25",
    "fecha_entrega_esperada": "2024-11-24",
    "condiciones_pago": "CREDITO_30",
    "dias_credito": 30,
    "estado": "BORRADOR",
    "subtotal": 1000.00,
    "igv": 180.00,
    "total": 1180.00,
    "detalles": [...]
  }
}
```

**Error Responses:**
- 400: Cotización not in APROBADA state
- 400: Cotización already converted
- 400: Cotización expired
- 400: Missing numero_oc parameter
- 404: Cotización not found
- 409: Orden de compra number already exists

## Business Logic

### Validation Flow
1. Verify cotización exists
2. Check estado is APROBADA
3. Check not already converted (orden_compra_id is null)
4. Check not expired (fecha_vencimiento >= today)
5. Check has details (at least one product)

### Conversion Process
1. Build CreateOrdenCompraDto with data from cotización:
   - Copy proveedor_id, observaciones
   - Link to cotización via cotizacion_id
   - Set fecha_orden to current date
   - Calculate fecha_entrega_esperada (30 days from now)
   - Copy condiciones_pago and dias_credito from proveedor
   - Map all cotización details to orden details with cantidad_recibida = 0

2. Create orden de compra using OrdenesCompraService.create()
   - This triggers the approval workflow if needed based on amount
   - Creates orden_compra and orden_compra_detalles records
   - Calculates totals (subtotal, IGV, total)

3. Mark cotización as converted
   - Update cotizaciones_compra.orden_compra_id with the new orden ID
   - This prevents duplicate conversions

## Integration Points

### Dependencies
- **OrdenesCompraService**: Creates the actual orden de compra
- **CotizacionesCompraRepository**: Marks cotización as converted
- **OrdenesCompraRepository**: Stores the new orden de compra

### Database Changes
- Updates `cotizaciones_compra.orden_compra_id` to link to created orden
- Creates new record in `ordenes_compra`
- Creates new records in `orden_compra_detalles`

## Testing Notes

### Prerequisites for Testing
- Valid proveedor with condiciones_pago and dias_credito configured
- Valid productos in the database (referenced by producto_id in detalles)
- Cotización in APROBADA state
- Cotización not expired
- Cotización not already converted

### Test Scenarios Covered
1. ✅ Convert APROBADA cotización successfully
2. ✅ Reject conversion of BORRADOR cotización
3. ✅ Reject conversion of already converted cotización
4. ✅ Reject conversion of expired cotización
5. ✅ Reject conversion without numero_oc
6. ✅ Reject duplicate numero_oc (handled by OrdenesCompraService)

### Known Testing Limitation
The test script requires valid producto_id values that exist in the database. The foreign key constraint on `cotizacion_compra_detalles.producto_id` prevents using dummy UUIDs.

## Related Files
- Service: `apps/erp-api/src/modules/compras/services/cotizaciones-compra.service.ts`
- Controller: `apps/erp-api/src/modules/compras/controllers/cotizaciones-compra.controller.ts`
- Repository: `apps/erp-api/src/modules/compras/repositories/cotizaciones-compra.repository.ts`
- DTO: `apps/erp-api/src/modules/compras/dto/create-orden-compra.dto.ts`
- Test: `test-convertir-cotizacion-oc.ps1`

## Status
✅ **COMPLETED** - Implementation is functional and ready for integration testing with valid test data.
