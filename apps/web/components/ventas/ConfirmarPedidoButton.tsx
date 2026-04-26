'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
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
  requiere_aprobacion?: boolean
  motivos?: string[]
  estado_credito?: string
}

interface ConfirmarPedidoButtonProps {
  pedidoId: string
  onSuccess: () => void
}

export default function ConfirmarPedidoButton({
  pedidoId,
  onSuccess
}: ConfirmarPedidoButtonProps) {
  const { post } = useApi({ throwOnError: true }) // dejamos toasts de useApi y re-lanzamos error
  const { hasPermission, loading: permissionLoading } = usePermission('ventas', 'confirmar', 'pedidos')
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showWarningDialog, setShowWarningDialog] = useState(false)
  const [warnings, setWarnings] = useState<StockWarning[]>([])
  const [confirming, setConfirming] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (permissionLoading) {
      return
    }

    if (!hasPermission) {
      // HARDENING: UI bloquea confirmación sin permiso.
      toast({
        title: 'Permiso requerido',
        description: 'No cuenta con el permiso ventas.pedidos.confirmar.',
        variant: 'destructive'
      })
      return
    }

    try {
      setConfirming(true)
      setShowConfirmDialog(false)
      
      const response: ConfirmarPedidoResponse = await post(
        `/ventas/pedidos/${pedidoId}/confirmar`,
        {}
      )

      if (response?.requiere_aprobacion) {
        toast({
          title: 'Pedido pendiente de aprobación',
          description: (() => {
            const mensajes: string[] = []
            if (response.motivos && response.motivos.length > 0) {
              mensajes.push(...response.motivos)
            }
            if (response.estado_credito) {
              mensajes.push(`Estado crédito: ${response.estado_credito}`)
            }
            return mensajes.length > 0
              ? mensajes.join(' • ')
              : 'El pedido requiere aprobación antes de confirmarse.'
          })(),
          variant: 'destructive'
        })
        onSuccess()
        return
      }
      
      if (response?.success) {
        // Check if there are stock warnings
        if (response.warnings && response.warnings.length > 0) {
          setWarnings(response.warnings)
          setShowWarningDialog(true)
          setLastError(null)
        } else {
          toast({
            title: 'Pedido confirmado',
            description: 'El pedido ha sido confirmado y el stock ha sido reservado',
          })
          setLastError(null)
          onSuccess()
        }
      } else {
        throw new Error(response?.message || 'Error al confirmar el pedido')
      }
    } catch (error: any) {
      console.error('Error confirming pedido:', error)
      const warnings = error?.data?.warnings
      if (warnings?.length) {
        setWarnings(warnings)
        setShowWarningDialog(true)
        setConfirming(false)
        setLastError(null)
        return
      }

      const errorMessage =
        error?.data?.message ||
        (typeof error?.message === 'string' ? error.message : null) ||
        'No se pudo confirmar el pedido'

      setLastError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
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
    setLastError(null)
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
      {lastError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {lastError}
        </div>
      )}

      <Button
        onClick={() => setShowConfirmDialog(true)}
        disabled={confirming || permissionLoading || !hasPermission}
        className="bg-green-600 hover:bg-green-700"
      >
        <CheckCircle className="w-4 h-4 mr-2" />
        {confirming ? 'Confirmando...' : 'Confirmar Pedido'}
      </Button>
      {!permissionLoading && !hasPermission && (
        <p className="mt-2 text-sm text-muted-foreground">
          {/* // HARDENING: la confirmación requiere permiso ventas.pedidos.confirmar. */}
          No tiene autorización para confirmar pedidos en este entorno.
        </p>
      )}

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
