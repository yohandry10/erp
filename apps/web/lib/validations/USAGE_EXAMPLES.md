# Ejemplos de Uso - Validaciones de Ventas

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_local`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

## 1. Formulario de Cliente con Validación Zod

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clienteSchema, type ClienteFormData } from '@/lib/validations/ventas'
import { TipoCliente, TipoDocumento } from '@/types/ventas'

export function ClienteForm() {
  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      tipo: TipoCliente.EMPRESA,
      documento_tipo: TipoDocumento.RUC,
      documento_numero: '',
      razon_social: '',
      email: '',
      telefono: ''
    }
  })

  const onSubmit = async (data: ClienteFormData) => {
    try {
      const response = await fetch('/api/ventas/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (response.ok) {
        toast.success('Cliente creado exitosamente')
      }
    } catch (error) {
      toast.error('Error al crear cliente')
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label>Tipo de Documento</label>
        <select {...form.register('documento_tipo')}>
          <option value={TipoDocumento.RUC}>RUC</option>
          <option value={TipoDocumento.DNI}>DNI</option>
        </select>
        {form.formState.errors.documento_tipo && (
          <p className="text-red-600">{form.formState.errors.documento_tipo.message}</p>
        )}
      </div>

      <div>
        <label>Número de Documento</label>
        <input {...form.register('documento_numero')} />
        {form.formState.errors.documento_numero && (
          <p className="text-red-600">{form.formState.errors.documento_numero.message}</p>
        )}
      </div>

      <div>
        <label>Razón Social</label>
        <input {...form.register('razon_social')} />
        {form.formState.errors.razon_social && (
          <p className="text-red-600">{form.formState.errors.razon_social.message}</p>
        )}
      </div>

      <button type="submit">Guardar Cliente</button>
    </form>
  )
}
```

## 2. Formulario de Cotización con Validación de Límite de Ítems

```tsx
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { cotizacionSchema, type CotizacionFormData } from '@/lib/validations/ventas'
import { useItemLimit } from '@/hooks/use-item-limit'
import { ItemLimitWarning, ItemCountBadge } from '@/components/ventas'

export function CotizacionForm() {
  const [items, setItems] = useState<any[]>([])
  const { validation, canAddMore, warningMessage } = useItemLimit(items.length)

  const form = useForm<CotizacionFormData>({
    resolver: zodResolver(cotizacionSchema)
  })

  const handleAddItem = () => {
    if (!canAddMore) {
      toast.error(validation.message)
      return
    }

    setItems([...items, {
      producto_id: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0,
      subtotal: 0
    }])
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  return (
    <form>
      <div className="flex items-center justify-between mb-4">
        <h3>Productos</h3>
        <ItemCountBadge itemCount={items.length} />
      </div>

      <ItemLimitWarning itemCount={items.length} />

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              placeholder="Producto"
              value={item.descripcion}
              onChange={(e) => {
                const newItems = [...items]
                newItems[index].descripcion = e.target.value
                setItems(newItems)
              }}
            />
            <input
              type="number"
              placeholder="Cantidad"
              value={item.cantidad}
              onChange={(e) => {
                const newItems = [...items]
                newItems[index].cantidad = parseFloat(e.target.value)
                setItems(newItems)
              }}
            />
            <input
              type="number"
              placeholder="Precio"
              value={item.precio_unitario}
              onChange={(e) => {
                const newItems = [...items]
                newItems[index].precio_unitario = parseFloat(e.target.value)
                setItems(newItems)
              }}
            />
            <button type="button" onClick={() => handleRemoveItem(index)}>
              Eliminar
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAddItem}
        disabled={!canAddMore}
      >
        Agregar Producto
      </button>

      <button type="submit">Guardar Cotización</button>
    </form>
  )
}
```

## 3. Validación de Boleta sin RUC en Pedido

