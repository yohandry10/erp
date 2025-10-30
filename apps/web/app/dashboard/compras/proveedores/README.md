# Proveedores Page - Implementation

## Overview
This page implements the "Lista de proveedores con filtros" task from TASK 2.8 of the Fase 2 Compras module.

## Features Implemented

### 1. **Proveedores List with Filters**
- ✅ Search by RUC, razón social, or nombre comercial
- ✅ Filter by status (Activo/Inactivo)
- ✅ Filter by payment conditions (Contado, Crédito 7/15/30/45/60/90 días)
- ✅ Pagination support (10 items per page)
- ✅ Real-time filtering with automatic page reset

### 2. **Statistics Cards**
- Total proveedores count
- Active proveedores count
- Inactive proveedores count

### 3. **Data Display**
- Comprehensive table showing:
  - RUC
  - Razón Social (with nombre comercial as subtitle)
  - Contact information (contacto, email, teléfono)
  - Payment conditions with visual badges
  - Credit limit formatted as currency
  - Status badge (ACTIVO/INACTIVO)
  - Action buttons (View, Edit, Delete/Deactivate)

### 4. **Actions**
- View proveedor details (navigates to `/dashboard/compras/proveedores/:id`)
- Edit proveedor (navigates to `/dashboard/compras/proveedores/:id/editar`)
- Deactivate proveedor (soft delete with confirmation)
- Create new proveedor (navigates to `/dashboard/compras/proveedores/nuevo`)
- Import/Export buttons (placeholders for future implementation)
- Refresh data button

### 5. **Pagination**
- Smart pagination with up to 5 page buttons
- Previous/Next navigation
- Shows current range and total count
- Disabled state for boundary pages

### 6. **Empty States**
- No proveedores: Shows call-to-action to create first proveedor
- No results: Shows message when filters return no results

## API Integration

### Endpoint Used
- `GET /api/compras/proveedores`

### Query Parameters
- `search`: Search term for RUC, razón social, or nombre comercial
- `activo`: Filter by active status (true/false)
- `condiciones_pago`: Filter by payment conditions
- `limit`: Number of items per page (default: 10)
- `offset`: Pagination offset

## Type Definitions

Created new type file: `apps/web/types/compras.ts`

```typescript
export interface Proveedor {
  id: string
  tenant_id: string
  ruc: string
  razon_social: string
  nombre_comercial?: string
  direccion?: string
  telefono?: string
  email?: string
  contacto?: string
  condiciones_pago?: string
  limite_credito?: number
  activo: boolean
  created_at: string
  updated_at: string
}
```

## Dependencies
- `lucide-react`: Icons (Search, Plus, Download, Upload, Edit, Trash2, Eye, Building2, RefreshCw, Filter)
- `next/navigation`: Router for navigation
- `@/hooks/use-api`: Custom API hook for data fetching
- `@/types/compras`: Type definitions

## Styling
Uses existing dashboard CSS classes:
- `dashboard-container`
- `dashboard-header`
- `dashboard-title`
- `dashboard-subtitle`
- `stats-grid`
- `stat-card`
- `activity-section`
- `activity-card`
- `refresh-btn`

## Future Enhancements
The following features are placeholders and need implementation:
1. Import proveedores functionality
2. Export proveedores functionality
3. Detail view page (`/dashboard/compras/proveedores/:id`)
4. Edit page (`/dashboard/compras/proveedores/:id/editar`)
5. Create page (`/dashboard/compras/proveedores/nuevo`)

## Testing
To test the page:
1. Navigate to `/dashboard/compras/proveedores`
2. Try different filter combinations
3. Test pagination
4. Test search functionality
5. Verify API integration with backend

## Notes
- The page uses the existing `useApi` hook for consistent API calls
- All filters trigger automatic page reset to page 1
- Soft delete only shows for active proveedores
- Currency formatting uses Peruvian Soles (PEN)
