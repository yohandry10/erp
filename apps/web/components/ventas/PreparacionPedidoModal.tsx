'use client'

import { useState } from 'react'
import { PedidoVenta, PedidoDetalle } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'
import { X, Package, CheckCircle } from 'lucide-react'

interface PreparacionPedidoModalProps {
  pedido: PedidoVenta
  onClose: () => void
  onSuccess: () => void
}

export function PreparacionPedidoModal({ pedido, onClose, onSuccess }: PreparacionPedidoModalProps) {
  const { post } = useApi()
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)

  const handleToggleItem = (itemId: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }))
  }

  const handleMarcarListo = async () => {
    try {
      setLoading(true)
      
      const response = await post(`/inventario/logistica/${pedido.id}/preparar`, {
        items_preparados: Object.keys(checkedItems).filter(id => checkedItems[id])
      })

      if (response?.success) {
        toast({
          title: 'Éxito',
          description: 'Pedido marcado como listo para preparación',
        })
        onSuccess()
        onClose()
      } else {
        throw new Error('Error al marcar pedido como listo')
      }
    } catch (error) {
      console.error('Error marking pedido as ready:', error)
      toast({
        title: 'Error',
        description: 'No se pudo marcar el pedido como listo',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const allItemsChecked = pedido.detalle?.every(item => checkedItems[item.id]) || false
  const someItemsChecked = pedido.detalle?.some(item => checkedItems[item.id]) || false

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Preparar Pedido {pedido.numero}
              </h2>
              <p className="text-sm text-gray-500">
                Cliente: {pedido.cliente?.razon_social}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Marca los productos que has preparado. Una vez que todos estén listos, 
              podrás marcar el pedido como preparado.
            </p>
          </div>

          {/* Items List */}
          <div className="space-y-3">
            {pedido.detalle?.map((item: PedidoDetalle) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Checkbox
                  id={`item-${item.id}`}
                  checked={checkedItems[item.id] || false}
                  onCheckedChange={() => handleToggleItem(item.id)}
                  className="mt-1"
                />
                <label
                  htmlFor={`item-${item.id}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {item.descripcion}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Cantidad: <span className="font-medium">{item.cantidad}</span>
                      </p>
                    </div>
                    {checkedItems[item.id] && (
                      <CheckCircle className="w-5 h-5 text-green-600 ml-2" />
                    )}
                  </div>
                </label>
              </div>
            ))}
          </div>

          {/* Progress Indicator */}
          {someItemsChecked && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                {Object.values(checkedItems).filter(Boolean).length} de {pedido.detalle?.length || 0} ítems preparados
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleMarcarListo}
            disabled={!allItemsChecked || loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Marcar como Listo
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
