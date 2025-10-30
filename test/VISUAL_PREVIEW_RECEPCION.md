# Visual Guide: Vista Previa de Recepción

## Step 4 - Confirmar Recepción

### Layout Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        RECEPCION WIZARD                              │
│                                                                      │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●  │
│  1 Cantidades  →  2 Calidad  →  3 Almacén/Lotes  →  4 Confirmar    │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●  │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  OC-2024-001                                                         │
│  Proveedor ABC S.A.C. - RUC: 20123456789                           │
│  3 productos pendientes                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              CONFIRMAR RECEPCIÓN                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  TOTAL   │  │    OK    │  │OBSERVADO │  │RECHAZADO │          │
│  │  ITEMS   │  │          │  │          │  │          │          │
│  │   (🔵)   │  │   (🟢)   │  │   (🟡)   │  │   (🔴)   │          │
│  │          │  │          │  │          │  │          │          │
│  │    15    │  │    12    │  │     2    │  │     1    │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ TABLA DETALLADA                                              │   │
│  ├──────────┬────────┬────────┬─────────────┬──────────────────┤   │
│  │ Producto │Cantidad│Calidad │Almacén/Lote │ Observaciones    │   │
│  ├──────────┼────────┼────────┼─────────────┼──────────────────┤   │
│  │Laptop HP │   5    │ ✓ OK   │Almacén Ppal │        -         │   │
│  │LAP-001   │        │        │Lote: L-2024 │                  │   │
│  ├──────────┼────────┼────────┼─────────────┼──────────────────┤   │
│  │Mouse USB │   7    │ ✓ OK   │Almacén Ppal │        -         │   │
│  │MOU-001   │        │        │Ubic: A-01   │                  │   │
│  ├──────────┼────────┼────────┼─────────────┼──────────────────┤   │
│  │Teclado   │   2    │⚠OBSERV │Almacén Ppal │Empaque dañado    │   │
│  │TEC-001   │        │        │Lote: L-2025 │pero funcional    │   │
│  ├──────────┼────────┼────────┼─────────────┼──────────────────┤   │
│  │Monitor   │   1    │✗RECHAZ │Almacén Ppal │Pantalla rota,    │   │
│  │MON-001   │        │        │             │devolver          │   │
│  └──────────┴────────┴────────┴─────────────┴──────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  ← Anterior                      Completar Recepción ✓  →   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Summary Cards

#### Total Items (Blue)
```
┌─────────────────┐
│  Total Items    │  ← Label: #3b82f6 (0.75rem)
│                 │
│       15        │  ← Number: #3b82f6 (2rem, bold)
└─────────────────┘
Background: #eff6ff
Border: 1px solid #3b82f6
```

#### OK Items (Green)
```
┌─────────────────┐
│      OK         │  ← Label: #10b981 (0.75rem)
│                 │
│       12        │  ← Number: #10b981 (2rem, bold)
└─────────────────┘
Background: #f0fdf4
Border: 1px solid #10b981
```

#### Observados (Yellow)
```
┌─────────────────┐
│  Observados     │  ← Label: #f59e0b (0.75rem)
│                 │
│        2        │  ← Number: #f59e0b (2rem, bold)
└─────────────────┘
Background: #fffbeb
Border: 1px solid #f59e0b
```

#### Rechazados (Red)
```
┌─────────────────┐
│  Rechazados     │  ← Label: #ef4444 (0.75rem)
│                 │
│        1        │  ← Number: #ef4444 (2rem, bold)
└─────────────────┘
Background: #fef2f2
Border: 1px solid #ef4444
```

## Quality Badges

### OK Badge
```
┌──────────────┐
│ ✓ OK         │  Green background (#10b981)
└──────────────┘  White text, CheckCircle icon
```

### OBSERVADO Badge
```
┌──────────────┐
│ ⚠ OBSERVADO  │  Yellow background (#f59e0b)
└──────────────┘  White text, AlertCircle icon
```

