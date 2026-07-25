# Validaciones del Módulo de Ventas

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_local`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

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
Validación de identificación del adquirente/usuario para boletas > S/ 700.

**Regla SUNAT:**
Boletas con monto mayor a S/ 700 deben consignar apellidos y nombres o razón social, y número de documento del adquirente o usuario. Este umbral no genera una GRE automática por sí solo.

**Funciones:**
- `validateBoletaBuyerIdentityRequirement(documentoTipo, total)` - Valida si requiere identificar al adquirente o usuario
- `validateBoletaGRERequirement(documentoTipo, total)` - Alias legacy; no marca GRE por el umbral de S/ 700
- `clientHasRUC(documentoTipo)` - Verifica si cliente tiene RUC
- `getBoletaWarningMessage(documentoTipo, total)` - Obtiene mensaje de advertencia
- `getBuyerIdentityActionMessage(requiresBuyerIdentity)` - Obtiene mensaje de acción

**Uso:**
```typescript
import { validateBoletaBuyerIdentityRequirement } from '@/lib/validations/boleta-validation'

const validation = validateBoletaBuyerIdentityRequirement(
  cliente.documento_tipo,
  pedido.total
)

if (validation.requiresBuyerIdentity) {
  // Mostrar advertencia de identificación requerida
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
Hook para validar identificación del adquirente en boletas.

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

### `BoletaBuyerIdentityWarning`
Muestra advertencia cuando una boleta requiere identificación del adquirente o usuario.

```tsx
<BoletaBuyerIdentityWarning
  documentoTipo={cliente.documento_tipo}
  total={pedido.total}
/>
```

### `BuyerIdentityRequirementBadge`
Badge que indica si se requiere identificación del adquirente o usuario.

```tsx
<BuyerIdentityRequirementBadge
  documentoTipo={cliente.documento_tipo}
  total={pedido.total}
/>
```

Los exports legacy `BoletaGREWarning` y `GRERequirementBadge` se mantienen por compatibilidad, pero el texto visible ya no afirma que el umbral de S/ 700 exija GRE.

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

### 3. Validación de identificación en boleta
- Se ejecuta al calcular totales en pedidos
- Muestra advertencia cuando se acerca al umbral de S/ 700
- Requiere consignar datos de identificación cuando se supera el umbral

### 4. Validación de Certificado Digital
- Se ejecuta antes de generar factura
- Verifica existencia, formato y vigencia del certificado
- Bloquea emisión si el certificado es inválido o está vencido
- Muestra advertencia si el certificado vence en menos de 30 días

## Requisitos Cumplidos

- ✅ **15.1** - Validación de precio > 0
- ✅ **15.2** - Validación de cantidad > 0
- ✅ **15.3** - Validación de límite de 999 ítems
- ✅ **15.4** - Validación de identificación en boleta > S/ 700
- ✅ **15.5** - Validación de certificado digital antes de facturar
- ✅ **19.1** - Validación de RUC (11 dígitos) y DNI (8 dígitos)
- ✅ **19.2** - Validación de RUC (11 dígitos) y DNI (8 dígitos)
- ✅ **19.4** - Validación de identificación en boleta
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

// Test de identificación en boleta
const validation3 = validateBoletaBuyerIdentityRequirement(
  TipoDocumento.DNI,
  750
)
expect(validation3.requiresBuyerIdentity).toBe(true)
expect(validation3.requiresGRE).toBe(false)
```
