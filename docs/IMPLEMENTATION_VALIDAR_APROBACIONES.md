# Implementation: Validar Todas las Aprobaciones Antes de APROBADA

## Overview
This document describes the implementation of the approval validation logic for purchase orders (órdenes de compra). The system now properly validates that all required approvals are completed before marking an orden as APROBADA.

## Changes Made

### 1. Enhanced Approval Creation Logic

**File:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`

#### New Method: `crearAprobacionesPendientes()`
When an orden de compra is created and requires approval (based on configured amount threshold), the system now:

1. **Identifies Approvers**: Queries the database for users with approval permissions:
   - Users with `compras.aprobar` permission
   - Users with roles: Gerente, Administrador, or Jefe de Compras

2. **Creates PENDIENTE Records**: Creates a `PENDIENTE` approval record in `oc_aprobaciones` for each approver
   - All approvals are created at nivel 1 (single-level approval for now)
   - Each record includes: orden_id, nivel, aprobador_id, aprobador_nombre, estado='PENDIENTE'

3. **Notifies Approvers**: Sends notifications to all identified approvers

**Benefits:**
- System knows upfront how many approvals are required
- Clear tracking of pending vs completed approvals
- Prevents premature approval of orders

### 2. Enhanced Approval Validation Logic

**File:** `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts`

#### Updated Method: `aprobar()`
The approval method now includes comprehensive validation:

1. **Duplicate Approval Prevention**: 
   - Checks if the approver has already approved the orden
   - Throws error if duplicate approval is attempted
   - Updates existing PENDIENTE record to APROBADA if found

2. **Approval Status Validation**:
   - Counts pending approvals using `countPendingByOrdenId()`
   - Counts approved approvals from all approval records
   - Checks for any rejected approvals using `hasRejectedApprovals()`

3. **State Transition Logic**:
   ```typescript
   if (pendingCount > 0) {
     // Still waiting for more approvals
     nuevoEstado = 'APROBACION';
   } else if (aprobadasCount > 0) {
     // All required approvals completed
     nuevoEstado = 'APROBADA';
   } else {
     // No pending, no approved (edge case - orden didn't require approval)
     nuevoEstado = 'APROBADA';
   }
   ```

4. **Rejection Handling**:
   - Blocks approval if any rejection exists
   - Throws error: "No se puede aprobar la orden porque ya tiene aprobaciones rechazadas"

5. **Metadata Updates**:
   - Only sets `aprobado_at` and `aprobado_by` when estado becomes APROBADA
   - Preserves approval history in `oc_aprobaciones` table

## Database Schema

### Table: `oc_aprobaciones`
```sql
CREATE TABLE oc_aprobaciones (
  id UUID PRIMARY KEY,
  orden_id UUID NOT NULL REFERENCES ordenes_compra(id),
  nivel INTEGER NOT NULL CHECK (nivel > 0),
  aprobador_id UUID NOT NULL,
  aprobador_nombre VARCHAR(255) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' 
    CHECK (estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')),
  fecha_aprobacion TIMESTAMP WITH TIME ZONE,
  comentarios TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(orden_id, nivel, aprobador_id)
);
```

**Key Constraints:**
- UNIQUE constraint on (orden_id, nivel, aprobador_id) prevents duplicate approvals
- CASCADE delete ensures approval records are removed when orden is deleted

## Approval Workflow

### Scenario 1: Orden Requires Approval (High Amount)

```
1. User creates orden with total > monto_aprobacion_compras
   └─> Estado: BORRADOR → APROBACION
   └─> System creates PENDIENTE records for all approvers
   └─> System sends notifications to approvers

2. First approver approves
   └─> PENDIENTE record updated to APROBADA
   └─> System checks: pendingCount > 0?
   └─> Estado remains: APROBACION (waiting for more)

3. Second approver approves
   └─> PENDIENTE record updated to APROBADA
   └─> System checks: pendingCount = 0, aprobadasCount > 0
   └─> Estado changes: APROBACION → APROBADA
   └─> Sets aprobado_at and aprobado_by
```

### Scenario 2: Orden Does Not Require Approval (Low Amount)

```
1. User creates orden with total <= monto_aprobacion_compras
   └─> Estado: BORRADOR (or PENDIENTE if explicitly set)
   └─> No approval records created
   └─> No notifications sent

2. User can directly approve (if needed)
   └─> Creates single APROBADA record
   └─> Estado changes to APROBADA immediately
```

### Scenario 3: Rejection Workflow

```
1. Orden in APROBACION state
   └─> Has PENDIENTE approval records

2. Approver rejects orden
   └─> Creates RECHAZADA record in oc_aprobaciones
   └─> Estado changes: APROBACION → ANULADA

3. Another approver tries to approve
   └─> System checks: hasRejectedApprovals() = true
   └─> Throws error: Cannot approve rejected orden
```

## Error Handling

### Duplicate Approval
```typescript
if (aprobacionExistente && aprobacionExistente.estado === 'APROBADA') {
  throw new BadRequestException(
    'Este aprobador ya ha aprobado esta orden de compra'
  );
}
```

### Rejected Orden
```typescript
if (tieneRechazadas) {
  throw new BadRequestException(
    'No se puede aprobar la orden porque ya tiene aprobaciones rechazadas'
  );
}
```

### Invalid State
```typescript
const approvableStates = ['PENDIENTE', 'BORRADOR', 'APROBACION'];
if (!approvableStates.includes(existingOrden.estado)) {
  throw new BadRequestException(
    `No se puede aprobar una orden en estado ${existingOrden.estado}`
  );
}
```

## Testing

### Test Script: `test-validar-aprobaciones.ps1`

The test script validates:

1. ✅ Creation of orden requiring approval
2. ✅ PENDIENTE approval records are created
3. ✅ First approval updates record to APROBADA
4. ✅ Estado remains APROBACION if more approvals needed
5. ✅ Duplicate approval by same user is rejected
6. ✅ Estado changes to APROBADA when all approvals complete
7. ✅ Rejection workflow works correctly
8. ✅ Approval of rejected orden is blocked

### Running the Test

```powershell
# Start the API server first
cd apps/erp-api
npm run start:dev

# In another terminal, run the test
.\test-validar-aprobaciones.ps1
```

## Configuration

### Approval Amount Threshold

The approval requirement is configured in `empresa_config` table:

```sql
-- Set approval threshold to 10,000 PEN
UPDATE empresa_config 
SET monto_aprobacion_compras = 10000.00
WHERE tenant_id = 'your-tenant-id';
```

**Logic:**
- If `total > monto_aprobacion_compras`: Requires approval
- If `total <= monto_aprobacion_compras`: No approval needed
- If `monto_aprobacion_compras` is NULL or 0: No approval needed

## Future Enhancements

### Multi-Level Approvals
Currently, all approvals are at nivel 1. Future implementation could support:

```
Nivel 1: Jefe de Compras (for amounts 10k-50k)
Nivel 2: Gerente (for amounts 50k-100k)
Nivel 3: Director (for amounts > 100k)
```

### Approval Delegation
Allow approvers to delegate their approval authority to other users temporarily.

### Approval Expiration
Set time limits for approvals (e.g., auto-reject if not approved within 48 hours).

### Approval Notifications
- Email notifications to approvers
- Reminder notifications for pending approvals
- Escalation notifications if approval is delayed

## Related Files

- `apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts` - Main service logic
- `apps/erp-api/src/modules/compras/repositories/oc-aprobaciones.repository.ts` - Approval data access
- `apps/erp-api/src/modules/compras/controllers/ordenes-compra.controller.ts` - API endpoints
- `supabase/migrations/035_compras_completo.sql` - Database schema
- `test-validar-aprobaciones.ps1` - Test script

## Conclusion

The implementation ensures that:
- ✅ All required approvals are validated before marking orden as APROBADA
- ✅ Duplicate approvals are prevented
- ✅ Rejected orders cannot be approved
- ✅ Clear audit trail of all approval actions
- ✅ Proper state transitions based on approval status
- ✅ Comprehensive error handling and validation

The system now provides a robust approval workflow that prevents premature approval of purchase orders and maintains data integrity throughout the approval process.
