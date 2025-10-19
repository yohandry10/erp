'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'
import { Truck, AlertTriangle, X } from 'lucide-react'

interface ConfirmarDespachoButtonProps {
  pedidoId: string
  pedidoNumero: string
  onSuccess?: () => void
}

export function ConfirmarDespachoButton({ 
  pedidoId, 
  pedidoNumero, 
  onSuccess 
}: ConfirmarDespachoButtonProps) {
  const { post } = useApi()
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleConfirmar = async () => {
    try {
      setLoading(true)
      
      const response = await post(`/inventario/logistica/${pedidoId}/confirmar-despacho`)

      if (response?.success) {
        toast({
          title: 'Despacho Confirmado',
          description: `El pedido ${pedidoNumero} ha sido despachado exitosamente`,
        })
        setShowConfirmModal(false)
        onSuccess?.()
      } else {
        throw new Error('Error al confirmar despacho')
      }
    } catch (error) {
      console.error('Error confirming despacho:', error)
      toast({
        title: 'Error',
        description: 'No se pudo confirmar el despacho',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={() => setShowConfirmModal(true)}
        className="bg-green-600 hover:bg-green-700"
        size="sm"
      >
        <Truck className="w-4 h-4 mr-1" />
        Confirmar Despacho
      </Button>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Confirmar Despacho
                </h2>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={loading}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                ¿Estás seguro de que deseas confirmar el despacho del pedido{' '}
                <span className="font-semibold">{pedidoNumero}</span>?
              </p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Esta acción:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>Descontará el stock real de los productos</li>
                  <li>Liberará las reservas de inventario</li>
                  <li>Cambiará el estado a "Listo para Facturar"</li>
                  <li>Notificará al área de ventas</li>
                </ul>
              </div>

              <p className="text-sm text-gray-500">
                Esta acción no se puede deshacer.
              </p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
              <Button
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmar}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4 mr-2" />
                    Confirmar Despacho
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
