'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface StockWarning {
  producto_id: string
  producto_nombre?: string
  disponible: number
  solicitado: number
}

interface ConfirmarPedidoResponse {
  success: boolean
  warnings?: StockWarning[]
  message?: string
}

interface ConfirmarPedidoButtonProps {
  pedidoId: string
  onSuccess: () => void
}

export default function ConfirmarPedidoButton({
  pedidoId,
  onSuccess
}: ConfirmarPedidoButtonProps) {
  const { post } = useApi()
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showWarningDialog, setShowWarningDialog] = useState(false)
  const [warnings, setWarnings] = useState<StockWarning[]>([])
  const [confirming, setConfirming] = useState(false)

  const handleConfirm = async () => {
    try {
      setConfirming(true)
      setShowConfirmDialog(false)
      
      const response: ConfirmarPedidoResponse = await post(
        `/ventas/pedidos/${pedidoId}/confirmar`,
        {}
      )
      
      if (response?.success) {
        // Check if there are stock warnings
        if (response.warnings && response.warnings.length > 0) {
          setWarnings(response.warnings)
          setShowWarningDialog(true)
        } else {
          toast({
            title: 'Pedido confirmado',
            description: 'El pedido ha sido confirmado y el stock ha sido reservado',
          })
          onSuccess()
        }
      } else {
        throw new Error(response?.message || 'Error al confirmar el pedido')
      }
    } catch (error: any) {
      console.error('Error confirming pedido:', error)
      toast({
        title: 'Error',
        description: error.message || 'No se pudo confirmar el pedido',
        variant: 'destructive'
      })
    } finally {
      setConfirming(false)
    }
  }

  const handleContinueWithWarnings = () => {
    setShowWarningDialog(false)
    toast({
      title: 'Pedido confirmado con advertencias',
      description: 'El pedido ha sido confirmado a pesar de las advertencias de stock',
    })
    onSuccess()
  }

  const handleCancelWithWarnings = () => {
    setShowWarningDialog(false)
    toast({
      title: 'Confirmación cancelada',
      description: 'El pedido no ha sido confirmado',
      variant: 'destructive'
    })
  }

  return (
    <>
      <Button
        onClick={() => setShowConfirmDialog(true)}
        disabled={confirming}
        className="bg-green-600 hover:bg-green-700"
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        {confirming ? 'Confirmando...' : 'Confirmar Pedido'}
      </Button>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pedido</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea confirmar este pedido? Se reservará el stock de los productos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={confirming}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Warning Dialog */}
      <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-5 h-5" />
              Advertencia de Stock Insuficiente
            </DialogTitle>
            <DialogDescription>
              Algunos productos no tienen stock suficiente. ¿Desea continuar de todas formas?
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-sm text-yellow-800 mb-3">
                Productos con stock insuficiente:
              </h4>
              <div className="space-y-2">
                {warnings.map((warning, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center text-sm bg-white p-3 rounded border border-yellow-100"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {warning.producto_nombre || `Producto ${warning.producto_id}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-600">
                        Disponible: <span className="font-semibold text-red-600">{warning.disponible}</span>
                      </p>
                      <p className="text-gray-600">
                        Solicitado: <span className="font-semibold">{warning.solicitado}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelWithWarnings}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleContinueWithWarnings}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              Continuar de todas formas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
