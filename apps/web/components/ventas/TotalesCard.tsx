'use client'

import { Calculator } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTaxConfig } from '@/hooks/useTaxConfig'

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
  igvRate,
  className = ''
}: TotalesCardProps) {
  const { tasaIgv: defaultTasaIgv } = useTaxConfig()
  const effectiveIgvRate = igvRate ?? defaultTasaIgv
  const [calculatedSubtotal, setCalculatedSubtotal] = useState(0)
  const [calculatedIgv, setCalculatedIgv] = useState(0)
  const [calculatedTotal, setCalculatedTotal] = useState(0)

  useEffect(() => {
    if (autoCalculate && items.length > 0) {
      const subtotal = items.reduce(
        (sum, item) => sum + item.cantidad * item.precio_unitario,
        0
      )
      const igv = subtotal * effectiveIgvRate
      const total = subtotal + igv

      setCalculatedSubtotal(subtotal)
      setCalculatedIgv(igv)
      setCalculatedTotal(total)
    }
  }, [autoCalculate, items, effectiveIgvRate])

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
    <div className={`bg-muted/30 border border-border rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="w-5 h-5 text-foreground/80" />
        <h3 className="font-semibold text-foreground">Totales</h3>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/80">Subtotal:</span>
          <span className="font-medium text-foreground">
            {formatCurrency(subtotal)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/80">
            IGV ({Math.round(effectiveIgvRate * 100)}%):
          </span>
          <span className="font-medium text-foreground">
            {formatCurrency(igv)}
          </span>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Total:</span>
            <span className="font-bold text-xl text-primary">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
