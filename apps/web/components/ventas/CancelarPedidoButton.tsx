'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { XCircle } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface CancelarPedidoButtonProps {
  pedidoId: string
  onSuccess: () => void
  hasPhysicalDispatch?: boolean
}

export default function CancelarPedidoButton({
  pedidoId,
  onSuccess,
  hasPhysicalDispatch = false,
}: CancelarPedidoButtonProps) {
  const { post } = useApi()

  const [showDialog, setShowDialog] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState('')
  const [confirmPhysicalReturn, setConfirmPhysicalReturn] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  const handleCancel = async () => {
    if (!motivo.trim()) {
      setError('Debe ingresar un motivo de cancelación')
      return
    }
    if (hasPhysicalDispatch && !confirmPhysicalReturn) {
      setError('Debe confirmar que la mercadería despachada retornó físicamente al almacén')
      return
    }

    try {
      setCanceling(true)
      setError('')

      const response = await post(
        `/ventas/pedidos/${pedidoId}/cancelar`,
        {
          motivo,
          confirmar_retorno_fisico: hasPhysicalDispatch && confirmPhysicalReturn,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )

      if (response?.success) {
        toast({
          title: 'Pedido cancelado',
          description: 'El pedido ha sido cancelado y el stock ha sido liberado',
        })
        setShowDialog(false)
        setMotivo('')
        setConfirmPhysicalReturn(false)
        setIdempotencyKey('')
        onSuccess()
      } else {
        throw new Error(response?.message || 'Error al cancelar el pedido')
      }
    } catch (error: any) {
      console.error('Error canceling pedido:', error)
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cancelar el pedido',
        variant: 'destructive'
      })
    } finally {
      setCanceling(false)
    }
  }

  const handleOpenDialog = () => {
    setMotivo('')
    setConfirmPhysicalReturn(false)
    setError('')
    setIdempotencyKey(
      globalThis.crypto?.randomUUID?.()
        ?? `pedido-cancel-${pedidoId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    setShowDialog(true)
  }

  return (
    <>
      <Button
        onClick={handleOpenDialog}
        variant="destructive"
      >
        <XCircle className="w-4 h-4 mr-2" />
        Cancelar Pedido
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Pedido</DialogTitle>
            <DialogDescription>
              {hasPhysicalDispatch
                ? 'El pedido tiene mercadería despachada. La cancelación registrará su retorno físico al almacén antes de liberar reservas.'
                : '¿Está seguro que desea cancelar este pedido? Esta acción liberará el stock reservado.'}
            </DialogDescription>
          </DialogHeader>

          <div className="my-4">
            <label className="block text-sm font-medium text-foreground/85 mb-2">
              Motivo de cancelación *
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value)
                setError('')
              }}
              placeholder="Ingrese el motivo de la cancelación..."
              rows={4}
              className={error ? 'border-red-500' : ''}
            />
            {error && (
              <p className="text-sm text-destructive mt-1">{error}</p>
            )}
            {hasPhysicalDispatch && (
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmPhysicalReturn}
                  onChange={(event) => {
                    setConfirmPhysicalReturn(event.target.checked)
                    setError('')
                  }}
                />
                <span>
                  Confirmo que toda la mercadería despachada de este pedido fue recibida nuevamente en el almacén de origen.
                </span>
              </label>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={canceling}
            >
              Cerrar
            </Button>
            <Button
              onClick={handleCancel}
              disabled={canceling}
              variant="destructive"
            >
              {canceling ? 'Cancelando...' : 'Confirmar Cancelación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
