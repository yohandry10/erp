# Validaciones del Módulo de Ventas

Este directorio contiene todas las validaciones y reglas de negocio para el módulo de ventas del sistema ERP.

## Archivos

### `ventas.ts`
Schemas de validación Zod para formularios de ventas.

**Schemas incluidos:**
- `clienteSchema` - Validación completa de cliente
- `clienteQuickCreateSchema` - Validación para creación rápida de cliente
- `detalleItemSchema` - Validación de ítems de productos
- `cotizacionSchema` - Validación de cotizaciones
- `pedidoSchema` - Validación de pedidos

**Validaciones específicas:**
- RUC: Exactamente 11 dígitos numéricos
- DNI: Exactamente 8 dígitos numéricos
- Precio unitario: Mayor o igual a 0
- Cantidad: Mayor a 0
- Máximo 999 ítems por documento

**Uso:**
```typescript
import { clienteSchema, type ClienteFormData } from '@/lib/validations/ventas'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

const form = useForm<ClienteFormData>({
  resolver: zodResolver(clienteSchema)
})
```

### `item-limit.ts`
Validación del límite de 999 ítems por documento (requisito SUNAT).

**Funciones:**
- `validateItemLimit(itemCount)` - Valida si se excede el límite
- `canAddMoreItems(currentCount, itemsToAdd)` - Verifica si se pueden agregar más ítems
- `getRemainingItemsCount(currentCount)` - Obtiene ítems restantes
- `getItemLimitWarning(currentCount)` - Obtiene mensaje de advertencia

**Uso:**
```typescript
import { validateItemLimit } from '@/lib/validations/item-limit'

const validation = validateItemLimit(items.length)
if (!validation.isValid) {
  toast.error(validation.message)
}
```

### `boleta-validation.ts`
Validación de requisito de GRE para boletas sin RUC > S/ 700.

**Regla SUNAT:**
Boletas emitidas a clientes sin RUC con monto mayor a S/ 700 requieren Guía de Remisión Electrónica (GRE).

**Funciones:**
- `validateBoletaGRERequirement(documentoTipo, total)` - Valida si requiere GRE
- `clientHasRUC(documentoTipo)` - Verifica si cliente tiene RUC
- `getBoletaWarningMessage(documentoTipo, total)` - Obtiene mensaje de advertencia
- `getGREActionMessage(requiresGRE)` - Obtiene mensaje de acción

**Uso:**
```typescript
import { validateBoletaGRERequirement } from '@/lib/validations/boleta-validation'

const validation = validateBoletaGRERequirement(
  cliente.documento_tipo,
  pedido.total
)

if (validation.requiresGRE) {
  // Mostrar advertencia de GRE requerida
}
```

### `certificate-validation.ts`
Validación de certificado digital antes de generar facturas.

**Validaciones:**
- Existencia del certificado
- Formato válido (PFX/P12)
- Fecha de vencimiento
- Advertencias de vencimiento próximo (30 días)

**Funciones:**
- `validateCertificateResponse(validation)` - Valida respuesta del API
- `getCertificateStatus(validation)` - Obtiene estado del certificado
- `getCertificateErrorMessage(errors)` - Obtiene mensaje de error
- `getCertificateWarningMessage(warnings)` - Obtiene mensaje de advertencia
- `getCertificateActionMessage(validation)` - Obtiene mensaje de acción

**Uso:**
```typescript
import { validateCertificateResponse } from '@/lib/validations/certificate-validation'

const response = validateCertificateResponse(validation)
if (!response.canProceed) {
  toast.error(response.message)
}
```

## Hooks

### `use-item-limit.ts`
Hook para validar límite de ítems en tiempo real.

```typescript
import { useItemLimit } from '@/hooks/use-item-limit'

const { validation, canAddMore, warningMessage } = useItemLimit(items.length)
```

### `use-boleta-validation.ts`
Hook para validar requisito de GRE en boletas.

```typescript
import { useBoletaValidation } from '@/hooks/use-boleta-validation'

const { validation, warningMessage } = useBoletaValidation(
  cliente.documento_tipo,
  pedido.total
)
```

### `use-certificate-validation.ts`
Hook para validar certificado digital.

```typescript
import { useCertificateValidation } from '@/hooks/use-certificate-validation'

const { validation, canProceed, errorMessage } = useCertificateValidation()
```

