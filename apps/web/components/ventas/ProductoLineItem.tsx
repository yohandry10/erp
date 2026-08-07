'use client'

import { Package } from 'lucide-react'
import { useCountryContext } from '@/hooks/use-country-context'

interface ProductoLineItemProps {
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  producto_codigo?: string
  showBorder?: boolean
}

export default function ProductoLineItem({
  descripcion,
  cantidad,
  precio_unitario,
  subtotal,
  producto_codigo,
  showBorder = true
}: ProductoLineItemProps) {
  const country = useCountryContext()
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(country.locale || 'es-PE', {
      style: 'currency',
      currency: country.moneda
    }).format(value)
  }

  return (
    <div
      className={`py-3 ${
        showBorder ? 'border-b border-border last:border-b-0' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <Package className="w-5 h-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground text-sm">
                {descripcion}
              </h4>
              {producto_codigo && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Código: {producto_codigo}
                </p>
              )}
            </div>

            <div className="text-right flex-shrink-0">
              <p className="font-semibold text-foreground text-sm">
                {formatCurrency(subtotal)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-foreground/80">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Cantidad:</span>
              <span className="font-medium text-foreground">{cantidad}</span>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Precio Unit.:</span>
              <span className="font-medium text-foreground">
                {formatCurrency(precio_unitario)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
