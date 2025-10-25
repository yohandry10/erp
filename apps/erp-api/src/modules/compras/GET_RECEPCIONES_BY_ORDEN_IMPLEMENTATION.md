# Implementation: GET /api/compras/ordenes/:id/recepciones

## Overview
This document describes the implementation of the endpoint to retrieve all recepciones (receptions) associated with a specific orden de compra (purchase order).

## Task Reference
- **Task**: TASK 2.4 - GET /api/compras/ordenes/:id/recepciones
- **Status**: ✅ COMPLETED
- **Date**: 2025-10-24

## Implementation Details

### 1. Repository Layer
**File**: `apps/erp-api/src/modules/compras/repositories/ordenes-compra.repository.ts`

Added method `findRecepcionesByOrdenId`:
```typescript
async findRecepcionesByOrdenId(ordenId: string, tenantId: string)
```

**Functionality**:
- Queries the `recepciones` table filtered by `orden_id` and `tenant_id`
- Includes related `recepcion_items` with all relevant fields
- Orders results by `fecha_recepcion` descending (most recent first)
- Returns empty array if no recepciones found

**Database Query**:
- Selects from `recepciones` table
- Joins with `recepcion_items` to get item details
- Filters by orden_id and tenant_id for multi-tenant isolation
- Includes fields: id, producto_id, cantidad, cantidad_aceptada, cantidad_rechazada, calidad, lote, serie, ubicacion_id, observaciones

### 2. Service Layer
**File**: `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`

Added method `findRecepcionesByOrdenId`:
```typescript
async findRecepcionesByOrdenId(id: string, tenantId: string)
```

**Functionality**:
- Validates that the orden de compra exists
- Throws `NotFoundException` if orden not found
- Calls repository method to fetch recepciones
- Returns array of recepciones with their items

**Error Handling**:
- 404 Not Found: When orden de compra doesn't exist
- Propagates database errors from repository layer

### 3. Controller Layer
**File**: `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`

Added endpoint:
```typescript
@Get(':id/recepciones')
async findRecepcionesByOrdenId(@Param('id') id: string, @Query('tenant_id') tenantId?: string)
```

**Endpoint Details**:
- **Method**: GET
- **Path**: `/api/compras/ordenes/:id/recepciones`
- **Parameters**:
  - `id` (path): UUID of the orden de compra
  - `tenant_id` (query, optional): Tenant identifier (defaults to test tenant)

**Response Format**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "numero": "REC-2024-0001",
      "orden_id": "uuid",
      "fecha_recepcion": "2024-10-24T10:00:00Z",
      "estado": "CERRADA",
      "observaciones": "Recepción completa",
      "created_by": "uuid",
      "cerrado_por": "uuid",
      "cerrado_at": "2024-10-24T11:00:00Z",
      "created_at": "2024-10-24T10:00:00Z",
      "updated_at": "2024-10-24T11:00:00Z",
      "recepcion_items": [
        {
          "id": "uuid",
          "producto_id": "uuid",
          "cantidad": 100,
          "cantidad_aceptada": 95,
          "cantidad_rechazada": 5,
          "calidad": "OK",
          "lote": "LOTE-001",
          "serie": null,
          "ubicacion_id": "uuid",
          "observaciones": "5 unidades con defectos menores"
        }
      ]
    }
  ],
  "count": 1
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Orden de compra con ID {id} no encontrada",
  "data": [],
  "count": 0
}
```

**OpenAPI Documentation**:
- Summary: "Obtener recepciones de una orden de compra"
- Description: "Obtiene todas las recepciones de mercancía asociadas a una orden de compra específica"
- Response 200: Recepciones obtenidas exitosamente
- Response 404: Orden de compra no encontrada

## Testing

### Test Script
Created PowerShell test script: `test-recepciones-by-orden.ps1`

**Test Flow**:
1. Retrieves list of existing ordenes de compra
2. Selects first orden from the list
3. Calls GET /api/compras/ordenes/:id/recepciones
4. Displays recepciones with their items

**Usage**:
```powershell
./test-recepciones-by-orden.ps1
```

### Manual Testing
```bash
# Get recepciones for a specific orden
curl -X GET "http://localhost:3000/api/compras/ordenes/{orden_id}/recepciones?tenant_id={tenant_id}"
```

## Database Schema Reference

### recepciones table
- `id`: UUID (PK)
- `tenant_id`: UUID (for multi-tenant isolation)
- `numero`: VARCHAR(50) (unique per tenant)
- `orden_id`: UUID (FK to ordenes_compra)
- `fecha_recepcion`: TIMESTAMP
- `estado`: estado_recepcion ENUM ('BORRADOR', 'CERRADA')
- `observaciones`: TEXT
- `created_by`: UUID
- `cerrado_por`: UUID
- `cerrado_at`: TIMESTAMP
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### recepcion_items table
- `id`: UUID (PK)
- `recepcion_id`: UUID (FK to recepciones)
- `producto_id`: UUID
- `cantidad`: NUMERIC
- `cantidad_aceptada`: NUMERIC
- `cantidad_rechazada`: NUMERIC
- `calidad`: calidad_recepcion ENUM ('OK', 'OBSERVADO', 'RECHAZADO')
- `lote`: VARCHAR
- `serie`: VARCHAR
- `ubicacion_id`: UUID
- `observaciones`: TEXT

## Integration Points

### Related Endpoints
- `GET /api/compras/ordenes/:id` - Get orden details
- `POST /api/compras/ordenes/:ordenId/recepciones` - Create new recepcion
- `GET /api/compras/recepciones/:id` - Get recepcion details

### Business Logic
- Recepciones are linked to ordenes de compra via `orden_id`
- Multiple recepciones can exist for a single orden (partial receptions)
- Recepciones track received quantities and quality status
- When recepciones are closed, they update orden estado (PARCIAL or RECIBIDA)

## Security Considerations
- Multi-tenant isolation enforced via `tenant_id` filter
- RLS (Row Level Security) policies on recepciones table
- Authentication required (currently disabled for testing)
- Authorization checks should verify user has access to the tenant

## Future Enhancements
- Add pagination support for large number of recepciones
- Add filtering by estado, fecha_recepcion range
- Include calculated totals (total cantidad, cantidad_aceptada, cantidad_rechazada)
- Add sorting options
- Include proveedor information from orden
- Add statistics (percentage received, pending items)

## Checklist
- ✅ Repository method implemented
- ✅ Service method implemented with validation
- ✅ Controller endpoint implemented
- ✅ OpenAPI documentation added
- ✅ Error handling implemented
- ✅ Multi-tenant isolation enforced
- ✅ Test script created
- ✅ No TypeScript diagnostics errors
- ✅ Follows existing code patterns
- ✅ Documentation created

## Notes
- The endpoint follows the RESTful pattern of nested resources
- Returns empty array instead of 404 when no recepciones found (this is intentional)
- Tenant_id defaults to test tenant for development/testing purposes
- The endpoint is ready for production once authentication is enabled