### RECHAZADO Badge
```
┌──────────────┐
│ ✗ RECHAZADO  │  Red background (#ef4444)
└──────────────┘  White text, XCircle icon
```

## Table Structure

### Header Row
```
┌────────────────────────────────────────────────────────────────┐
│ Producto │ Cantidad │ Calidad │ Almacén/Ubicación │ Observ.   │
└────────────────────────────────────────────────────────────────┘
Background: #f9fafb
Text: #6b7280 (0.75rem, weight 600)
Border bottom: 1px solid #e5e7eb
```

### Data Row
```
┌────────────────────────────────────────────────────────────────┐
│ Laptop HP  │    5     │ ✓ OK    │ Almacén Ppal  │      -      │
│ LAP-001    │          │         │ Lote: L-2024  │             │
└────────────────────────────────────────────────────────────────┘
Background: white
Border bottom: 1px solid #e5e7eb
Padding: 0.75rem
```

## Responsive Behavior

### Desktop (> 1024px)
```
┌─────────┬─────────┬─────────┬─────────┐
│ Total   │   OK    │ Observ  │ Rechaz  │
│  Items  │         │         │         │
└─────────┴─────────┴─────────┴─────────┘
        4 columns side by side
```

### Tablet (768px - 1024px)
```
┌─────────┬─────────┐
│ Total   │   OK    │
│  Items  │         │
├─────────┼─────────┤
│ Observ  │ Rechaz  │
│         │         │
└─────────┴─────────┘
        2 columns, 2 rows
```

### Mobile (< 768px)
```
┌─────────┐
│ Total   │
│  Items  │
├─────────┤
│   OK    │
│         │
├─────────┤
│ Observ  │
│         │
├─────────┤
│ Rechaz  │
│         │
└─────────┘
    1 column, 4 rows
```

## Data Display Examples

### Example 1: Item with Full Information
```
┌──────────────────────────────────────────────────────────┐
│ Laptop HP Pavilion 15                                    │
│ LAP-HP-001                                               │
├──────────────────────────────────────────────────────────┤
│ Cantidad: 5                                              │
│ Calidad: ✓ OK                                            │
│                                                          │
│ Almacén: Almacén Principal                               │
│ Ubicación: A-01                                          │
│ Lote: LOTE-2024-001                                      │
│ Serie: SN-123456789                                      │
│ Exp: 31/12/2025                                          │
│                                                          │
│ Observaciones: -                                         │
└──────────────────────────────────────────────────────────┘
```

### Example 2: Item with Observations
```
┌──────────────────────────────────────────────────────────┐
│ Teclado Mecánico RGB                                     │
│ TEC-RGB-001                                              │
├──────────────────────────────────────────────────────────┤
│ Cantidad: 2                                              │
│ Calidad: ⚠ OBSERVADO                                     │
│                                                          │
│ Almacén: Almacén Principal                               │
│ Lote: LOTE-2024-002                                      │
│                                                          │
│ Observaciones: Empaque exterior dañado pero producto     │
│                en buen estado. Funciona correctamente.   │
└──────────────────────────────────────────────────────────┘
```

### Example 3: Rejected Item
```
┌──────────────────────────────────────────────────────────┐
│ Monitor LED 24"                                          │
│ MON-LED-001                                              │
├──────────────────────────────────────────────────────────┤
│ Cantidad: 1                                              │
│ Calidad: ✗ RECHAZADO                                     │
│                                                          │
│ Almacén: Almacén Principal                               │
│                                                          │
│ Observaciones: Pantalla rota, no enciende. Solicitar    │
│                devolución inmediata al proveedor.        │
└──────────────────────────────────────────────────────────┘
```

## User Interaction Flow

