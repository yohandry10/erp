# Task 2.4: POST /api/compras/ordenes - Implementation Summary

## ✅ Implementation Complete

**Date:** October 24, 2024  
**Task:** Implement POST endpoint for creating purchase orders (órdenes de compra)

---

## 📋 What Was Implemented

### 1. Repository Layer
**File:** `repositories/ordenes-compra.repository.ts`

- ✅ `create()` - Creates purchase order with details
- ✅ `findById()` - Retrieves order with related data (proveedor, almacen, detalles)
- ✅ `findByNumero()` - Finds order by unique number
- ✅ `findAll()` - Lists orders with filters (estado, proveedor, dates, pagination)
- ✅ `updateEstado()` - Updates order status

**Key Features:**
- Automatic calculation of subtotal, IGV (18%), and total
- Transaction-like behavior (rollback on detail insertion failure)
- Proper date handling for fecha_orden and fecha_entrega_esperada
- Support for optional fields (cotizacion_id, almacen_destino_id, etc.)
- Calculated cantidad_pendiente for each detail line

### 2. Service Layer
**File:** `services/ordenes-compra.service.ts`

- ✅ `create()` - Business logic for creating orders
- ✅ `findById()` - Retrieves order with validation
- ✅ `findAll()` - Lists orders with filters

**Validations Implemented:**
- ✅ Unique numero validation (no duplicates)
- ✅ At least one detail required
- ✅ Quantity must be > 0
- ✅ Unit price must be >= 0
- ✅ cantidad_recibida validation (0 <= cantidad_recibida <= cantidad)
- ✅ dias_credito must be >= 0
- ✅ fecha_entrega_esperada must be >= fecha_orden
- ✅ Automatic marking of cotizacion as converted when orden is created from it

### 3. Controller Layer
**File:** `controllers/ordenes-compra.controller.ts`

**Endpoints:**
- ✅ `POST /api/compras/ordenes` - Create new purchase order
- ✅ `GET /api/compras/ordenes` - List orders with filters
- ✅ `GET /api/compras/ordenes/:id` - Get order by ID

**Features:**
- ✅ JWT authentication required
- ✅ Tenant isolation via @TenantId() decorator
- ✅ User tracking via @UserId() decorator
- ✅ OpenAPI/Swagger documentation
- ✅ Proper HTTP status codes (201, 400, 404, 409)
- ✅ Query parameter validation

### 4. Module Registration
**File:** `compras.module.ts`

- ✅ OrdenesCompraController registered
- ✅ OrdenesCompraService registered
- ✅ OrdenesCompraRepository registered
- ✅ Service exported for use in other modules

### 5. Index Exports
- ✅ `services/index.ts` - Exports OrdenesCompraService
- ✅ `controllers/index.ts` - Exports OrdenesCompraController

---

## 🔧 Technical Details

### Database Schema Used
The implementation uses the existing `ordenes_compra` and `orden_compra_detalles` tables from migration `035_compras_completo.sql`:

**ordenes_compra:**
- id (UUID, PK)
- tenant_id (UUID)
- numero (VARCHAR, unique per tenant)
- proveedor_id (UUID, FK)
- cotizacion_id (UUID, FK, optional)
- fecha_orden (DATE)
- fecha_entrega_esperada (DATE)
- condiciones_pago (VARCHAR)
- dias_credito (INTEGER)
- almacen_destino_id (UUID, FK, optional)
- estado (estado_orden_compra ENUM)
- subtotal, igv, total (NUMERIC)
- observaciones (TEXT)
- created_by, aprobado_by (UUID)
- created_at, updated_at, aprobado_at (TIMESTAMP)

**orden_compra_detalles:**
- id (UUID, PK)
- orden_id (UUID, FK)
- producto_id (UUID, FK)
- descripcion (VARCHAR)
- cantidad (NUMERIC)
- precio_unitario (NUMERIC)
- subtotal (NUMERIC)
- cantidad_recibida (NUMERIC, default 0)
- cantidad_pendiente (NUMERIC, calculated)

### Estado Flow
```
BORRADOR → APROBACION → APROBADA → PARCIAL → RECIBIDA → CERRADA
         ↓
       ANULADA
```

### Calculation Logic
```typescript
// For each detail:
subtotal = cantidad * precio_unitario
cantidad_pendiente = cantidad - cantidad_recibida

// For order:
subtotal = SUM(detalles.subtotal)
igv = subtotal * 0.18
total = subtotal + igv
```

---

## 🧪 Testing

### Test Script Created
**File:** `test-crear-orden-compra.ps1`

A PowerShell test script is provided to test the endpoint. Update the following variables:
- `$token` - Your JWT authentication token
- `$tenantId` - Your tenant ID
- `proveedor_id` - Valid proveedor UUID
- `producto_id` - Valid producto UUIDs

### Manual Testing Steps

1. **Start the API server:**
   ```bash
   cd apps/erp-api
   pnpm run dev
   ```

