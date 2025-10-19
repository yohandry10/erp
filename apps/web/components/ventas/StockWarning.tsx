'use client'

import { AlertTriangle, Package } from 'lucide-react'

interface StockWarningItem {
  producto_id: string
  producto_nombre?: string
  producto_codigo?: string
  disponible: number
  solicitado: number
}

interface StockWarningProps {
  warnings: StockWarningItem[]
  allowContinue?: boolean
}

export default function StockWarning({
  warnings,
  allowContinue = true
}: StockWarningProps) {
  if (!warnings || warnings.length === 0) {
    return null
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-yellow-800 mb-2">
            Stock Insuficiente
          </h3>
          <p className="text-sm text-yellow-700 mb-3">
            Los siguientes productos no tienen stock suficiente para completar el pedido:
          </p>
          
          <div className="space-y-2">
            {warnings.map((warning, index) => (
              <div
                key={index}
                className="bg-white border border-yellow-100 rounded-md p-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2 flex-1">
                    <Package className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {warning.producto_nombre || `Producto ${warning.producto_id}`}
                      </p>
                      {warning.producto_codigo && (
                        <p className="text-xs text-gray-500">
                          Código: {warning.producto_codigo}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm">
                      <span className="text-gray-600">Disponible: </span>
                      <span className="font-semibold text-red-600">
                        {warning.disponible}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">Solicitado: </span>
                      <span className="font-semibold text-gray-900">
                        {warning.solicitado}
                      </span>
                    </div>
                    <div className="text-xs text-red-600 font-medium mt-1">
                      Faltante: {warning.solicitado - warning.disponible}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {allowContinue && (
            <div className="mt-3 pt-3 border-t border-yellow-200">
              <p className="text-sm text-yellow-700">
                ℹ️ Puede continuar con el pedido de todas formas. El sistema registrará la advertencia.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
