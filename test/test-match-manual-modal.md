# Test: Match Manual Modal Component

## Component Created
✅ `apps/web/components/finanzas/MatchManualModal.tsx`

## Integration Page Created
✅ `apps/web/app/dashboard/finanzas/conciliacion/[id]/page.tsx`

## Features Implemented

### MatchManualModal Component
1. **Dual Panel Selection UI**
   - Left panel: Movimientos del Sistema (blue theme)
   - Right panel: Movimientos del Extracto (green theme)
   - Visual selection with hover states and active states

2. **Smart Filtering**
   - Only shows non-conciliated movements
   - Filters by date range from conciliación
   - Filters by cuenta_bancaria_id

3. **Match Validation**
   - Validates that both movements have the same type (ABONO/CARGO)
   - Shows warning if types don't match
   - Calculates and displays difference between amounts

4. **Match Summary**
   - Shows selected movements side by side
   - Displays monto sistema, monto extracto, and difference
   - Color-coded difference (green if 0, orange if > 0)

5. **API Integration**
   - Loads conciliación details
   - Loads movimientos from both sources
   - Calls POST /api/finanzas/conciliacion/:id/marcar-item
   - Refreshes parent page on success

### Conciliación Detail Page
1. **Header Section**
   - Shows conciliación period and status
   - Displays bank account information

2. **Summary Cards**
   - Período with date range
   - Saldo Libro
   - Saldo Banco
   - Diferencia (color-coded)

3. **Action Buttons**
   - Match Manual (opens modal)
   - Match Automático (placeholder)
   - Importar Extracto CSV (placeholder)
   - All disabled when conciliación is CERRADA

4. **Dual Panel View**
   - Movimientos del Sistema Pendientes
   - Movimientos del Extracto Pendientes
   - Shows count in header

5. **Conciliated Movements Table**
   - Shows all conciliated movements
   - Table format with date, type, description, amount

## API Endpoints Used

### GET /api/finanzas/conciliacion/:id
Returns conciliación details including:
- periodo, estado, fecha_desde, fecha_hasta
- saldo_libro, saldo_banco, diferencia
- cuenta_bancaria_id and bank details

### GET /api/finanzas/bancos/cuentas/:id/movimientos
Query params:
- fecha_desde, fecha_hasta
- conciliado (true/false)
- es_extracto (true/false)
- conciliacion_id (for extracto movements)

### POST /api/finanzas/conciliacion/:id/marcar-item
Body:
```json
{
  "movimiento_sistema_id": "uuid",
  "movimiento_extracto_id": "uuid",
  "diferencia": 0.00 (optional)
}
```

## User Flow

1. User navigates to conciliación detail page
2. Page loads conciliación data and movimientos
3. User clicks "Match Manual" button
4. Modal opens showing two panels:
   - Left: Movimientos del Sistema (not conciliated)
   - Right: Movimientos del Extracto (not conciliated)
5. User clicks on a movement in left panel (highlights in blue)
6. User clicks on a movement in right panel (highlights in green)
7. Match summary appears showing:
   - Monto Sistema
   - Monto Extracto
   - Diferencia
8. If types match, "Realizar Match" button is enabled
9. User clicks "Realizar Match"
10. API call is made to marcar-item endpoint
11. On success:
    - Modal closes
    - Parent page reloads data
    - Matched movements appear in "Conciliados" section
    - Counts update in pending sections

## Validation Rules

1. **Type Matching**: Sistema and Extracto movements must have same type
   - ABONO can only match with ABONO
   - CARGO can only match with CARGO

2. **Conciliación State**: Cannot match if conciliación is CERRADA

3. **Already Conciliated**: Cannot select movements that are already conciliated

4. **Selection Required**: Both sistema and extracto movements must be selected

## Visual Design

### Color Scheme
- Sistema movements: Blue (#3B82F6)
- Extracto movements: Green (#10B981)
- ABONO badges: Green background
- CARGO badges: Red background
- Difference = 0: Green text
- Difference > 0: Orange text

### Responsive Design
- Modal: max-width 6xl (1280px)
- Grid layout: 2 columns on desktop
- Scrollable panels: max-height 96 (384px)
- Mobile-friendly with proper spacing

## Testing Checklist

- [ ] Modal opens when clicking "Match Manual" button
- [ ] Movimientos load correctly in both panels
- [ ] Selection highlights work properly
- [ ] Type validation prevents mismatched types
- [ ] Match summary calculates difference correctly
- [ ] API call succeeds with valid data
- [ ] Parent page refreshes after successful match
- [ ] Modal closes after successful match
- [ ] Error messages display properly
- [ ] Loading states work correctly
- [ ] Disabled states work when conciliación is CERRADA

## Next Steps

To complete the conciliación feature, implement:
1. Match Automático functionality
2. Importar Extracto CSV functionality
3. Cerrar Conciliación functionality
4. Diferencias report
5. List page for all conciliaciones