```tsx
'use client'

import { useMemo } from 'react'
import { useBoletaValidation } from '@/hooks/use-boleta-validation'
import { BoletaGREWarning, GRERequirementBadge } from '@/components/ventas'
import type { PedidoVenta } from '@/types/ventas'

interface PedidoDetailProps {
  pedido: PedidoVenta
}

export function PedidoDetail({ pedido }: PedidoDetailProps) {
  const { validation, warningMessage } = useBoletaValidation(
    pedido.cliente?.documento_tipo,
    pedido.total
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2>Pedido {pedido.numero}</h2>
        {validation.requiresGRE && (
          <GRERequirementBadge
            documentoTipo={pedido.cliente?.documento_tipo}
            total={pedido.total}
          />
        )}
      </div>

      <BoletaGREWarning
        documentoTipo={pedido.cliente?.documento_tipo}
        total={pedido.total}
      />

      {/* Resto del detalle del pedido */}
    </div>
  )
}
```

## 4. Validación de Certificado antes de Generar Factura

```tsx
'use client'

import { PreInvoiceValidation, CertificateValidationAlert } from '@/components/ventas'
import { Button } from '@/components/ui/button'

interface GenerarFacturaButtonProps {
  pedidoId: string
  onSuccess: () => void
}

export function GenerarFacturaButton({ pedidoId, onSuccess }: GenerarFacturaButtonProps) {
  const handleGenerateInvoice = async () => {
    try {
      const response = await fetch(`/api/ventas/pedidos/${pedidoId}/generar-factura`, {
        method: 'POST'
      })

      if (response.ok) {
        toast.success('Factura generada exitosamente')
        onSuccess()
      }
    } catch (error) {
      toast.error('Error al generar factura')
    }
  }

  return (
    <div className="space-y-4">
      {/* Mostrar estado del certificado */}
      <CertificateValidationAlert showOnlyErrors />

      {/* Botón con validación automática */}
      <PreInvoiceValidation
        onValidationSuccess={handleGenerateInvoice}
        onValidationFailure={() => {
          toast.error('No se puede generar la factura. Verifique el certificado digital.')
        }}
      >
        <Button>Generar Factura</Button>
      </PreInvoiceValidation>
    </div>
  )
}
```

## 5. Validación Completa en Página de Pedido

```tsx
'use client'

import { useState } from 'react'
import { useBoletaValidation } from '@/hooks/use-boleta-validation'
import { useCertificateValidation } from '@/hooks/use-certificate-validation'
import {
  BoletaGREWarning,
  CertificateValidationAlert,
  PreInvoiceValidation
} from '@/components/ventas'
import type { PedidoVenta } from '@/types/ventas'

interface PedidoPageProps {
  pedido: PedidoVenta
}

export function PedidoPage({ pedido }: PedidoPageProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  // Validación de boleta sin RUC
  const boletaValidation = useBoletaValidation(
    pedido.cliente?.documento_tipo,
    pedido.total
  )

  // Validación de certificado
  const certificateValidation = useCertificateValidation()

  const handleGenerateInvoice = async () => {
    setIsGenerating(true)
    try {
      const response = await fetch(`/api/ventas/pedidos/${pedido.id}/generar-factura`, {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()

        toast.success('Factura generada exitosamente')

        // Si requiere GRE, mostrar sugerencia
        if (data.sugerir_gre) {
          // Mostrar modal de GRE
        }
      }
    } catch (error) {
      toast.error('Error al generar factura')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1>Pedido {pedido.numero}</h1>

      {/* Información del pedido */}
      <div>
        <h2>Cliente</h2>
        <p>{pedido.cliente?.razon_social}</p>
        <p>{pedido.cliente?.documento_numero}</p>
      </div>

      {/* Advertencias */}
      <div className="space-y-4">
        {/* Advertencia de boleta sin RUC */}
        <BoletaGREWarning
          documentoTipo={pedido.cliente?.documento_tipo}
          total={pedido.total}
        />

        {/* Estado del certificado */}
        <CertificateValidationAlert showOnlyErrors />
      </div>

      {/* Acciones */}
      {pedido.estado === 'LISTO_FACTURAR' && (
        <PreInvoiceValidation onValidationSuccess={handleGenerateInvoice}>
          <Button disabled={isGenerating}>
            {isGenerating ? 'Generando...' : 'Generar Factura'}
          </Button>
        </PreInvoiceValidation>
      )}
    </div>
  )
}
```