2. **Get authentication token:**
   - Login via `/api/auth/login`
   - Extract JWT token from response

3. **Create a purchase order:**
   ```bash
   curl -X POST http://localhost:3000/api/compras/ordenes \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -H "x-tenant-id: YOUR_TENANT_ID" \
     -d '{
       "numero": "OC-2024-001",
       "proveedor_id": "uuid-here",
       "fecha_orden": "2024-10-24",
       "fecha_entrega_esperada": "2024-11-24",
       "condiciones_pago": "CREDITO_30",
       "dias_credito": 30,
       "estado": "BORRADOR",
       "observaciones": "Test order",
       "detalles": [
         {
           "producto_id": "uuid-here",
           "descripcion": "Product 1",
           "cantidad": 10,
           "precio_unitario": 100.00
         }
       ]
     }'
   ```

4. **List orders:**
   ```bash
   curl -X GET "http://localhost:3000/api/compras/ordenes?estado=BORRADOR" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-tenant-id: YOUR_TENANT_ID"
   ```

5. **Get order by ID:**
   ```bash
   curl -X GET http://localhost:3000/api/compras/ordenes/{order-id} \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-tenant-id: YOUR_TENANT_ID"
   ```

---

## 📊 API Documentation

### POST /api/compras/ordenes

**Request Body:**
```json
{
  "numero": "OC-2024-001",
  "proveedor_id": "uuid",
  "cotizacion_id": "uuid (optional)",
  "fecha_orden": "2024-10-24 (optional, defaults to today)",
  "fecha_entrega_esperada": "2024-11-24 (optional)",
  "condiciones_pago": "CREDITO_30 (optional)",
  "dias_credito": 30,
  "almacen_destino_id": "uuid (optional)",
  "estado": "BORRADOR (optional, default)",
  "observaciones": "string (optional)",
  "detalles": [
    {
      "producto_id": "uuid",
      "descripcion": "Product name",
      "cantidad": 10,
      "precio_unitario": 100.00,
      "cantidad_recibida": 0
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "numero": "OC-2024-001",
  "proveedor_id": "uuid",
  "fecha_orden": "2024-10-24",
  "fecha_entrega_esperada": "2024-11-24",
  "estado": "BORRADOR",
  "subtotal": 1000.00,
  "igv": 180.00,
  "total": 1180.00,
  "created_at": "2024-10-24T10:00:00Z",
  "detalles": [
    {
      "id": "uuid",
      "orden_id": "uuid",
      "producto_id": "uuid",
      "descripcion": "Product name",
      "cantidad": 10,
      "precio_unitario": 100.00,
      "subtotal": 1000.00,
      "cantidad_recibida": 0,
      "cantidad_pendiente": 10
    }
  ]
}
```

**Error Responses:**
- `400 Bad Request` - Validation errors
- `409 Conflict` - Duplicate numero
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Insufficient permissions

---

## ✅ Validation Rules

1. **numero**: Required, unique per tenant
2. **proveedor_id**: Required, must be valid UUID
3. **detalles**: Required, at least 1 item
4. **cantidad**: Must be > 0
5. **precio_unitario**: Must be >= 0
6. **cantidad_recibida**: Must be >= 0 and <= cantidad
7. **dias_credito**: Must be >= 0
8. **fecha_entrega_esperada**: Must be >= fecha_orden

---

## 🔗 Integration Points

### With Cotizaciones
When creating an order from a cotizacion:
- Set `cotizacion_id` in the request
- Service automatically marks cotizacion as converted
- Updates `cotizacion.orden_compra_id` field

### With Proveedores
- Validates proveedor_id exists
- Retrieves proveedor data in responses
- Can use proveedor's default condiciones_pago and dias_credito

### With Productos
- Validates producto_id exists for each detail
- Retrieves producto data in responses

### With Almacenes
- Optional almacen_destino_id for delivery location
- Retrieves almacen data in responses

---

## 🚀 Next Steps

The following endpoints from Task 2.4 still need to be implemented:

- [ ] PUT /api/compras/ordenes/:id - Update order
- [ ] POST /api/compras/ordenes/:id/aprobar - Approve order
- [ ] POST /api/compras/ordenes/:id/rechazar - Reject order
- [ ] POST /api/compras/ordenes/:id/cancelar - Cancel order
- [ ] GET /api/compras/ordenes/:id/recepciones - Get order receptions

---

## 📝 Notes

- The implementation follows the same pattern as cotizaciones-compra
- All database triggers for total calculation are handled by migration 035
- RLS policies ensure tenant isolation
- The service includes proper error handling and validation
- OpenAPI documentation is complete for all endpoints
- The code is production-ready and follows NestJS best practices

---

## 🎯 Task Status

**POST /api/compras/ordenes**: ✅ **COMPLETE**

All core functionality for creating purchase orders is implemented and ready for testing.
