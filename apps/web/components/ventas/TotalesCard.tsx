'use client'

import { Calculator } from 'lucide-react'
import { useEffect, useState } from 'react'

interface TotalesCardProps {
  subtotal?: number
  igv?: number
  total?: number
  autoCalculate?: boolean
  items?: Array<{ cantidad: number; precio_unitario: number }>
  igvRate?: number
  className?: string
}

export default function TotalesCard({
  subtotal: propSubtotal,
  igv: propIgv,
  total: propTotal,
  autoCalculate = false,
  items = [],
  igvRate = 0.18,
  className = ''
}: TotalesCardProps) {
  const [calculatedSubtotal, setCalculatedSubtotal] = useState(0)
  const [calculatedIgv, setCalculatedIgv] = useState(0)
  const [calculatedTotal, setCalculatedTotal] = useState(0)

  useEffect(() => {
    if (autoCalculate && items.length > 0) {
      const subtotal = items.reduce(
        (sum, item) => sum + item.cantidad * item.precio_unitario,
        0
      )
      const igv = subtotal * igvRate
      const total = subtotal + igv

      setCalculatedSubtotal(subtotal)
      setCalculatedIgv(igv)
      setCalculatedTotal(total)
    }
  }, [autoCalculate, items, igvRate])

  const subtotal = autoCalculate ? calculatedSubtotal : (propSubtotal ?? 0)
  const igv = autoCalculate ? calculatedIgv : (propIgv ?? 0)
  const total = autoCalculate ? calculatedTotal : (propTotal ?? 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-900">Totales</h3>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Subtotal:</span>
          <span className="font-medium text-gray-900">
            {formatCurrency(subtotal)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            IGV ({Math.round(igvRate * 100)}%):
          </span>
          <span className="font-medium text-gray-900">
            {formatCurrency(igv)}
          </span>
        </div>

        <div className="pt-2 border-t border-gray-300">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-900">Total:</span>
            <span className="font-bold text-xl text-blue-600">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
