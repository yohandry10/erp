# Componentes de Finanzas - Pago en Lote

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_local`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

Este directorio contiene los componentes para la funcionalidad de pago en lote de cuentas por pagar (CxP).

## Componentes

### 1. SeleccionarCxpLote

Componente para seleccionar múltiples cuentas por pagar para procesamiento en lote.

**Características:**
- Selección múltiple de CxP con checkboxes
- Filtros por proveedor, estado y urgencia
- Soporte para pagos parciales (especificar monto menor al saldo)
- Indicadores visuales de urgencia (vencida, hoy, urgente, próxima, normal)
- Resumen en tiempo real del monto total seleccionado
- Validación de moneda (solo muestra CxP de la misma moneda)

**Props:**
```typescript
interface SeleccionarCxpLoteProps {
  cxps: CuentaPorPagar[];
  onSelectionChange: (selectedIds: string[], montosParciales: Record<string, number>) => void;
  monedaFiltro?: string;
}
```

**Ejemplo de uso:**
```tsx
import { SeleccionarCxpLote } from '@/components/finanzas';

function MiComponente() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [montosParciales, setMontosParciales] = useState<Record<string, number>>({});

  const handleSelectionChange = (ids: string[], montos: Record<string, number>) => {
    setSelectedIds(ids);
    setMontosParciales(montos);
  };

  return (
    <SeleccionarCxpLote
      cxps={cuentasPorPagar}
      onSelectionChange={handleSelectionChange}
      monedaFiltro="PEN"
    />
  );
}
```

### 2. PagoLoteWizard

Wizard completo de 3 pasos para procesar pagos en lote.

**Pasos:**
1. **Selección de Cuenta Bancaria**: Seleccionar cuenta, fecha, método de pago
2. **Selección de CxP**: Usar el componente SeleccionarCxpLote para elegir las CxP
3. **Confirmación**: Revisar resumen, validar saldo suficiente y confirmar

**Características:**
- Validación de saldo suficiente en cuenta bancaria
- Cálculo automático de saldo después del pago
- Alertas visuales si el saldo es insuficiente
- Resumen detallado antes de confirmar
- Soporte para referencia de lote y observaciones
- Indicador de progreso visual

**Props:**
```typescript
interface PagoLoteWizardProps {
  cuentasBancarias: CuentaBancaria[];
  cxpsDisponibles: CuentaPorPagar[];
  onSubmit: (data: {
    pagos: Array<{ cxp_id: string; monto?: number }>;
    fecha_pago: string;
    metodo_pago: string;
    cuenta_bancaria_id: string;
    referencia_lote?: string;
    observaciones?: string;
  }) => Promise<void>;
  onCancel: () => void;
}
```

**Ejemplo de uso:**
```tsx
import { PagoLoteWizard } from '@/components/finanzas';

function PaginaPagoLote() {
  const handleSubmit = async (data) => {
    const response = await fetch('/api/finanzas/tesoreria/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      // Mostrar mensaje de éxito
      toast.success('Lote de pagos procesado exitosamente');
    }
  };

  const handleCancel = () => {
    // Cerrar modal o redirigir
    router.push('/dashboard/finanzas/tesoreria');
  };

  return (
    <PagoLoteWizard
      cuentasBancarias={cuentas}
      cxpsDisponibles={cxpsPendientes}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
```

## Integración con Backend

Los componentes están diseñados para trabajar con el endpoint de pago en lote:

**Endpoint:** `POST /api/finanzas/tesoreria/lote`

**Request Body:**
```json
{
  "pagos": [
    { "cxp_id": "uuid-1", "monto": 1500.50 },
    { "cxp_id": "uuid-2" }
  ],
  "fecha_pago": "2025-10-25",
  "metodo_pago": "TRANSFERENCIA",
  "cuenta_bancaria_id": "uuid-cuenta",
  "referencia_lote": "LOTE-2025-001",
  "observaciones": "Pago masivo de proveedores"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lote_id": "LOTE-2025-001",
    "total_pagos": 2,
    "monto_total": 3500.50,
    "pagos_exitosos": 2,
    "pagos_fallidos": 0,
    "cuenta_bancaria": {
      "id": "uuid-cuenta",
      "nombre": "Cuenta Corriente BCP",
      "saldo_anterior": 10000.00,
      "saldo_nuevo": 6499.50
    },
    "pagos": [...]
  }
}
```

## Tipos de Datos

### CuentaPorPagar
```typescript
interface CuentaPorPagar {
  id: string;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  total: number;
  saldo: number;
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA' | 'ANULADA';
  moneda: string;
  proveedor: {
    id: string;
    razon_social: string;
    ruc: string;
  };
  dias_hasta_vencimiento?: number;
  urgencia?: 'VENCIDA' | 'HOY' | 'URGENTE' | 'PROXIMA' | 'NORMAL';
}
```

### CuentaBancaria
```typescript
interface CuentaBancaria {
  id: string;
  nombre: string;
  banco: string;
  numero_cuenta: string;
  moneda: string;
  saldo: number;
}
```

## Notas de Implementación

1. **Validación de Moneda**: El wizard automáticamente filtra las CxP para mostrar solo aquellas que coincidan con la moneda de la cuenta bancaria seleccionada.

2. **Pagos Parciales**: Si no se especifica un monto para una CxP, se asume que se pagará el saldo completo.

3. **Validación de Saldo**: El wizard valida que la cuenta bancaria tenga saldo suficiente antes de permitir confirmar el lote.

4. **Idempotencia**: El backend garantiza idempotencia usando la referencia del lote.

5. **Transaccionalidad**: Todos los pagos del lote se procesan en una transacción. Si alguno falla, se revierten todos.

## Próximos Pasos

- [ ] Agregar soporte para múltiples monedas en un mismo lote (con conversión)
- [ ] Implementar vista previa de impacto en flujo de caja
- [ ] Agregar opción de programar lote para fecha futura
- [ ] Implementar plantillas de lotes recurrentes