```
┌─────────────────────────────────────────────────────────┐
│                    USER ARRIVES AT STEP 4                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              VIEW SUMMARY CARDS                          │
│  • Check total items count                              │
│  • Review quality distribution                           │
│  • Identify any rejected items                           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              REVIEW DETAILED TABLE                       │
│  • Verify each product                                   │
│  • Check quantities                                      │
│  • Confirm quality assignments                           │
│  • Review warehouse/lot assignments                      │
│  • Read observations                                     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                    ┌─────────┐
                    │ Correct?│
                    └─────────┘
                    │         │
              YES   │         │   NO
                    │         │
                    ▼         ▼
        ┌──────────────┐  ┌──────────────┐
        │  COMPLETAR   │  │  ← ANTERIOR  │
        │  RECEPCIÓN   │  │              │
        └──────────────┘  └──────────────┘
                │                 │
                ▼                 ▼
        ┌──────────────┐  ┌──────────────┐
        │   SUBMIT     │  │  GO BACK TO  │
        │   LOADING    │  │   STEP 3     │
        └──────────────┘  └──────────────┘
                │                 │
                ▼                 ▼
        ┌──────────────┐  ┌──────────────┐
        │   SUCCESS    │  │  MODIFY DATA │
        │   MESSAGE    │  │              │
        └──────────────┘  └──────────────┘
                │                 │
                ▼                 │
        ┌──────────────┐         │
        │  onComplete()│         │
        │   CALLBACK   │         │
        └──────────────┘         │
                                 │
                                 ▼
                        ┌──────────────┐
                        │ RETURN TO    │
                        │ STEP 4       │
                        └──────────────┘
```

## Animation & Transitions

### Card Hover Effect
```
Normal State:
  box-shadow: 0 1px 3px rgba(0,0,0,0.1)

Hover State:
  box-shadow: 0 4px 6px rgba(0,0,0,0.1)
  transform: translateY(-2px)
  transition: all 0.2s ease
```

### Button States

#### Normal
```
┌──────────────────────────┐
│  Completar Recepción ✓   │  Background: #10b981
└──────────────────────────┘  Color: white
```

#### Hover
```
┌──────────────────────────┐
│  Completar Recepción ✓   │  Background: #059669 (darker)
└──────────────────────────┘  Cursor: pointer
```

#### Loading
```
┌──────────────────────────┐
│  ⟳ Procesando...         │  Background: #10b981
└──────────────────────────┘  Opacity: 0.7
                              Cursor: not-allowed
```

## Accessibility

### Keyboard Navigation
- Tab: Move between buttons
- Enter: Activate button
- Shift+Tab: Move backwards

### Screen Reader Support
- Cards have aria-labels with values
- Table has proper headers
- Buttons have descriptive text
- Loading states announced

### Color Contrast
All text meets WCAG AA standards:
- Blue text on light blue: 4.5:1
- Green text on light green: 4.5:1
- Yellow text on light yellow: 4.5:1
- Red text on light red: 4.5:1

## Print View

When printing, the preview shows:
- Company header
- Order information
- Summary statistics
- Complete table
- Footer with date/time

```
┌─────────────────────────────────────────────────────────┐
│                    EMPRESA XYZ S.A.C.                    │
│              RECEPCIÓN DE MERCANCÍA                      │
├─────────────────────────────────────────────────────────┤
│ Orden: OC-2024-001                                       │
│ Proveedor: ABC S.A.C.                                    │
│ Fecha: 25/10/2025                                        │
├─────────────────────────────────────────────────────────┤
│ RESUMEN:                                                 │
│ Total Items: 15 | OK: 12 | Observados: 2 | Rechazados: 1│
├─────────────────────────────────────────────────────────┤
│ [TABLA COMPLETA]                                         │
├─────────────────────────────────────────────────────────┤
│ Impreso: 25/10/2025 14:30                               │
└─────────────────────────────────────────────────────────┘
```

---

This visual guide provides a comprehensive overview of the preview functionality's appearance and behavior.
