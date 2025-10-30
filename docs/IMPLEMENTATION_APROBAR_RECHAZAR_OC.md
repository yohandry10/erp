# Implementation: Aprobar/Rechazar Orden de Compra

## Overview
This document describes the implementation of the approve and reject functionality for purchase orders (Órdenes de Compra).

## Status
✅ **COMPLETED**

## Components Implemented

### Backend (Already Existed)
The backend endpoints were already implemented in previous tasks:

#### Endpoints
1. **POST /api/compras/ordenes/:id/aprobar**
   - Approves a purchase order
   - Changes state to APROBADA (or keeps in APROBACION if more approvals needed)
   - Creates approval record in oc_aprobaciones table
   - Emits OrdenCompraAprobada event when fully approved
   - Validates that order is in approvable state (PENDIENTE, BORRADOR, APROBACION)

2. **POST /api/compras/ordenes/:id/rechazar**
   - Rejects a purchase order
   - Changes state to ANULADA
   - Creates rejection record in oc_aprobaciones table
   - Requires rejection reason (motivo_rechazo)
   - Validates that order is in rejectable state (PENDIENTE, BORRADOR, APROBACION)

#### Service Methods
Located in: `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`

- `aprobar(id, aprobarDto, tenantId, userId)`: Handles approval logic
- `rechazar(id, rechazarDto, tenantId, userId)`: Handles rejection logic

#### DTOs
- `AprobarOrdenCompraDto`: Contains optional comentarios, aprobador_id, aprobador_nombre
- `RechazarOrdenCompraDto`: Contains required motivo_rechazo, optional rechazado_por_id, rechazado_por_nombre

### Frontend (Newly Implemented)

#### 1. AprobarOrdenModal Component
**File**: `apps/web/components/compras/AprobarOrdenModal.tsx`

**Features**:
- Modal dialog for approving purchase orders
- Optional comments field for approval notes
- Loading state during API call
- Success/error handling
- Clean, modern UI using global CSS variables

**Props**:
```typescript
interface AprobarOrdenModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (comentarios?: string) => Promise<void>
  ordenNumero: string
}
```

#### 2. RechazarOrdenModal Component
**File**: `apps/web/components/compras/RechazarOrdenModal.tsx`

**Features**:
- Modal dialog for rejecting purchase orders
- Required rejection reason field (motivo_rechazo)
- Validation to ensure reason is provided
- Warning message about order being set to ANULADA state
- Loading state during API call
- Error handling with user feedback
- Clean, modern UI using global CSS variables

**Props**:
```typescript
interface RechazarOrdenModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (motivoRechazo: string) => Promise<void>
  ordenNumero: string
}
```

#### 3. Updated Orden Detail Page
**File**: `apps/web/app/dashboard/compras/ordenes/[id]/page.tsx`

**Changes**:
- Added imports for AprobarOrdenModal and RechazarOrdenModal
- Added state management for modal visibility
- Added handleAprobar and handleRechazar functions
- Added "Aprobación" card with approve/reject buttons
- Buttons only shown for orders in APROBACION, BORRADOR, or PENDIENTE states
- Integrated modals at the end of the component
- Auto-refresh order data after approve/reject actions

**New Functions**:
```typescript
const handleAprobar = async (comentarios?: string) => {
  // Calls POST /api/compras/ordenes/:id/aprobar
  // Reloads order data on success
  // Shows success/error alerts
}

const handleRechazar = async (motivoRechazo: string) => {
  // Calls POST /api/compras/ordenes/:id/rechazar
  // Reloads order data on success
  // Shows success/error alerts
}
```

## UI/UX Design

### Approval Section
- Displayed only for orders in states: APROBACION, BORRADOR, PENDIENTE
- Two buttons:
  - **Aprobar Orden** (Green, emerald-500): Opens approval modal
  - **Rechazar Orden** (Red outline, white background): Opens rejection modal
- Located in the right column of the order detail page
- Positioned above the "Acciones" section

### Modal Design
Both modals follow consistent design patterns:
- Centered overlay with semi-transparent backdrop
- White card with rounded corners and shadow
- Header with icon, title, and close button
- Body with form fields
- Footer with Cancel and Confirm buttons
- Loading states with spinner animation
- Uses global CSS variables for consistent theming

### Color Scheme
- **Approve**: Emerald (success) colors
- **Reject**: Red (error) colors
- **Neutral**: Primary gray colors for text and borders

## Business Logic

### Approval Flow
1. User clicks "Aprobar Orden" button
2. Modal opens with optional comments field
3. User can add comments or leave empty
4. On confirm:
   - API call to `/api/compras/ordenes/:id/aprobar`
   - Backend checks if order is in approvable state
   - Creates approval record in oc_aprobaciones
   - Checks if all required approvals are complete
   - Updates order state (APROBACION or APROBADA)
   - Emits event if fully approved
5. Order data refreshes automatically
6. Success message displayed

### Rejection Flow
1. User clicks "Rechazar Orden" button
2. Modal opens with required rejection reason field
3. User must provide rejection reason
4. On confirm:
   - Validates that reason is not empty
   - API call to `/api/compras/ordenes/:id/rechazar`
   - Backend checks if order is in rejectable state
   - Creates rejection record in oc_aprobaciones
   - Updates order state to ANULADA
5. Order data refreshes automatically
6. Success message displayed

