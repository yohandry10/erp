'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { toast } from '@/components/ui/use-toast'
import { ArrowRight, Loader2, ShieldCheck, X } from 'lucide-react'

interface ConvertirPedidoButtonProps {
  cotizacionId: string
  onSuccess?: (pedidoId?: string, payload?: any) => void
  disabled?: boolean
}

export default function ConvertirPedidoButton({
  cotizacionId,
  onSuccess,
  disabled = false
}: ConvertirPedidoButtonProps) {
  const { post } = useApi()
  const [converting, setConverting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const handleConvert = async () => {
    try {
      setConverting(true)
      
      const response = await post(`/api/ventas/cotizaciones/${cotizacionId}/convertir-pedido`, {})
      
      if (response?.success) {
        const payload = response.data
        const pedidoId = payload?.pedido_id

        if (onSuccess) {
          onSuccess(pedidoId, payload)
        } else {
          toast({
            title: 'Éxito',
            description: 'Cotización convertida a pedido exitosamente'
          })
        }
      } else {
        throw new Error(response?.message || 'Error al convertir la cotización')
      }
    } catch (error: any) {
      console.error('Error converting cotización:', error)
      toast({
        title: 'Error',
        description: error.message || 'No se pudo convertir la cotización a pedido',
        variant: 'destructive'
      })
    } finally {
      setConverting(false)
      setShowConfirmation(false)
    }
  }

  const handleClick = () => {
    setShowConfirmation(true)
  }

  const handleCancel = () => {
    if (!converting) {
      setShowConfirmation(false)
    }
  }

  const isDisabled = disabled || converting

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        className={`btn btn-success ${isDisabled ? 'opacity-60' : ''}`}
      >
        {converting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Convirtiendo...
          </>
        ) : (
          <>
            <ArrowRight className="w-4 h-4" />
            Convertir a Pedido
          </>
        )}
      </button>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                <ShieldCheck className="w-5 h-5" />
                Confirmar conversión
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={handleCancel}
                disabled={converting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              <p className="text-gray-700 mb-4">
                ¿Está seguro de convertir esta cotización a pedido de venta? Esta acción cambiará el
                estado a <span className="font-semibold text-green-600">CONVERTIDA</span> y creará un nuevo pedido.
              </p>

              <div className="modal-info">
                <p>Al confirmar se realizará lo siguiente:</p>
                <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
                  <li>Generar un pedido vinculado a la cotización</li>
                  <li>Reservar stock disponible para cada ítem</li>
                  <li>Actualizar el estado histórico y auditoría</li>
                </ul>
              </div>

              <p className="text-sm text-gray-500">
                Esta acción no se puede deshacer automáticamente.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={handleCancel}
                disabled={converting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-success"
                onClick={handleConvert}
                disabled={converting}
              >
                {converting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Convirtiendo...
                  </>
                ) : (
                  'Confirmar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
