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
import { CheckCircle } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface StockWarning {
  producto_id: string
  producto_nombre?: string
  disponible: number
  solicitado: number
}

interface ConfirmarPedidoResponse {
  success: boolean
  confirmado?: boolean
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
        setLastError(null)
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
        })
        onSuccess()
        return
      }

      if (response?.success) {
        toast({
          title: 'Pedido confirmado',
          description: 'El pedido ha sido confirmado y el stock ha sido reservado',
        })
        setLastError(null)
        onSuccess()
      } else {
        throw new Error(response?.message || 'Error al confirmar el pedido')
      }
    } catch (error: any) {
      console.error('Error confirming pedido:', error)
      const warnings = error?.data?.warnings
      if (warnings?.length) {
        const detalle = warnings
          .map((warning: StockWarning) =>
            `${warning.producto_nombre || warning.producto_id}: disponible ${warning.disponible}, solicitado ${warning.solicitado}`,
          )
          .join(' • ')
        setLastError(`Stock insuficiente. ${detalle}`)
        toast({ title: 'Stock insuficiente', description: detalle, variant: 'destructive' })
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

  return (
    <>
      {lastError && (
        <div className="mb-3 rounded-md border border-red-200 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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

    </>
  )
}
