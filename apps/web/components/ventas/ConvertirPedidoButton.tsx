'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { ArrowRight, Loader2 } from 'lucide-react'

interface ConvertirPedidoButtonProps {
  cotizacionId: string
  onSuccess?: (pedidoId: string) => void
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
        toast({
          title: 'Éxito',
          description: 'Cotización convertida a pedido exitosamente'
        })
        
        // Call success callback with pedido ID
        if (onSuccess && response.data?.pedido_id) {
          onSuccess(response.data.pedido_id)
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
    setShowConfirmation(false)
  }

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={disabled || converting}
        className="bg-green-600 hover:bg-green-700"
      >
        {converting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Convirtiendo...
          </>
        ) : (
          <>
            <ArrowRight className="w-4 h-4 mr-2" />
            Convertir a Pedido
          </>
        )}
      </Button>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Convertir a Pedido
              </h3>
              <p className="text-gray-600 mb-6">
                ¿Está seguro de convertir esta cotización a pedido de venta? 
                Esta acción cambiará el estado de la cotización a "CONVERTIDA" y creará un nuevo pedido.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={converting}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConvert}
                  disabled={converting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {converting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Convirtiendo...
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
