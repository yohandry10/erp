# Cotización Wizard Implementation

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

## Overview
Implemented a multi-step wizard for creating purchase quotations (cotizaciones de compra) with a clean, intuitive user interface.

## Files Created

### 1. CotizacionCompraWizard.tsx
**Location:** `apps/web/components/compras/CotizacionCompraWizard.tsx`

**Features:**
- Multi-step wizard with 3 steps:
  1. **Basic Information**: Cotización number, supplier, date, validity days, and observations
  2. **Add Products**: Select products, specify quantities and unit prices
  3. **Review**: Final review of all information before submission

**Key Components:**
- Form validation using React Hook Form + Zod
- Real-time calculation of subtotals, IGV (18%), and total
- Product management (add/remove products)
- Responsive design with consistent styling
- Loading states for async operations

**Step 1: Basic Information**
- Auto-generated cotización number (COT-YYYY-XXXXXX)
- Supplier dropdown (loads active suppliers from API)
- Date picker for cotización date
- Validity days input (default: 30 days)
- Optional observations textarea

**Step 2: Add Products**
- Product dropdown (loads from inventario API)
- Quantity and unit price inputs
- Add button to add products to the list
- Products table showing:
  - Product description
  - Quantity
  - Unit price
  - Subtotal
  - Remove action button
- Empty state when no products added

**Step 3: Review**
- Summary of basic information
- Complete products table
- Totals breakdown:
  - Subtotal
  - IGV (18%)
  - Total amount
- Calculated expiration date based on validity days

**Navigation:**
- Back button (or Cancel on step 1)
- Next button (steps 1-2)
- Create Cotización button (step 3)
- Step indicator showing progress

### 2. Nueva Cotización Page
**Location:** `apps/web/app/dashboard/compras/cotizaciones/nueva/page.tsx`

**Features:**
- Page wrapper for the wizard component
- API integration for creating cotizaciones
- Success/error handling
- Navigation back to cotizaciones list
- Loading state management

## API Integration

### Endpoints Used:
1. `GET /api/compras/proveedores?activo=true` - Load active suppliers
2. `GET /api/inventario/productos` - Load products
3. `POST /api/compras/cotizaciones` - Create new cotización

### Data Structure Sent:
```typescript
{
  numero: string,
  proveedor_id: string,
  fecha_cotizacion: string,
  validez_dias: number,
  observaciones?: string,
  estado: 'BORRADOR',
  detalles: [
    {
      producto_id: string,
      descripcion: string,
      cantidad: number,
      precio_unitario: number
    }
  ]
}
```

## Validation

### Step 1 Validation (Zod Schema):
- `numero`: Required, non-empty string
- `proveedor_id`: Required, non-empty string
- `fecha_cotizacion`: Required, valid date string
- `validez_dias`: Required, minimum 1 day
- `observaciones`: Optional string

### Step 2 Validation:
- At least one product must be added
- Quantity must be greater than 0
- Price cannot be negative

## User Experience

### Visual Feedback:
- Step indicator shows current progress
- Completed steps marked with checkmark
- Active step highlighted in blue
- Form validation errors displayed inline
- Loading states for async operations
- Confirmation dialog on cancel

### Responsive Design:
- Grid layout adapts to screen size
- Tables scroll horizontally on small screens
- Buttons stack appropriately on mobile

## Styling
- Consistent with existing ERP design system
- Uses Tailwind utilities with semantic tokens (`bg-card`, `text-foreground`, `border-border`)
- Uses shadcn/Radix primitives for shared interactive patterns
- Color scheme matches the application theme

## Future Enhancements
- Product search/filter functionality
- Bulk product import
- Save as draft functionality
- Product suggestions based on supplier
- Price history from previous quotations
- Duplicate quotation feature
- Print/PDF export from review step

## Testing Recommendations
1. Test with empty supplier list
2. Test with empty product list
3. Test form validation on each step
4. Test product add/remove functionality
5. Test calculation accuracy (subtotal, IGV, total)
6. Test navigation between steps
7. Test cancel confirmation
8. Test API error handling
9. Test with various validity days
10. Test date calculations for expiration

## Notes
- The wizard automatically calculates IGV at 18% (Peru standard)
- Cotización number is auto-generated with timestamp
- Default validity is 30 days
- All cotizaciones start in 'BORRADOR' (draft) state
- Currency formatting uses PEN (Peruvian Soles)