## Componentes

### `ItemLimitWarning`
Muestra advertencia cuando se acerca o alcanza el límite de 999 ítems.

```tsx
<ItemLimitWarning itemCount={items.length} />
```

### `ItemCountBadge`
Badge que muestra el conteo de ítems con código de colores.

```tsx
<ItemCountBadge itemCount={items.length} />
```

### `BoletaGREWarning`
Muestra advertencia cuando una boleta sin RUC requiere GRE.

```tsx
<BoletaGREWarning 
  documentoTipo={cliente.documento_tipo}
  total={pedido.total}
/>
```

### `GRERequirementBadge`
Badge que indica si se requiere GRE.

```tsx
<GRERequirementBadge 
  documentoTipo={cliente.documento_tipo}
  total={pedido.total}
/>
```

### `CertificateValidationAlert`
Muestra el estado de validación del certificado digital.

```tsx
<CertificateValidationAlert />
```

### `CertificateStatusBadge`
Badge que muestra el estado del certificado.

```tsx
<CertificateStatusBadge />
```

### `PreInvoiceValidation`
Wrapper que valida certificado antes de permitir generar factura.

```tsx
<PreInvoiceValidation onValidationSuccess={handleGenerateInvoice}>
  <Button>Generar Factura</Button>
</PreInvoiceValidation>
```

### `ValidationChecklist`
Checklist de todas las validaciones pre-emisión.

```tsx
<ValidationChecklist />
```

## Flujo de Validación

### 1. Validación de Formularios (Zod)
- Se ejecuta en tiempo real mientras el usuario completa formularios
- Valida formato de documentos (RUC, DNI)
- Valida rangos de valores (precio > 0, cantidad > 0)

### 2. Validación de Límite de Ítems
- Se ejecuta al agregar productos a cotización/pedido
- Muestra advertencia cuando quedan menos de 10 ítems disponibles
- Bloquea agregar más ítems cuando se alcanza el límite de 999

### 3. Validación de Boleta sin RUC
- Se ejecuta al calcular totales en pedidos
- Muestra advertencia cuando se acerca al umbral de S/ 700
- Requiere GRE cuando se supera el umbral

### 4. Validación de Certificado Digital
- Se ejecuta antes de generar factura
- Verifica existencia, formato y vigencia del certificado
- Bloquea emisión si el certificado es inválido o está vencido
- Muestra advertencia si el certificado vence en menos de 30 días

## Requisitos Cumplidos

- ✅ **15.1** - Validación de precio > 0
- ✅ **15.2** - Validación de cantidad > 0
- ✅ **15.3** - Validación de límite de 999 ítems
- ✅ **15.4** - Validación de boleta sin RUC > S/ 700
- ✅ **15.5** - Validación de certificado digital antes de facturar
- ✅ **19.1** - Validación de RUC (11 dígitos) y DNI (8 dígitos)
- ✅ **19.2** - Validación de RUC (11 dígitos) y DNI (8 dígitos)
- ✅ **19.4** - Validación de boleta sin RUC
- ✅ **19.5** - Validación de límite de ítems
- ✅ **19.6** - Validación de certificado vigente
- ✅ **19.7** - Mensaje claro si certificado ausente o vencido

## Integración con Backend

Las validaciones frontend complementan las validaciones backend:

- **Frontend**: Validación inmediata para mejor UX
- **Backend**: Validación definitiva para seguridad

El backend tiene endpoints de validación en:
- `/api/validations/certificate` - Validación de certificado
- `/api/validations/ruc` - Validación de RUC
- `/api/validations/document` - Validación de documento

## Testing

Para probar las validaciones:

```typescript
// Test de validación de cliente
const result = clienteSchema.safeParse({
  tipo: TipoCliente.EMPRESA,
  documento_tipo: TipoDocumento.RUC,
  documento_numero: '20123456789', // 11 dígitos
  razon_social: 'Mi Empresa SAC'
})

// Test de límite de ítems
const validation = validateItemLimit(999)
expect(validation.isValid).toBe(true)

const validation2 = validateItemLimit(1000)
expect(validation2.isValid).toBe(false)

// Test de boleta GRE
const validation3 = validateBoletaGRERequirement(
  TipoDocumento.DNI,
  750
)
expect(validation3.requiresGRE).toBe(true)
```
