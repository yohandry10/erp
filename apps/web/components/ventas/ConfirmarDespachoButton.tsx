'use client'

import { useState } from 'react'
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
      <button
        type="button"
        onClick={() => setShowConfirmModal(true)}
        className="btn btn-success btn-sm"
        disabled={loading}
      >
        <Truck className="w-4 h-4" />
        Confirmar Despacho
      </button>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">
                <AlertTriangle className="w-5 h-5" />
                Confirmar Despacho
              </h2>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="modal-close"
                disabled={loading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              <p className="text-gray-700 mb-4">
                ¿Estás seguro de que deseas confirmar el despacho del pedido{' '}
                <span className="font-semibold">{pedidoNumero}</span>?
              </p>
              
              <div className="modal-info">
                <p><strong>Esta acción realizará lo siguiente:</strong></p>
                <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
                  <li>Descontará el stock real de los productos</li>
                  <li>Liberará las reservas de inventario</li>
                  <li>Cambiará el estado a "Listo para Facturar"</li>
                  <li>Notificará al equipo de ventas</li>
                </ul>
              </div>

              <p className="text-sm text-gray-500">
                Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-success"
                onClick={handleConfirmar}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4" />
                    Confirmar Despacho
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
