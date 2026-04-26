'use client'

import { Package } from 'lucide-react'

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
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(value)
  }

  return (
    <div
      className={`py-3 ${
        showBorder ? 'border-b border-gray-100 last:border-b-0' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <Package className="w-5 h-5 text-gray-400" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-gray-900 text-sm">
                {descripcion}
              </h4>
              {producto_codigo && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Código: {producto_codigo}
                </p>
              )}
            </div>
            
            <div className="text-right flex-shrink-0">
              <p className="font-semibold text-gray-900 text-sm">
                {formatCurrency(subtotal)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Cantidad:</span>
              <span className="font-medium text-gray-900">{cantidad}</span>
            </div>
            
            <div className="flex items-center gap-1">
              <span className="text-gray-500">Precio Unit.:</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(precio_unitario)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