## 6. Hook Personalizado para Validación Completa

```tsx
import { useMemo } from 'react'
import { useItemLimit } from '@/hooks/use-item-limit'
import { useBoletaValidation } from '@/hooks/use-boleta-validation'
import { useCertificateValidation } from '@/hooks/use-certificate-validation'
import type { TipoDocumento } from '@/types/ventas'

interface UseVentasValidationProps {
  itemCount: number
  documentoTipo?: TipoDocumento
  total: number
}

export function useVentasValidation({
  itemCount,
  documentoTipo,
  total
}: UseVentasValidationProps) {
  const itemLimit = useItemLimit(itemCount)
  const boletaValidation = useBoletaValidation(documentoTipo, total)
  const certificateValidation = useCertificateValidation()

  const hasErrors = useMemo(() => {
    return !itemLimit.validation.isValid ||
           !certificateValidation.canProceed
  }, [itemLimit.validation.isValid, certificateValidation.canProceed])

  const hasWarnings = useMemo(() => {
    return itemLimit.warningMessage !== null ||
           boletaValidation.warningMessage !== null ||
           certificateValidation.warningMessage !== null
  }, [
    itemLimit.warningMessage,
    boletaValidation.warningMessage,
    certificateValidation.warningMessage
  ])

  const canGenerateInvoice = useMemo(() => {
    return itemLimit.validation.isValid &&
           certificateValidation.canProceed
  }, [itemLimit.validation.isValid, certificateValidation.canProceed])

  return {
    itemLimit,
    boletaValidation,
    certificateValidation,
    hasErrors,
    hasWarnings,
    canGenerateInvoice
  }
}

// Uso:
const validation = useVentasValidation({
  itemCount: items.length,
  documentoTipo: cliente.documento_tipo,
  total: pedido.total
})

if (!validation.canGenerateInvoice) {
  // Mostrar errores
}
```

## 7. Validación en Tiempo Real

```tsx
'use client'

import { useEffect } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { validarDocumento, getMensajeErrorDocumento } from '@/lib/validations/ventas'
import { TipoDocumento } from '@/types/ventas'

export function DocumentoValidationField() {
  const { register, setError, clearErrors } = useFormContext()

  // Watch both fields
  const documentoTipo = useWatch({ name: 'documento_tipo' })
  const documentoNumero = useWatch({ name: 'documento_numero' })

  useEffect(() => {
    if (documentoTipo && documentoNumero) {
      const isValid = validarDocumento(documentoTipo as TipoDocumento, documentoNumero)

      if (!isValid) {
        setError('documento_numero', {
          type: 'manual',
          message: getMensajeErrorDocumento(documentoTipo as TipoDocumento)
        })
      } else {
        clearErrors('documento_numero')
      }
    }
  }, [documentoTipo, documentoNumero, setError, clearErrors])

  return (
    <div>
      <select {...register('documento_tipo')}>
        <option value={TipoDocumento.RUC}>RUC</option>
        <option value={TipoDocumento.DNI}>DNI</option>
      </select>

      <input
        {...register('documento_numero')}
        placeholder={
          documentoTipo === TipoDocumento.RUC
            ? '11 dígitos'
            : '8 dígitos'
        }
      />
    </div>
  )
}
```

## Notas Importantes

1. **Importar desde el índice:**
   ```typescript
   import { clienteSchema, validateItemLimit } from '@/lib/validations'
   import { ItemLimitWarning, BoletaGREWarning } from '@/components/ventas'
   ```

2. **Usar zodResolver con React Hook Form:**
   ```typescript
   import { zodResolver } from '@hookform/resolvers/zod'
   ```

3. **Validación progresiva:**
   - Formularios: Validación en tiempo real con Zod
   - Ítems: Validación al agregar productos
   - Boleta: Validación al calcular totales
   - Certificado: Validación antes de generar factura

4. **Mensajes de error claros:**
   Todos los mensajes incluyen:
   - Qué está mal
   - Por qué está mal
   - Cómo solucionarlo