### State Transitions
- **BORRADOR** → APROBADA (if no approval required) or APROBACION (if approval required)
- **PENDIENTE** → APROBADA or APROBACION
- **APROBACION** → APROBADA (when all approvals complete)
- **APROBACION** → ANULADA (when rejected)
- **BORRADOR** → ANULADA (when rejected)
- **PENDIENTE** → ANULADA (when rejected)

## Validation

### Frontend Validation
- **Approve**: No required fields, comments are optional
- **Reject**: Rejection reason is required (validated before API call)

### Backend Validation
- Order must exist
- Order must be in approvable/rejectable state
- For rejection: motivo_rechazo is required (DTO validation)
- Cannot approve already approved orders
- Cannot reject already rejected orders
- Cannot approve orders with existing rejections

## Testing

### Test Script
**File**: `test-aprobar-rechazar-orden.ps1`

**Test Cases**:
1. ✅ Create test proveedor
2. ✅ Create orden in APROBACION state
3. ✅ Get orden details before approval
4. ✅ Approve orden (POST /aprobar)
5. ✅ Verify estado changed to APROBADA
6. ✅ Create another orden for rejection test
7. ✅ Reject orden (POST /rechazar)
8. ✅ Verify estado changed to ANULADA
9. ✅ Validate cannot approve already approved orden
10. ✅ Validate cannot reject already rejected orden

### Running Tests
```powershell
# Start the API server
cd apps/erp-api
npm run start:dev

# In another terminal, run the test script
./test-aprobar-rechazar-orden.ps1
```

### Manual Testing
1. Navigate to an orden detail page: `http://localhost:3000/dashboard/compras/ordenes/:id`
2. Ensure orden is in APROBACION, BORRADOR, or PENDIENTE state
3. Click "Aprobar Orden" button
4. Add optional comments
5. Click "Aprobar Orden" in modal
6. Verify orden state changes to APROBADA
7. Check AprobacionesPanel shows approval record

For rejection:
1. Navigate to another orden in approvable state
2. Click "Rechazar Orden" button
3. Enter rejection reason (required)
4. Click "Rechazar Orden" in modal
5. Verify orden state changes to ANULADA
6. Check AprobacionesPanel shows rejection record

## Integration Points

### With Approvals System
- Creates records in `oc_aprobaciones` table
- Tracks approval/rejection history
- Supports multi-level approvals (nivel field)
- Displays in AprobacionesPanel component

### With Events System
- Emits `OrdenCompraAprobada` event when fully approved
- Event includes order details, items, totals
- Can be consumed by other modules (CxP, Inventario)

### With Notifications
- Notifies approvers when order requires approval
- Can notify requester when order is approved/rejected

## Files Modified/Created

### Created
- ✅ `apps/web/components/compras/AprobarOrdenModal.tsx`
- ✅ `apps/web/components/compras/RechazarOrdenModal.tsx`
- ✅ `test-aprobar-rechazar-orden.ps1`
- ✅ `IMPLEMENTATION_APROBAR_RECHAZAR_OC.md`

### Modified
- ✅ `apps/web/app/dashboard/compras/ordenes/[id]/page.tsx`

### Already Existed (Backend)
- ✅ `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts`
- ✅ `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`
- ✅ `apps/erp-api/src/modules/compras/dto/aprobar-orden-compra.dto.ts`
- ✅ `apps/erp-api/src/modules/compras/dto/rechazar-orden-compra.dto.ts`

## API Documentation

### POST /api/compras/ordenes/:id/aprobar

**Request Body**:
```json
{
  "comentarios": "Aprobado según presupuesto del trimestre",
  "aprobador_id": "uuid-optional",
  "aprobador_nombre": "Juan Pérez (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Orden de compra aprobada exitosamente",
  "data": {
    "id": "uuid",
    "numero": "OC-2024-001",
    "estado": "APROBADA",
    ...
  }
}
```

### POST /api/compras/ordenes/:id/rechazar

**Request Body**:
```json
{
  "motivo_rechazo": "Presupuesto insuficiente para este periodo",
  "rechazado_por_id": "uuid-optional",
  "rechazado_por_nombre": "María García (optional)"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Orden de compra rechazada exitosamente",
  "data": {
    "id": "uuid",
    "numero": "OC-2024-001",
    "estado": "ANULADA",
    ...
  }
}
```

## Future Enhancements

### Potential Improvements
1. **Email Notifications**: Send emails when orders are approved/rejected
2. **Approval Workflow**: Support multi-level approvals with different approval amounts
3. **Approval History**: Show detailed timeline of all approval actions
4. **Bulk Approval**: Allow approving multiple orders at once
5. **Conditional Approvals**: Approve with conditions or partial approval
6. **Approval Delegation**: Allow approvers to delegate to others
7. **Approval Reminders**: Automatic reminders for pending approvals
8. **Approval Analytics**: Dashboard showing approval metrics and bottlenecks

## Conclusion

The approve/reject functionality for purchase orders is now fully implemented with:
- ✅ Complete backend API (already existed)
- ✅ User-friendly modal dialogs
- ✅ Proper validation and error handling
- ✅ Integration with approvals system
- ✅ Comprehensive test script
- ✅ Clean UI using global CSS variables
- ✅ Proper state management and data refresh

The implementation follows best practices and maintains consistency with the existing codebase design patterns.
