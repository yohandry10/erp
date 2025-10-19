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
}

export default function CancelarPedidoButton({
  pedidoId,
  onSuccess
}: CancelarPedidoButtonProps) {
  const { post } = useApi()
  
  const [showDialog, setShowDialog] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState('')

  const handleCancel = async () => {
    if (!motivo.trim()) {
      setError('Debe ingresar un motivo de cancelación')
      return
    }

    try {
      setCanceling(true)
      setError('')
      
      const response = await post(
        `/ventas/pedidos/${pedidoId}/cancelar`,
        { motivo }
      )
      
      if (response?.success) {
        toast({
          title: 'Pedido cancelado',
          description: 'El pedido ha sido cancelado y el stock ha sido liberado',
        })
        setShowDialog(false)
        setMotivo('')
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
    setError('')
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
              ¿Está seguro que desea cancelar este pedido? Esta acción liberará el stock reservado.
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
              <p className="text-sm text-red-600 mt-1">{error}</p>
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
